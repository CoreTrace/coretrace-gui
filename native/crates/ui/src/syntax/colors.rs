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
