use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use floem::text::{Attrs, AttrsList};
use floem::views::editor::text::Styling;
use floem::views::editor::id::EditorId;
use floem::views::editor::EditorStyle;
use tree_sitter::{Query, QueryCursor, StreamingIterator};

use coretrace_ctrace::Diagnostic;
use coretrace_lsp::Diagnostic as LspDiagnostic;

use super::colors::{color_for_capture, color_for_lsp_severity, color_for_severity};
use super::language::language_for;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

struct Span {
    start: usize,
    end: usize,
    color: floem::peniko::Color,
    /// Diagnostic spans are bolded as well as recolored. `Attrs` in
    /// cosmic-text 0.12 exposes only color/weight/style -- there is no
    /// background or underline -- so weight is the one extra axis
    /// available to make a marker stand out from ordinary syntax color.
    bold: bool,
}

/// A `Styling` impl that colors text using a tree-sitter parse of the
/// document's *initial* content. Parsed once at editor-open time, not
/// re-parsed as the document changes -- live re-highlighting on edit is
/// out of Phase 1's scope (no LSP/incremental reparse yet), see
/// native/docs/phase1-status.md.
pub struct TreeSitterStyling {
    id: u64,
    line_starts: Vec<usize>,
    spans: Vec<Span>,
}

impl TreeSitterStyling {
    /// Spans override the syntax color at each
    /// diagnostic's reported location -- the inline marker for ctrace
    /// findings. Diagnostic spans are appended after syntax spans so
    /// `apply_attr_styles` (which applies them in order) lets them win.
    pub fn with_diagnostics(
        path: &Path,
        text: &str,
        diagnostics: &[Diagnostic],
        lsp_diagnostics: &[LspDiagnostic],
    ) -> Self {
        let starts = line_starts(text);
        let mut spans = parse_spans(path, text).unwrap_or_default();
        spans.extend(diagnostic_spans(&starts, text, diagnostics));
        spans.extend(lsp_diagnostic_spans(&starts, text, lsp_diagnostics));

        Self {
            id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
            line_starts: starts,
            spans,
        }
    }
}

fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// Chooses the byte range to mark for a diagnostic reported at `point`.
///
/// ctrace reports a diagnostic as a single point (start == end), so a
/// literal one-character marker was effectively invisible in an already
/// syntax-colored file -- which is what the review reported. Two cases:
///
/// - The point lands inside an identifier: mark that whole identifier,
///   which is both findable and precise about what it refers to.
/// - The point lands on whitespace or punctuation (ctrace often reports
///   column 1, i.e. the indentation): fall back to the line's trimmed
///   content, so the line is still visibly flagged.
fn marker_span(text: &str, line_start: usize, line_end: usize, point: usize) -> Option<(usize, usize)> {
    let bytes = text.as_bytes();
    if point < bytes.len() && is_word_byte(bytes[point]) {
        let mut start = point;
        while start > line_start && is_word_byte(bytes[start - 1]) {
            start -= 1;
        }
        let mut end = point + 1;
        while end < line_end.min(bytes.len()) && is_word_byte(bytes[end]) {
            end += 1;
        }
        return Some((start, end));
    }

    let line = text.get(line_start..line_end.min(text.len()))?;
    let trimmed = line.trim_end_matches(['\n', '\r']);
    let leading = trimmed.len() - trimmed.trim_start().len();
    let content_end = line_start + trimmed.trim_end().len();
    let content_start = line_start + leading;
    (content_start < content_end).then_some((content_start, content_end))
}

#[cfg(test)]
mod marker_tests {
    use super::marker_span;

    #[test]
    fn marks_the_identifier_the_point_lands_in() {
        let text = "    printf(input);\n";
        // point on the 'n' of "input"
        let point = text.find("input").unwrap() + 1;
        let (s, e) = marker_span(text, 0, text.len(), point).unwrap();
        assert_eq!(&text[s..e], "input");
    }

    #[test]
    fn falls_back_to_line_content_when_the_point_is_whitespace() {
        // ctrace commonly reports column 1, which is indentation.
        let text = "    char user_input[100];\n";
        let (s, e) = marker_span(text, 0, text.len(), 0).unwrap();
        assert_eq!(&text[s..e], "char user_input[100];");
    }

