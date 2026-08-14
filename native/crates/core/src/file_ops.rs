use std::path::Path;

pub fn read_file(path: &Path) -> std::io::Result<String> {
    std::fs::read_to_string(path)
}

pub fn write_file(path: &Path, contents: &str) -> std::io::Result<()> {
    std::fs::write(path, contents)
}

pub fn create_file(path: &Path) -> std::io::Result<()> {
    std::fs::write(path, "")
}

pub fn create_dir(path: &Path) -> std::io::Result<()> {
    std::fs::create_dir(path)
}

pub fn delete_path(path: &Path) -> std::io::Result<()> {
    if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    }
}

pub fn rename_path(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::rename(from, to)
}
