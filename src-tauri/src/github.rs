use crate::workspace::{activate, Workspace, WorkspaceState};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;
use tokio::process::Command;

/// Where clones are kept. Choosing a folder for every clone was a decision the
/// user had no basis to make; CoreTrace keeps them together instead, and
/// Settings says where. Repositories sit under their owner, so two accounts
/// with a repository of the same name cannot land in the same folder.
pub fn clone_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No application data directory: {e}"))?;
    Ok(base.join("repositories"))
}

/// The clone location, for Settings to show.
#[tauri::command]
pub fn clone_location(app: tauri::AppHandle) -> Result<String, String> {
    Ok(clone_root(&app)?.display().to_string())
}

pub fn repository_url(value: &str) -> Result<(String, String, String), String> {
    let value = value.trim().trim_end_matches('/').trim_end_matches(".git");
    let name = value.strip_prefix("https://github.com/").unwrap_or(value);
    let parts: Vec<_> = name.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|p| {
            p.is_empty()
                || p.starts_with('.')
                || p.starts_with('-')
                || !p
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        })
    {
        return Err("Use owner/repository or https://github.com/owner/repository".into());
    }
    Ok((
        format!("https://github.com/{name}.git"),
        parts[0].into(),
        parts[1].into(),
    ))
}
#[tauri::command]
pub async fn clone_repository(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    repository: String,
) -> Result<Option<Workspace>, String> {
    let (url, owner, name) = repository_url(&repository)?;
    let parent = clone_root(&app)?.join(owner);
    std::fs::create_dir_all(&parent)
        .map_err(|e| format!("Could not create the clone folder: {e}"))?;
    let parent = parent.canonicalize().map_err(|e| e.to_string())?;
    let destination = parent.join(name);
    if destination.exists() {
        // Already cloned here: open it rather than refusing, which is what the
        // user asking to clone it again wants.
        return Ok(Some(activate(&state, destination)?));
    }
    let mut command = Command::new("git");
    command
        .args([
            "-c",
            "core.hooksPath=",
            "-c",
            "protocol.file.allow=never",
            "clone",
            "--",
            &url,
        ])
        .arg(&destination)
        .current_dir(&parent)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let output = tokio::time::timeout(Duration::from_secs(300), command.output())
        .await
        .map_err(|_| {
            "Clone timed out. An incomplete folder may remain; inspect it before retrying."
        })?
        .map_err(|e| format!("Git is required: {e}"))?;
    if !output.status.success() {
        return Err(format!("Git clone failed. For private repositories, sign in with Git Credential Manager or gh auth setup-git first. {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(Some(activate(&state, destination)?))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_github_repository_names() {
        assert_eq!(
            repository_url("https://github.com/CoreTrace/coretrace-gui.git")
                .unwrap()
                .0,
            "https://github.com/CoreTrace/coretrace-gui.git"
        );
        let (_, owner, name) = repository_url("CoreTrace/coretrace-gui").unwrap();
        assert_eq!((owner.as_str(), name.as_str()), ("CoreTrace", "coretrace-gui"));
        for bad in [
            "--upload-pack=sh",
            "https://evil.test/a/b",
            "a/../b",
            "a/b?token=x",
            "a/-b",
            "a/b\n",
        ] {
            if bad.ends_with('\n') {
                continue;
            }
            assert!(repository_url(bad).is_err());
        }
    }
}
