use floem::peniko::Color;

/// Maps a tree-sitter highlight capture name (e.g. "keyword",
/// "function.builtin") to a color, using only the top-level segment
/// before the first dot. `None` means "leave the default text color" --
/// e.g. plain variables aren't specially colored.
pub fn color_for_capture(name: &str) -> Option<Color> {
    let top = name.split('.').next().unwrap_or(name);
    let color = match top {
        "keyword" => Color::rgb8(0xC6, 0x78, 0xDD),
        "type" => Color::rgb8(0xE5, 0xC0, 0x7B),
        "string" => Color::rgb8(0x98, 0xC3, 0x79),
        "comment" => Color::rgb8(0x7F, 0x84, 0x8E),
        "number" | "constant" => Color::rgb8(0xD1, 0x9A, 0x66),
        "function" => Color::rgb8(0x61, 0xAF, 0xEF),
        "property" | "attribute" => Color::rgb8(0xE0, 0x6C, 0x75),
        "operator" | "punctuation" => Color::rgb8(0xAB, 0xB2, 0xBF),
        _ => return None,
    };
    Some(color)
}

/// Color for a ctrace diagnostic's severity, used to flag its exact
/// location inline (overriding the syntax color for that span) --
/// the closest equivalent to a squiggly underline this text renderer
/// supports (cosmic-text 0.12's `Attrs` has no underline field).
pub fn color_for_severity(severity: &str) -> Color {
    match severity.to_ascii_uppercase().as_str() {
        "ERROR" => Color::rgb8(0xE0, 0x6C, 0x75),
        "WARNING" => Color::rgb8(0xE5, 0xA0, 0x3B),
        _ => Color::rgb8(0x61, 0xAF, 0xEF),
    }
}

/// Color for an LSP diagnostic's severity (1=Error, 2=Warning,
/// 3=Information, 4=Hint per the LSP spec; unset defaults to Warning).
pub fn color_for_lsp_severity(severity: Option<u8>) -> Color {
    match severity {
        Some(1) => Color::rgb8(0xE0, 0x6C, 0x75),
        Some(3) | Some(4) => Color::rgb8(0x61, 0xAF, 0xEF),
        _ => Color::rgb8(0xE5, 0xA0, 0x3B),
    }
}
