use std::path::{Path, PathBuf};

/// Resolves a resource that ships either bundled next to the packaged
/// exe (`packaged_relative`, e.g. `"bin/ctrace"`) or, in dev builds,
/// relative to this crate's own source tree (`dev_path`). Checked in
/// that order -- packaged layout first, since that's what a real
/// install looks like -- falling back to the dev layout so `cargo run`
/// keeps working unpackaged. Closes the gap `sidecar.rs` and
/// `diagnostics_state.rs` previously left as "Phase 5 packaging
/// concern, not addressed here".
pub fn resolve(dev_path: PathBuf, packaged_relative: &str) -> PathBuf {
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
    resolve_with_exe_dir(exe_dir.as_deref(), dev_path, packaged_relative)
}

fn resolve_with_exe_dir(exe_dir: Option<&Path>, dev_path: PathBuf, packaged_relative: &str) -> PathBuf {
    if let Some(dir) = exe_dir {
        let packaged = dir.join(packaged_relative);
        if packaged.exists() {
            return packaged;
        }
    }
    dev_path
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_the_packaged_path_when_it_exists() {
        let dir = std::env::temp_dir().join(format!("coretrace_bundled_path_test_{}", std::process::id()));
        std::fs::create_dir_all(dir.join("bin")).unwrap();
        std::fs::write(dir.join("bin/ctrace"), b"fake").unwrap();

        let resolved = resolve_with_exe_dir(Some(&dir), PathBuf::from("dev/path/ctrace"), "bin/ctrace");
        assert_eq!(resolved, dir.join("bin/ctrace"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn falls_back_to_dev_path_when_packaged_resource_is_missing() {
        let dir = std::env::temp_dir().join(format!("coretrace_bundled_path_test_missing_{}", std::process::id()));
        let resolved = resolve_with_exe_dir(Some(&dir), PathBuf::from("dev/path/ctrace"), "bin/ctrace");
        assert_eq!(resolved, PathBuf::from("dev/path/ctrace"));
    }
}
