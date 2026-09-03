use std::path::Path;
use std::rc::Rc;
use std::sync::atomic::{AtomicU64, Ordering};

use floem::reactive::{RwSignal, Scope, SignalGet, SignalUpdate, SignalWith};
use floem::text::{Attrs, AttrsList};
use floem::views::editor::id::EditorId;
use floem::views::editor::text::Styling;
use floem::views::editor::EditorStyle;

use coretrace_ctrace::Diagnostic;
use coretrace_lsp::Diagnostic as LspDiagnostic;

use super::spans::{self, Span};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// One immutable snapshot of a document's highlighting.
struct Highlights {
    id: u64,
    line_starts: Vec<usize>,
    spans: Vec<Span>,
}

impl Highlights {
    fn build(path: &Path, text: &str, diagnostics: &[Diagnostic], lsp: &[LspDiagnostic]) -> Self {
        let (line_starts, spans) = spans::build(path, text, diagnostics, lsp);
        Self { id: NEXT_ID.fetch_add(1, Ordering::Relaxed), line_starts, spans }
    }
}

/// A `Styling` impl that colors text from a tree-sitter parse.
///
/// The snapshot lives behind a signal so it can be replaced as the
/// document changes. It used to be parsed exactly once, at editor-open
/// time: after that, every insertion shifted the real text out from
/// under fixed byte offsets, so colors drifted further out of place the
/// further down the file you looked -- keywords painted across the
/// middle of identifiers. Call `refresh` whenever the text or the
/// diagnostics change.
#[derive(Clone, Copy)]
pub struct TreeSitterStyling {
    current: RwSignal<Rc<Highlights>>,
}

impl TreeSitterStyling {
    pub fn new(
        cx: Scope,
        path: &Path,
        text: &str,
        diagnostics: &[Diagnostic],
        lsp_diagnostics: &[LspDiagnostic],
    ) -> Self {
        let initial = Highlights::build(path, text, diagnostics, lsp_diagnostics);
        Self { current: cx.create_rw_signal(Rc::new(initial)) }
    }

    /// Re-parses `text` and swaps in the result. The new snapshot gets a
    /// fresh id, which is what tells the editor its cached text layouts
    /// are stale (see `Editor::cache_id`).
    pub fn refresh(
        &self,
        path: &Path,
        text: &str,
        diagnostics: &[Diagnostic],
        lsp_diagnostics: &[LspDiagnostic],
    ) {
        let next = Highlights::build(path, text, diagnostics, lsp_diagnostics);
        self.current.set(Rc::new(next));
    }
}

impl Styling for TreeSitterStyling {
    /// Read tracked: the editor hashes this into its config id, so
    /// bumping it on refresh is what forces a re-render.
    fn id(&self) -> u64 {
        self.current.get().id
    }

    fn apply_attr_styles(
        &self,
        _edid: EditorId,
        _style: &EditorStyle,
        line: usize,
        default: Attrs,
        attrs: &mut AttrsList,
    ) {
        // Untracked on purpose: this runs inside the editor's layout
        // pass, and subscribing layout to the snapshot signal would
        // make a refresh re-enter layout from within layout. `id()`
        // above already carries the invalidation.
        self.current.with_untracked(|highlights| {
            let Some(&line_start) = highlights.line_starts.get(line) else {
                return;
            };
            let line_end = highlights.line_starts.get(line + 1).copied().unwrap_or(usize::MAX);

            for span in &highlights.spans {
                if span.end <= line_start || span.start >= line_end {
                    continue;
                }
                let start = span.start.max(line_start) - line_start;
                let end = span.end.min(line_end) - line_start;
                if start >= end {
                    continue;
                }
                let mut attr = default;
                if let Some(color) = span.color {
                    attr = attr.color(color);
                }
                if span.bold {
                    attr = attr.weight(floem::text::Weight::BOLD);
                }
                attrs.add_span(start..end, attr);
            }
        });
    }
}
