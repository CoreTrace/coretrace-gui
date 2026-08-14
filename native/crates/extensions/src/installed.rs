use std::path::{Path, PathBuf};

use crate::error::RegistryError;
use crate::manifest::{read_manifest, ExtensionManifest};
use crate::registry::{ExtensionSummary, RegistrySource};
use crate::vsix::extract_vsix;

/// Where installed extensions live: `%APPDATA%/coretrace/extensions` on
/// Windows, falling back to a local dir if APPDATA isn't set (e.g. when
/// running outside a normal Windows user session).
pub fn extensions_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".coretrace-appdata"));
    base.join("coretrace").join("extensions")
}

pub fn list_installed(dir: &Path) -> Vec<(PathBuf, ExtensionManifest)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter_map(|path| {
            let manifest = read_manifest(&path).ok()?;
            Some((path, manifest))
        })
        .collect()
}

/// Downloads and unpacks `summary` into `<dir>/<namespace>.<name>-<version>/`.
/// Returns the installed extension's directory.
pub fn install_extension(
    registry: &RegistrySource,
    summary: &ExtensionSummary,
    dir: &Path,
) -> Result<PathBuf, RegistryError> {
    let vsix_bytes = registry.download_vsix(&summary.files.download)?;

    let install_dir = dir.join(format!("{}.{}-{}", summary.namespace, summary.name, summary.version));
    std::fs::create_dir_all(&install_dir)?;
    extract_vsix(&vsix_bytes, &install_dir)?;

    Ok(install_dir)
}

pub fn uninstall_extension(extension_dir: &Path) -> std::io::Result<()> {
    std::fs::remove_dir_all(extension_dir)
}
