use std::path::Path;

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct ExtensionManifest {
    pub name: String,
    pub publisher: Option<String>,
    pub version: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub main: Option<String>,
    #[serde(rename = "activationEvents", default)]
    pub activation_events: Vec<String>,
}

impl ExtensionManifest {
    pub fn id(&self) -> String {
        match &self.publisher {
            Some(publisher) => format!("{publisher}.{}", self.name),
            None => self.name.clone(),
        }
    }
}

pub fn read_manifest(extension_dir: &Path) -> std::io::Result<ExtensionManifest> {
    let text = std::fs::read_to_string(extension_dir.join("package.json"))?;
    serde_json::from_str(&text).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}
