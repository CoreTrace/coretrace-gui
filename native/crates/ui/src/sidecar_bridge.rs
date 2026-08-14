use std::path::Path;

use coretrace_ipc::{ExtensionHostClient, HostResponse, SidecarSupervisor};

/// VSCode-style languageId from a file extension -- a different,
/// simpler mapping than syntax::language_for (which picks a
/// tree-sitter grammar); extensions/LSP-shaped code cares about this
/// string, not our highlighter's internals.
pub fn language_id_for(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("c" | "h") => "c",
        Some("cpp" | "cc" | "cxx" | "hpp" | "hh" | "hxx") => "cpp",
        Some("rs") => "rust",
        Some("js" | "mjs") => "javascript",
        Some("ts") => "typescript",
        Some("json") => "json",
        Some("md") => "markdown",
        _ => "plaintext",
    }
}

fn connect(sidecar: &SidecarSupervisor) -> Option<ExtensionHostClient> {
    ExtensionHostClient::connect(sidecar.port()?).ok()
}

/// Pushes a tab's content into the sidecar's document state. Called
/// once when a tab is first mounted (see views/editor.rs) -- not on
/// every keystroke, so an installed extension's command operates on
/// the file's on-disk content as of when the tab was opened, not
/// necessarily unsaved in-editor changes. Known limitation, see
/// native/docs/phase3-status.md.
pub fn sync_document(sidecar: &SidecarSupervisor, path: &Path, text: &str) {
    let Some(mut client) = connect(sidecar) else { return };
    let file_name = path.to_string_lossy().into_owned();
    let language_id = language_id_for(path);
    let _ = client.set_document_text(text, Some(&file_name), Some(language_id));
}

pub fn list_commands(sidecar: &SidecarSupervisor) -> Vec<String> {
    let Some(mut client) = connect(sidecar) else {
        return Vec::new();
    };
    match client.list_commands() {
        Ok(HostResponse::Commands { commands }) => commands,
        _ => Vec::new(),
    }
}

/// Runs `command` against `path`'s current on-disk content, then writes
/// whatever the sidecar's document ends up containing back to disk.
/// Returns `true` on success -- callers should reload the tab (close +
/// reopen) to show the result, since there's no supported way to patch
/// an already-mounted Floem `TextDocument`'s content from outside its
/// own view.
pub fn run_command_on_file(sidecar: &SidecarSupervisor, path: &Path, command: &str) -> bool {
    let Ok(content) = coretrace_core::read_file(path) else {
        return false;
    };
    let Some(mut client) = connect(sidecar) else {
        return false;
    };
    let file_name = path.to_string_lossy().into_owned();
    let language_id = language_id_for(path);
    if client.set_document_text(&content, Some(&file_name), Some(language_id)).is_err() {
        return false;
    }
    if client.invoke_command(command, Vec::new()).is_err() {
        return false;
    }
    match client.get_document_text() {
        Ok(HostResponse::DocumentText { text }) => coretrace_core::write_file(path, &text).is_ok(),
        _ => false,
    }
}
