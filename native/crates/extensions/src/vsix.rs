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
        let Some(relative) = entry.name().strip_prefix("extension/") else {
            continue; // skip extension.vsixmanifest, [Content_Types].xml, etc.
        };
        if relative.is_empty() {
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
