use std::path::Path;
use std::process::Command;

/// True if `wsl.exe` is present and reports at least one distro.
/// `wsl.exe`'s own stdout is UTF-16LE when piped -- decoded accordingly,
/// but this check only needs the exit code, not the text.
pub fn wsl_available() -> bool {
    Command::new("wsl.exe")
        .arg("-l")
        .arg("-q")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

/// Converts a Windows path (`C:\Users\foo\bar.c`) to the equivalent WSL
/// mount path (`/mnt/c/Users/foo/bar.c`). Purely lexical -- matches the
/// convention `wsl.exe` itself uses for the default drive mount, same as
/// the old Electron app's `convertToWSLPath`.
pub fn to_wsl_path(path: &Path) -> Option<String> {
    let s = path.to_str()?;
    let mut chars = s.chars();
    let drive = chars.next()?.to_ascii_lowercase();
    if chars.next() != Some(':') {
        return None;
    }
    let rest: String = chars.as_str().replace('\\', "/");
    let rest = rest.strip_prefix('/').unwrap_or(&rest);
    Some(format!("/mnt/{drive}/{rest}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn converts_windows_path() {
        let p = PathBuf::from(r"C:\Users\foo\bar.c");
        assert_eq!(to_wsl_path(&p).as_deref(), Some("/mnt/c/Users/foo/bar.c"));
    }

    #[test]
    fn rejects_non_drive_path() {
        assert_eq!(to_wsl_path(Path::new("relative/path.c")), None);
    }
}
