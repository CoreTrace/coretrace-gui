use std::path::{Path, PathBuf};

const MAX_RESULTS: usize = 500;
const MAX_DEPTH: usize = 12;
const SKIP_DIRS: &[&str] = &[".git", "node_modules", "target", "out", "dist", ".vs"];

#[derive(Debug, Clone)]
pub struct SearchMatch {
    pub path: PathBuf,
    pub line_number: usize,
    pub line_text: String,
}

/// Plain substring, case-insensitive search across text files under
/// `root`. Depth- and result-capped, common build/vcs noise directories
/// skipped -- same shape as the current Electron app's search-in-files,
/// not a project-wide indexer.
pub fn search_in_files(root: &Path, query: &str) -> Vec<SearchMatch> {
    let mut results = Vec::new();
    let needle = query.to_lowercase();
    if !needle.is_empty() {
        walk(root, 0, &needle, &mut results);
    }
    results
}

fn walk(dir: &Path, depth: usize, needle: &str, results: &mut Vec<SearchMatch>) {
    if depth > MAX_DEPTH || results.len() >= MAX_RESULTS {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        if results.len() >= MAX_RESULTS {
            return;
        }
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            let name = entry.file_name();
            if SKIP_DIRS.iter().any(|skip| name == *skip) {
                continue;
            }
            walk(&path, depth + 1, needle, results);
        } else if file_type.is_file() {
            search_file(&path, needle, results);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_case_insensitive_match_and_skips_noise_dirs() {
        let tmp = std::env::temp_dir().join(format!("coretrace-search-test-{}", std::process::id()));
        let noise = tmp.join("node_modules");
        std::fs::create_dir_all(&noise).unwrap();
        std::fs::write(tmp.join("main.c"), "int main() {\n  return NEEDLE;\n}\n").unwrap();
        std::fs::write(noise.join("skip.c"), "NEEDLE\n").unwrap();

        let results = search_in_files(&tmp, "needle");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].line_number, 2);
        assert!(results[0].path.ends_with("main.c"));

        std::fs::remove_dir_all(&tmp).unwrap();
    }
}

fn search_file(path: &Path, needle: &str, results: &mut Vec<SearchMatch>) {
    let Ok(contents) = std::fs::read_to_string(path) else {
        return; // binary or unreadable -- skip rather than fail the whole search
    };
    for (i, line) in contents.lines().enumerate() {
        if results.len() >= MAX_RESULTS {
            return;
        }
        if line.to_lowercase().contains(needle) {
            results.push(SearchMatch {
                path: path.to_path_buf(),
                line_number: i + 1,
                line_text: line.to_string(),
            });
        }
    }
}
