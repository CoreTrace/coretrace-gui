use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Where the session persists: `%APPDATA%/coretrace/session.json`, same
/// convention as `extensions_dir()`/`llm_settings::settings_path()`.
fn session_path() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".coretrace-appdata"));
    base.join("coretrace").join("session.json")
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SessionData {
    pub workspace_root: Option<PathBuf>,
    pub open_tabs: Vec<PathBuf>,
    pub active_tab: Option<PathBuf>,
}

impl SessionData {
    /// Drops any path that no longer exists on disk -- a session saved
    /// with a file open, then that file deleted/moved outside the app
    /// before the next launch, shouldn't leave a dead tab. Pure
    /// function of a path-existence check, so it's easy to test without
    /// touching the real filesystem convention above.
    pub fn filter_missing(mut self, exists: impl Fn(&std::path::Path) -> bool) -> Self {
        if self.workspace_root.as_deref().is_some_and(|p| !exists(p)) {
            self.workspace_root = None;
        }
        self.open_tabs.retain(|p| exists(p));
        if self.active_tab.as_deref().is_some_and(|p| !self.open_tabs.iter().any(|t| t == p)) {
            self.active_tab = None;
        }
        self
    }
}

pub fn load() -> SessionData {
    let data: SessionData = std::fs::read_to_string(session_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    data.filter_missing(|p| p.exists())
}

pub fn save(data: &SessionData) {
    let path = session_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string_pretty(data) {
        let _ = std::fs::write(path, text);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drops_paths_that_no_longer_exist() {
        let data = SessionData {
            workspace_root: Some(PathBuf::from("gone")),
            open_tabs: vec![PathBuf::from("gone.c"), PathBuf::from("here.c")],
            active_tab: Some(PathBuf::from("gone.c")),
        };
        let filtered = data.filter_missing(|p| p == std::path::Path::new("here.c"));
        assert_eq!(filtered.workspace_root, None);
        assert_eq!(filtered.open_tabs, vec![PathBuf::from("here.c")]);
        assert_eq!(filtered.active_tab, None);
    }

    #[test]
    fn keeps_active_tab_when_it_still_exists() {
        let data = SessionData {
            workspace_root: None,
            open_tabs: vec![PathBuf::from("a.c")],
            active_tab: Some(PathBuf::from("a.c")),
        };
        let filtered = data.filter_missing(|_| true);
        assert_eq!(filtered.active_tab, Some(PathBuf::from("a.c")));
    }
}
