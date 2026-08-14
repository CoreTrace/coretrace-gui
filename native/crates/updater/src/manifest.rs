use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct ComponentInfo {
    pub version: String,
    pub url: String,
}

/// The update manifest this checks against -- a small static JSON file
/// (or an endpoint that serves one), listing the current version and
/// download URL for each updatable piece. Two components, matching the
/// plan's Phase 5 scope: the app itself and the `ctrace` backend
/// binary, which can lag or lead the app's own release cadence.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateManifest {
    pub app: ComponentInfo,
    pub ctrace: ComponentInfo,
}

#[derive(Debug, Clone, Copy)]
pub enum Component {
    App,
    Ctrace,
}
