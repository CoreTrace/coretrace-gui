mod client;
mod error;
mod manifest;
mod version;

pub use client::{check_for_update, download_update, fetch_manifest};
pub use error::UpdaterError;
pub use manifest::{Component, ComponentInfo, UpdateManifest};
pub use version::Version;
