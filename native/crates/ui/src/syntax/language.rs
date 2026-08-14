use std::path::Path;

use tree_sitter::Language;

/// Picks a tree-sitter grammar and its highlights query for a file.
///
/// Matched on the file *name* first, then the extension: build files
/// like `CMakeLists.txt` and `Dockerfile` carry no useful extension, so
/// extension-only matching left them (and `CMakeLists.txt` especially)
/// as plain unhighlighted text.
pub fn language_for(path: &Path) -> Option<(Language, &'static str)> {
    let name = path.file_name()?.to_str()?;
    if let Some(pair) = language_for_name(name) {
        return Some(pair);
    }
    let ext = path.extension()?.to_str()?;
    language_for_extension(ext)
}

fn language_for_name(name: &str) -> Option<(Language, &'static str)> {
    let lower = name.to_ascii_lowercase();
    match lower.as_str() {
        "cmakelists.txt" => Some((tree_sitter_cmake::LANGUAGE.into(), tree_sitter_cmake::HIGHLIGHTS_QUERY)),
        _ => None,
    }
}

fn language_for_extension(ext: &str) -> Option<(Language, &'static str)> {
    let lower = ext.to_ascii_lowercase();
    let pair = match lower.as_str() {
        "c" | "h" => (tree_sitter_c::LANGUAGE.into(), tree_sitter_c::HIGHLIGHT_QUERY),
        "cpp" | "cc" | "cxx" | "c++" | "hpp" | "hh" | "hxx" | "h++" | "inl" | "ipp" | "tpp" => {
            (tree_sitter_cpp::LANGUAGE.into(), tree_sitter_cpp::HIGHLIGHT_QUERY)
        }
        "cmake" => (tree_sitter_cmake::LANGUAGE.into(), tree_sitter_cmake::HIGHLIGHTS_QUERY),
        "rs" => (tree_sitter_rust::LANGUAGE.into(), tree_sitter_rust::HIGHLIGHTS_QUERY),
        "py" | "pyi" => (tree_sitter_python::LANGUAGE.into(), tree_sitter_python::HIGHLIGHTS_QUERY),
        "json" => (tree_sitter_json::LANGUAGE.into(), tree_sitter_json::HIGHLIGHTS_QUERY),
        "toml" => (tree_sitter_toml_ng::LANGUAGE.into(), tree_sitter_toml_ng::HIGHLIGHTS_QUERY),
        "md" | "markdown" => (tree_sitter_md::LANGUAGE.into(), tree_sitter_md::HIGHLIGHT_QUERY_BLOCK),
        "js" | "mjs" | "cjs" | "jsx" => {
            (tree_sitter_javascript::LANGUAGE.into(), tree_sitter_javascript::HIGHLIGHT_QUERY)
        }
        "sh" | "bash" | "zsh" => (tree_sitter_bash::LANGUAGE.into(), tree_sitter_bash::HIGHLIGHT_QUERY),
        "yaml" | "yml" => (tree_sitter_yaml::LANGUAGE.into(), tree_sitter_yaml::HIGHLIGHTS_QUERY),
        _ => return None,
    };
    Some(pair)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn recognizes_cmakelists_by_filename() {
        // The reported gap: no extension to match on.
        assert!(language_for(&PathBuf::from("some/dir/CMakeLists.txt")).is_some());
    }

    #[test]
    fn filename_matching_is_case_insensitive() {
        assert!(language_for(&PathBuf::from("cmakelists.txt")).is_some());
    }

    #[test]
    fn recognizes_common_extensions() {
        for name in ["a.c", "a.hpp", "a.rs", "a.py", "a.json", "a.toml", "a.md", "a.js", "a.sh", "a.yml", "a.cmake"] {
            assert!(language_for(&PathBuf::from(name)).is_some(), "{name} should be highlighted");
        }
    }

    #[test]
    fn extension_matching_is_case_insensitive() {
        assert!(language_for(&PathBuf::from("MAIN.C")).is_some());
    }

    #[test]
    fn returns_none_for_unknown_types() {
        assert!(language_for(&PathBuf::from("a.bin")).is_none());
        assert!(language_for(&PathBuf::from("noextension")).is_none());
    }
}