    #[test]
    fn does_not_run_past_the_end_of_its_line() {
        let text = "ab\ncd\n";
        let (s, e) = marker_span(text, 0, 3, 0).unwrap();
        assert_eq!(&text[s..e], "ab");
    }

    #[test]
    fn returns_nothing_for_a_blank_line() {
        let text = "   \n";
        assert_eq!(marker_span(text, 0, text.len(), 0), None);
    }
}

/// Same idea as `diagnostic_spans`, but for LSP diagnostics: 0-based
/// (line, character) positions and a real start..end range rather than
/// a single-character point.
fn lsp_diagnostic_spans(line_starts: &[usize], text: &str, diagnostics: &[LspDiagnostic]) -> Vec<Span> {
    let byte_offset = |line: u32, character: u32| -> Option<usize> {
        let line_start = *line_starts.get(line as usize)?;
        let line_end = line_starts.get(line as usize + 1).copied().unwrap_or(text.len());
        Some((line_start + character as usize).min(line_end))
    };
    diagnostics
        .iter()
        .filter_map(|d| {
            let start = byte_offset(d.range.start.line, d.range.start.character)?;
            let end = byte_offset(d.range.end.line, d.range.end.character)?;
            (start < end).then(|| Span {
                start,
                end,
                color: color_for_lsp_severity(d.severity),
                bold: true,
            })
        })
        .collect()
}

/// Converts each diagnostic's 1-based (line, column) location to a byte
/// span within `text`. Columns are treated as character counts (ASCII
/// assumption -- ctrace's own column numbers come from parsing C/C++
/// source, which is overwhelmingly ASCII in practice).
fn diagnostic_spans(line_starts: &[usize], text: &str, diagnostics: &[Diagnostic]) -> Vec<Span> {
    diagnostics
        .iter()
        .filter_map(|d| {
            let line_idx = d.location.start_line.checked_sub(1)? as usize;
            let line_start = *line_starts.get(line_idx)?;
            let line_end = line_starts.get(line_idx + 1).copied().unwrap_or(text.len());
            let col = d.location.start_column.saturating_sub(1) as usize;
            let point = (line_start + col).min(line_end.saturating_sub(1));
            let (start, end) = marker_span(text, line_start, line_end, point)?;
            Some(Span { start, end, color: color_for_severity(&d.severity), bold: true })
        })
        .collect()
}

fn line_starts(text: &str) -> Vec<usize> {
    let mut starts = vec![0];
    starts.extend(
        text.bytes()
            .enumerate()
            .filter(|(_, b)| *b == b'\n')
            .map(|(i, _)| i + 1),
    );
    starts
}

fn parse_spans(path: &Path, text: &str) -> Option<Vec<Span>> {
    let (language, query_src) = language_for(path)?;

    let mut parser = tree_sitter::Parser::new();
    parser.set_language(&language).ok()?;
    let tree = parser.parse(text, None)?;
    let query = Query::new(&language, query_src).ok()?;
    let names = query.capture_names();

    let mut cursor = QueryCursor::new();
    let mut matches = cursor.matches(&query, tree.root_node(), text.as_bytes());
    let mut spans = Vec::new();
    while let Some(m) = matches.next() {
        for capture in m.captures {
            let Some(color) = color_for_capture(names[capture.index as usize]) else {
                continue;
            };
            let range = capture.node.byte_range();
            spans.push(Span { start: range.start, end: range.end, color, bold: false });
        }
    }
    Some(spans)
}

impl Styling for TreeSitterStyling {
    fn id(&self) -> u64 {
        self.id
    }

    fn apply_attr_styles(
        &self,
        _edid: EditorId,
        _style: &EditorStyle,
        line: usize,
        default: Attrs,
        attrs: &mut AttrsList,
    ) {
        let Some(&line_start) = self.line_starts.get(line) else {
            return;
        };
        let line_end = self.line_starts.get(line + 1).copied().unwrap_or(usize::MAX);

        for span in &self.spans {
            if span.end <= line_start || span.start >= line_end {
                continue;
            }
            let start = span.start.max(line_start) - line_start;
            let end = span.end.min(line_end) - line_start;
            if start < end {
                let mut attr = default.color(span.color);
                if span.bold {
                    attr = attr.weight(floem::text::Weight::BOLD);
                }
                attrs.add_span(start..end, attr);
            }
        }
    }
}
