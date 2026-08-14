use floem::peniko::Color;

// Surfaces, darkest to lightest. Four distinct levels so the activity
// bar, sidebar, and editor read as separate regions without needing
// heavy borders between them -- the depth cue does the work.
pub const BG_ACTIVITY: Color = Color::rgb8(0x16, 0x18, 0x1D);
pub const BG_SIDEBAR: Color = Color::rgb8(0x1B, 0x1E, 0x24);
pub const BG_EDITOR: Color = Color::rgb8(0x21, 0x25, 0x2B);
pub const BG_ELEVATED: Color = Color::rgb8(0x2A, 0x2F, 0x38);

pub const BORDER: Color = Color::rgb8(0x30, 0x35, 0x3F);

// Text is deliberately not pure white -- full-contrast white on a dark
// background is harsh over long sessions, and it leaves no headroom to
// make genuinely active/selected text stand out (TEXT_BRIGHT does).
pub const TEXT: Color = Color::rgb8(0xC8, 0xCD, 0xD6);
pub const TEXT_BRIGHT: Color = Color::rgb8(0xE6, 0xE9, 0xEF);
pub const TEXT_MUTED: Color = Color::rgb8(0x7A, 0x82, 0x8F);

pub const ACCENT: Color = Color::rgb8(0x4D, 0x9C, 0xF6);

pub const ERROR: Color = Color::rgb8(0xE0, 0x6C, 0x75);
pub const WARNING: Color = Color::rgb8(0xE5, 0xA0, 0x3B);
pub const SUCCESS: Color = Color::rgb8(0x98, 0xC3, 0x79);

// Interactive states, used by both the class-level theme and by
// individual rows (file tree, search results) so hover feels identical
// everywhere rather than each view inventing its own.
pub const HOVER: Color = Color::rgb8(0x2A, 0x2F, 0x38);
pub const ACTIVE: Color = Color::rgb8(0x33, 0x39, 0x44);
pub const SELECTED: Color = Color::rgba8(0x4D, 0x9C, 0xF6, 0x2E);

/// Caret/selection color for `text_input`. Floem 0.2's `text_input`
/// reads a *single* `CursorColor` prop for both its 1px caret and its
/// selection rect, and paints the selection *over* the text -- so this
/// one value has to serve both. Fully opaque would hide selected text;
/// the framework's own default (black at 30% alpha) is invisible on a
/// dark background, which is exactly the bug this fixes. ~65% alpha is
/// the honest compromise: the 1px caret reads clearly, and selected
/// text stays legible through the tint.
pub const INPUT_CARET: Color = Color::rgba8(0x4D, 0x9C, 0xF6, 0xA6);

/// The code editor exposes caret and selection as *separate* builder
/// methods, so it doesn't need the compromise above -- a solid caret
/// and a proper low-alpha selection tint.
pub const EDITOR_CARET: Color = Color::rgb8(0x61, 0xAF, 0xEF);
pub const EDITOR_SELECTION: Color = Color::rgba8(0x4D, 0x9C, 0xF6, 0x40);
pub const EDITOR_CURRENT_LINE: Color = Color::rgba8(0xFF, 0xFF, 0xFF, 0x0A);
pub const EDITOR_INDENT_GUIDE: Color = Color::rgb8(0x30, 0x35, 0x3F);

/// Line numbers for every line except the one the caret is on.
pub const GUTTER_DIM: Color = Color::rgb8(0x5A, 0x62, 0x70);
/// Line number *text* for the caret's line (`gutter_accent_color`).
pub const GUTTER_ACTIVE_TEXT: Color = Color::rgb8(0xD5, 0xDA, 0xE2);
/// Gutter *background* for the caret's line (`gutter_current_color`).
/// Note this is a fill, not a text color -- passing a light value here
/// paints a solid block over the line number instead of highlighting
/// it, which is exactly what it did on the first attempt.
pub const GUTTER_CURRENT_BG: Color = Color::rgba8(0xFF, 0xFF, 0xFF, 0x0A);

/// Color for a diagnostic's severity, shared by the Diagnostics panel
/// and the editor's inline markers so a warning looks the same in both.
pub fn severity_color(severity: &str) -> Color {
    match severity.to_ascii_uppercase().as_str() {
        "ERROR" => ERROR,
        "WARNING" => WARNING,
        _ => ACCENT,
    }
}

/// Color for an LSP diagnostic's numeric severity (1=Error, 2=Warning,
/// 3=Information, 4=Hint per the LSP spec; unset defaults to Warning).
pub fn lsp_severity_color(severity: Option<u8>) -> Color {
    match severity {
        Some(1) => ERROR,
        Some(3) | Some(4) => ACCENT,
        _ => WARNING,
    }
}
