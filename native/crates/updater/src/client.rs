use std::io::Write;
use std::path::Path;

use crate::error::UpdaterError;
use crate::manifest::{Component, ComponentInfo, UpdateManifest};
use crate::version::Version;

pub fn fetch_manifest(manifest_url: &str) -> Result<UpdateManifest, UpdaterError> {
    let response =
        reqwest::blocking::get(manifest_url).map_err(|e| UpdaterError::Request(e.to_string()))?;
    response.json().map_err(|e| UpdaterError::InvalidManifest(e.to_string()))
}

/// Compares `manifest`'s version for `component` against `current`.
/// Returns `Some(info)` if the manifest's version is strictly newer --
/// the caller decides what to do with it (this doesn't download or
/// prompt on its own).
pub fn check_for_update<'a>(
    manifest: &'a UpdateManifest,
    component: Component,
    current: &str,
) -> Result<Option<&'a ComponentInfo>, UpdaterError> {
    let info = match component {
        Component::App => &manifest.app,
        Component::Ctrace => &manifest.ctrace,
    };
    let current_version = Version::parse(current).ok_or_else(|| UpdaterError::InvalidVersion(current.to_string()))?;
    let manifest_version =
        Version::parse(&info.version).ok_or_else(|| UpdaterError::InvalidVersion(info.version.clone()))?;

    Ok((manifest_version > current_version).then_some(info))
}

/// Downloads `info.url` to `dest`. Just fetches the bytes to a staging
/// location -- replacing the running executable while it's running is
/// a genuinely separate problem (needs a companion launcher/relaunch
/// trick on Windows) and out of scope here; see
/// native/docs/phase5-status.md.
pub fn download_update(info: &ComponentInfo, dest: &Path) -> Result<(), UpdaterError> {
    let mut response =
        reqwest::blocking::get(&info.url).map_err(|e| UpdaterError::Request(e.to_string()))?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| UpdaterError::Io(e.to_string()))?;
    }
    let mut file = std::fs::File::create(dest).map_err(|e| UpdaterError::Io(e.to_string()))?;
    let mut buf = Vec::new();
    response.copy_to(&mut buf).map_err(|e| UpdaterError::Request(e.to_string()))?;
    file.write_all(&buf).map_err(|e| UpdaterError::Io(e.to_string()))?;
    Ok(())
}
