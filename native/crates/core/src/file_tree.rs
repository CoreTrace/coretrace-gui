use std::cmp::Ordering;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
}

/// Lists the immediate children of `dir`, directories first then files,
/// both alphabetical. Non-recursive by design -- the UI expands
/// subdirectories on demand by calling this again, same lazy-loading
/// shape as the current Electron app's file tree.
pub fn scan_directory(dir: &Path) -> std::io::Result<Vec<FileEntry>> {
    let mut entries: Vec<FileEntry> = std::fs::read_dir(dir)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let is_dir = entry.file_type().ok()?.is_dir();
            Some(FileEntry { name, path, is_dir })
        })
        .collect();

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dirs_sort_before_files_then_alphabetical() {
        let tmp = std::env::temp_dir().join(format!("coretrace-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("b.txt"), "").unwrap();
        std::fs::write(tmp.join("a.txt"), "").unwrap();
        std::fs::create_dir(tmp.join("z_dir")).unwrap();

        let entries = scan_directory(&tmp).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["z_dir", "a.txt", "b.txt"]);

        std::fs::remove_dir_all(&tmp).unwrap();
    }
}
