use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri_plugin_dialog::DialogExt;

const MAX_FILE: u64 = 4 * 1024 * 1024;
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
}
#[derive(Default)]
pub struct WorkspaceState(pub Mutex<Option<Workspace>>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    name: String,
    path: String,
    directory: bool,
}
#[derive(Serialize)]
pub struct Document {
    content: String,
    revision: String,
}

pub fn activate(state: &WorkspaceState, path: PathBuf) -> Result<Workspace, String> {
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    if !path.is_dir() {
        return Err("Choose a folder".into());
    }
    let workspace = Workspace {
        id: uuid::Uuid::new_v4().to_string(),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        path,
    };
    *state.0.lock().map_err(|e| e.to_string())? = Some(workspace.clone());
    Ok(workspace)
}
pub fn root(state: &WorkspaceState, id: &str) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .filter(|w| w.id == id)
        .map(|w| w.path.clone())
        .ok_or("Workspace changed; reopen the file".into())
}
pub fn resolve(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if path
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
        && !relative.is_empty()
    {
        return Err("Only workspace-relative paths are allowed".into());
    }
    if path.components().any(|c| {
        c.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git")
            || c.as_os_str().to_string_lossy().contains(':')
    }) {
        return Err("Git metadata and alternate streams cannot be edited".into());
    }
    let resolved = root.join(path).canonicalize().map_err(|e| e.to_string())?;
    if !resolved.starts_with(root) {
        return Err("Path leaves the selected workspace".into());
    }
    if resolved
        .strip_prefix(root)
        .map_err(|e| e.to_string())?
        .components()
        .any(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git"))
    {
        return Err("Git metadata cannot be edited through an alias".into());
    }
    Ok(resolved)
}
fn read(path: &Path) -> Result<Document, String> {
    if !path.is_file() || path.metadata().map_err(|e| e.to_string())?.len() > MAX_FILE {
        return Err("Choose a text file smaller than 4 MiB".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(MAX_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_FILE as usize {
        return Err("File exceeds 4 MiB".into());
    }
    let content = String::from_utf8(bytes).map_err(|_| "This file is not UTF-8 text")?;
    if content.contains('\0') {
        return Err("Binary files cannot be edited".into());
    }
    let revision = format!("{:x}", Sha256::digest(content.as_bytes()));
    Ok(Document { content, revision })
}
#[tauri::command]
pub async fn choose_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
) -> Result<Option<Workspace>, String> {
    match app.dialog().file().blocking_pick_folder() {
        Some(path) => Ok(Some(activate(
            &state,
            path.into_path().map_err(|e| e.to_string())?,
        )?)),
        None => Ok(None),
    }
}
#[tauri::command]
pub fn list_files(
    state: tauri::State<'_, WorkspaceState>,
    workspace_id: String,
    path: String,
) -> Result<Vec<Entry>, String> {
    let root = root(&state, &workspace_id)?;
    let dir = resolve(&root, &path)?;
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink()
            || matches!(
                name.as_str(),
                ".git" | "node_modules" | "target" | ".next" | ".venv"
            )
        {
            continue;
        }
        if entries.len() >= 5000 {
            return Err("Folder contains more than 5,000 entries; open a smaller folder".into());
        }
        entries.push(Entry {
            path: entry
                .path()
                .strip_prefix(&root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/"),
            name,
            directory: kind.is_dir(),
        });
    }
    entries.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}
#[tauri::command]
pub fn read_file(
    state: tauri::State<'_, WorkspaceState>,
    workspace_id: String,
    path: String,
) -> Result<Document, String> {
    read(&resolve(&root(&state, &workspace_id)?, &path)?)
}
#[tauri::command]
pub fn save_file(
    state: tauri::State<'_, WorkspaceState>,
    workspace_id: String,
    path: String,
    content: String,
    revision: String,
) -> Result<Document, String> {
    save(
        &resolve(&root(&state, &workspace_id)?, &path)?,
        &content,
        &revision,
    )
}
fn save(path: &Path, content: &str, revision: &str) -> Result<Document, String> {
    if content.len() > MAX_FILE as usize || content.contains('\0') {
        return Err("Invalid or oversized text".into());
    }
    if read(path)?.revision != revision {
        return Err(
            "File changed on disk. Reopen it before saving; your draft has been kept.".into(),
        );
    }
    let permissions = fs::metadata(path).map_err(|e| e.to_string())?.permissions();
    if permissions.readonly() {
        return Err("File is read-only".into());
    }
    let mut temporary =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("Missing parent folder")?)
            .map_err(|e| e.to_string())?;
    temporary
        .write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    temporary
        .as_file()
        .set_permissions(permissions)
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    if read(path)?.revision != revision {
        return Err("File changed while saving; your draft has been kept".into());
    }
    temporary.persist(path).map_err(|e| e.to_string())?;
    read(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn save_preserves_external_changes_and_updates_revision() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("code.ts");
        fs::write(&path, "original").unwrap();
        let original = read(&path).unwrap();
        let changed = save(&path, "draft", &original.revision).unwrap();
        assert_eq!(changed.content, "draft");
        assert_ne!(changed.revision, original.revision);
        fs::write(&path, "external change").unwrap();
        assert!(save(&path, "stale draft", &changed.revision).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "external change");
    }
    #[test]
    fn atomic_save_does_not_modify_a_hard_link_target() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("external");
        let alias = dir.path().join("alias");
        fs::write(&original, "original").unwrap();
        fs::hard_link(&original, &alias).unwrap();
        let revision = read(&alias).unwrap().revision;
        save(&alias, "edited", &revision).unwrap();
        assert_eq!(fs::read_to_string(original).unwrap(), "original");
    }
    #[test]
    fn rejects_escape_and_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().canonicalize().unwrap();
        fs::write(base.join("code.ts"), "hello").unwrap();
        assert!(resolve(&base, "code.ts").is_ok());
        for path in [
            "../secret",
            "/etc/passwd",
            "C:\\Windows",
            ".git/config",
            "code.ts:secret",
        ] {
            assert!(resolve(&base, path).is_err(), "{path}");
        }
    }
    #[test]
    fn stale_workspace_and_binary_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let state = WorkspaceState::default();
        let first = activate(&state, dir.path().into()).unwrap();
        activate(&state, dir.path().into()).unwrap();
        assert!(root(&state, &first.id).is_err());
        fs::write(dir.path().join("binary"), b"abc\0def").unwrap();
        assert!(read(&dir.path().join("binary")).is_err());
    }
}
