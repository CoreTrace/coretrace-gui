use std::path::Path;

use tree_sitter::{Query, QueryCursor, StreamingIterator};

use coretrace_ctrace::Diagnostic;
use coretrace_lsp::Diagnostic as LspDiagnostic;

use super::colors::{color_for_capture, color_for_lsp_severity, color_for_severity};
use super::language::language_for;

/// A styled byte range within the whole document.
pub struct Span {
    pub start: usize,
    pub end: usize,
    /// `None` means "keep whatever color is already there". Diagnostic
    /// markers that cover a whole line use this: recoloring the line
    /// would wipe out its syntax highlighting, which is exactly what
    /// made highlighting look inconsistent from line to line.
    pub color: Option<floem::peniko::Color>,
    /// Diagnostic spans are bolded as well as recolored. `Attrs` in
    /// cosmic-text 0.12 exposes only color/weight/style -- there is no
    /// background or underline -- so weight is the one extra axis
    /// available to make a marker stand out from ordinary syntax color.
    pub bold: bool,
}

/// Byte offset of the start of each line.
pub fn line_starts(text: &str) -> Vec<usize> {
    let mut starts = vec![0];
    starts.extend(
        text.bytes()
            .enumerate()
            .filter(|(_, b)| *b == b'\n')
            .map(|(i, _)| i + 1),
    );
    starts
}

/// Every span for a document: syntax first, then diagnostics on top.
/// Order matters -- `apply_attr_styles` applies spans in sequence, so
/// the later diagnostic spans win over the syntax colors underneath.
pub fn build(
    path: &Path,
    text: &str,
    diagnostics: &[Diagnostic],
    lsp_diagnostics: &[LspDiagnostic],
) -> (Vec<usize>, Vec<Span>) {
    let starts = line_starts(text);
    let mut spans = syntax_spans(path, text).unwrap_or_default();
    spans.extend(diagnostic_spans(&starts, text, diagnostics));
    spans.extend(lsp_diagnostic_spans(&starts, text, lsp_diagnostics));
    (starts, spans)
}

fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// What a diagnostic reported at `point` should mark, and whether that
/// marker is precise.
///
/// ctrace reports a diagnostic as a single point (start == end), so a
/// literal one-character marker was effectively invisible in an already
/// syntax-colored file. Two cases:
///
/// - The point lands inside an identifier: mark that whole identifier.
///   This is precise, so it earns a color override.
/// - The point lands on whitespace or punctuation (ctrace often reports
///   column 1, i.e. the indentation): fall back to the line's trimmed
///   content so the line is still flagged. This is *not* precise --
///   it covers keywords, strings and numbers alike -- so the caller
///   bolds it without recoloring, leaving syntax highlighting intact.
pub fn marker_span(
    text: &str,
    line_start: usize,
    line_end: usize,
    point: usize,
) -> Option<(usize, usize, bool)> {
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
        return Some((start, end, true));
    }

    let line = text.get(line_start..line_end.min(text.len()))?;
    let trimmed = line.trim_end_matches(['\n', '\r']);
    let leading = trimmed.len() - trimmed.trim_start().len();
    let content_end = line_start + trimmed.trim_end().len();
    let content_start = line_start + leading;
    (content_start < content_end).then_some((content_start, content_end, false))
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
            let (start, end, precise) = marker_span(text, line_start, line_end, point)?;
            Some(Span {
                start,
                end,
                color: precise.then(|| color_for_severity(&d.severity)),
                bold: true,
            })
        })
        .collect()
}

/// Same idea, but for LSP diagnostics: 0-based (line, character)
/// positions and a real start..end range rather than a single point.
/// These are always precise, so they always recolor.
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
                color: Some(color_for_lsp_severity(d.severity)),
                bold: true,
            })
        })
        .collect()
}

fn syntax_spans(path: &Path, text: &str) -> Option<Vec<Span>> {
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
            spans.push(Span { start: range.start, end: range.end, color: Some(color), bold: false });
        }
    }
    Some(spans)
}

#[cfg(test)]
mod tests {
    use super::{build, line_starts, marker_span};
    use std::path::PathBuf;

    #[test]
    fn marks_the_identifier_the_point_lands_in() {
        let text = "    printf(input);\n";
        // point on the 'n' of "input"
        let point = text.find("input").unwrap() + 1;
        let (s, e, precise) = marker_span(text, 0, text.len(), point).unwrap();
        assert_eq!(&text[s..e], "input");
        assert!(precise, "an identifier hit is precise enough to recolor");
    }

    #[test]
    fn falls_back_to_line_content_when_the_point_is_whitespace() {
        // ctrace commonly reports column 1, which is indentation.
        let text = "    char user_input[100];\n";
        let (s, e, precise) = marker_span(text, 0, text.len(), 0).unwrap();
        assert_eq!(&text[s..e], "char user_input[100];");
        assert!(!precise, "a whole-line marker must not recolor the line");
    }

    #[test]
    fn does_not_run_past_the_end_of_its_line() {
        let text = "ab\ncd\n";
        let (s, e, _) = marker_span(text, 0, 3, 0).unwrap();
        assert_eq!(&text[s..e], "ab");
    }

    #[test]
    fn returns_nothing_for_a_blank_line() {
        assert!(marker_span("   \n", 0, 4, 0).is_none());
    }

    #[test]
    fn line_starts_follow_crlf_endings() {
        // Real C sources on Windows are CRLF; the \r belongs to the
        // line it terminates, so the next line starts after the \n.
        assert_eq!(line_starts("a\r\nbb\r\n"), vec![0, 3, 7]);
    }

    #[test]
    fn spans_stay_inside_the_text_with_multibyte_characters() {
        // A non-ASCII character makes byte offsets and character
        // offsets diverge; every span must still be a valid byte range
        // or slicing the text would panic at render time.
        let text = "int main() {\n  printf(\"chaîne\");\n}\n";
        let (_, spans) = build(&PathBuf::from("a.c"), text, &[], &[]);
        assert!(!spans.is_empty(), "C source should produce syntax spans");
        for span in &spans {
            assert!(
                text.get(span.start..span.end).is_some(),
                "span {}..{} is not a character boundary",
                span.start,
                span.end
            );
        }
    }
}
