use serde::Deserialize;

use crate::error::RegistryError;

/// The default, legal registry: MS Marketplace is ToS-restricted to
/// Microsoft's own products (VS Code/VS), so this points at Open VSX
/// instead -- same approach as VSCodium/Theia/Gitpod. User-configurable:
/// nothing hardwires callers to this URL.
pub const DEFAULT_REGISTRY_URL: &str = "https://open-vsx.org";

#[derive(Debug, Clone, Deserialize)]
pub struct ExtensionFiles {
    pub download: String,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExtensionSummary {
    pub namespace: String,
    pub name: String,
    pub version: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "downloadCount")]
    pub download_count: Option<u64>,
    pub files: ExtensionFiles,
}

impl ExtensionSummary {
    pub fn id(&self) -> String {
        format!("{}.{}", self.namespace, self.name)
    }
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    extensions: Vec<ExtensionSummary>,
}

/// A configurable extension registry endpoint. Not hardwired to any one
/// provider -- construct with `RegistrySource::open_vsx()` for the
/// legal default, or `RegistrySource { base_url }` for a self-hosted
/// Open VSX-compatible mirror.
#[derive(Debug, Clone)]
pub struct RegistrySource {
    pub base_url: String,
}

impl Default for RegistrySource {
    fn default() -> Self {
        Self::open_vsx()
    }
}

impl RegistrySource {
    pub fn open_vsx() -> Self {
        Self { base_url: DEFAULT_REGISTRY_URL.to_string() }
    }

    pub fn search(&self, query: &str, size: u32) -> Result<Vec<ExtensionSummary>, RegistryError> {
        let url = format!(
            "{}/api/-/search?query={}&size={size}",
            self.base_url,
            urlencoding::encode(query)
        );
        let response: SearchResponse = reqwest::blocking::get(url)?.json()?;
        Ok(response.extensions)
    }

    pub fn download_vsix(&self, download_url: &str) -> Result<Vec<u8>, RegistryError> {
        Ok(reqwest::blocking::get(download_url)?.bytes()?.to_vec())
    }

    /// Direct namespace/name lookup -- use this for a known install
    /// target. `search` ranks by relevance and may not surface an exact
    /// match near the top even when it exists (observed for a small,
    /// low-download-count extension), so it's the wrong tool for "I know
    /// exactly what I want to install."
    pub fn get_extension(&self, namespace: &str, name: &str) -> Result<ExtensionSummary, RegistryError> {
        let url = format!("{}/api/{namespace}/{name}", self.base_url);
        Ok(reqwest::blocking::get(url)?.json()?)
    }
}
