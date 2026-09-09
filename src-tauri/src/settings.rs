use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

/// What the application remembers between sessions. Choosing the ctrace
/// executable and reopening the same folders every time is work the reader
/// already did once.
#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// The ctrace executable a local analysis runs.
    pub analyser: Option<PathBuf>,
    /// The folders that were open, in the order they were opened.
    pub workspaces: Vec<PathBuf>,
}

fn file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No configuration directory: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("session.json"))
}

/// Reads what was remembered. A missing or unreadable file is simply a first
/// run: it must never stop the application starting.
pub fn load(app: &tauri::AppHandle) -> Settings {
    let Ok(path) = file(app) else {
        return Settings::default();
    };
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

/// Remembers, replacing what was there. Failing to write is not worth
/// interrupting the reader over; the session simply is not restored.
pub fn save(app: &tauri::AppHandle, settings: &Settings) {
    if let Ok(path) = file(app) {
        if let Ok(bytes) = serde_json::to_vec_pretty(settings) {
            let _ = std::fs::write(path, bytes);
        }
    }
}

/// Records the executable, keeping the folders already remembered.
pub fn remember_analyser(app: &tauri::AppHandle, analyser: PathBuf) {
    let mut settings = load(app);
    settings.analyser = Some(analyser);
    save(app, &settings);
}

/// Records the open folders, keeping the executable already remembered.
pub fn remember_workspaces(app: &tauri::AppHandle, workspaces: Vec<PathBuf>) {
    let mut settings = load(app);
    settings.workspaces = workspaces;
    save(app, &settings);
}
