use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use coretrace_llm::{ProviderConfig, ProviderKind};

/// Where assistant settings (selected provider, per-provider API
/// keys/models) persist: `%APPDATA%/coretrace/llm-settings.json`, same
/// convention as `coretrace-extensions::extensions_dir`.
fn settings_path() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".coretrace-appdata"));
    base.join("coretrace").join("llm-settings.json")
}

/// Keeps a separate `ProviderConfig` per provider kind (keyed by its
/// serialized name) so switching providers in the UI doesn't discard
/// previously entered API keys for the others -- matches the old
/// Electron app's per-provider config storage in spirit.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PersistedSettings {
    pub selected: Option<ProviderKind>,
    pub configs: HashMap<String, ProviderConfig>,
}

fn key_for(kind: ProviderKind) -> String {
    kind.label().to_string()
}

impl PersistedSettings {
    pub fn load() -> Self {
        std::fs::read_to_string(settings_path())
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self) {
        let path = settings_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(text) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(path, text);
        }
    }

    pub fn config_for(&self, kind: ProviderKind) -> ProviderConfig {
        self.configs.get(&key_for(kind)).cloned().unwrap_or_default()
    }

    pub fn set_config(&mut self, kind: ProviderKind, config: ProviderConfig) {
        self.configs.insert(key_for(kind), config);
    }
}
