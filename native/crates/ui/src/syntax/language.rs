use std::path::Path;

use tree_sitter::Language;

/// Picks a tree-sitter grammar + its bundled highlights query by file
/// extension. `None` for anything else -- Phase 1 only covers C/C++,
/// per the plan.
pub fn language_for(path: &Path) -> Option<(Language, &'static str)> {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("c" | "h") => Some((tree_sitter_c::LANGUAGE.into(), tree_sitter_c::HIGHLIGHT_QUERY)),
        Some("cpp" | "cc" | "cxx" | "hpp" | "hh" | "hxx") => {
            Some((tree_sitter_cpp::LANGUAGE.into(), tree_sitter_cpp::HIGHLIGHT_QUERY))
        }
        _ => None,
    }
}
