use std::fs;
use std::io::{self, Cursor};
use std::path::Path;

use zip::ZipArchive;

use crate::error::RegistryError;

/// Unpacks a .vsix (a zip with an `extension/` folder plus manifest/
/// metadata files at the root) into `dest_dir`, keeping only the
/// `extension/` contents -- same layout every VSCode-compatible
/// extension host expects.
pub fn extract_vsix(vsix_bytes: &[u8], dest_dir: &Path) -> Result<(), RegistryError> {
    let mut archive = ZipArchive::new(Cursor::new(vsix_bytes))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        // `enclosed_name` rejects absolute paths and `..` components, so an
        // archive entry can never escape `dest_dir` (zip-slip).
        let Some(safe_path) = entry.enclosed_name() else {
            continue;
        };
        let Ok(relative) = safe_path.strip_prefix("extension") else {
            continue; // skip extension.vsixmanifest, [Content_Types].xml, etc.
        };
        if relative.as_os_str().is_empty() {
            continue;
        }

        let out_path = dest_dir.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&out_path)?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut out_file = fs::File::create(&out_path)?;
        io::copy(&mut entry, &mut out_file)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn vsix_with(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, body) in entries {
            writer.start_file(*name, SimpleFileOptions::default()).unwrap();
            writer.write_all(body.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn scratch_dir(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("coretrace-vsix-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn extracts_only_the_extension_folder() {
        let bytes = vsix_with(&[
            ("extension.vsixmanifest", "<manifest/>"),
            ("extension/package.json", "{}"),
            ("extension/out/main.js", "// hi"),
        ]);
        let root = scratch_dir("ok");
        let dest = root.join("dest");
        extract_vsix(&bytes, &dest).unwrap();
        assert!(dest.join("package.json").is_file());
        assert!(dest.join("out").join("main.js").is_file());
        assert!(!dest.join("extension.vsixmanifest").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_entries_that_escape_the_destination() {
        let bytes = vsix_with(&[
            ("extension/../escaped.txt", "pwned"),
            ("extension/sub/../../escaped2.txt", "pwned"),
            ("extension/legit.txt", "fine"),
        ]);
        let root = scratch_dir("slip");
        let dest = root.join("dest");
        extract_vsix(&bytes, &dest).unwrap();
        assert!(dest.join("legit.txt").is_file());
        assert!(!root.join("escaped.txt").exists(), "zip-slip entry was written outside dest");
        assert!(!root.join("escaped2.txt").exists(), "zip-slip entry was written outside dest");
        let _ = fs::remove_dir_all(root);
    }
}
