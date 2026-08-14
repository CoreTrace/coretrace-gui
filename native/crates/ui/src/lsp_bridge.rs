use std::path::Path;

use coretrace_lsp::LspClient;

use crate::sidecar_bridge::language_id_for;

pub fn file_uri(path: &Path) -> String {
    format!("file:///{}", path.to_string_lossy().replace('\\', "/"))
}

/// Tells clangd about a tab's content when it's first mounted. Real
/// call, but unverified end to end in this environment: there's no
/// clangd binary installed anywhere on this dev machine to click
/// through against (see native/docs/phase2-status.md) -- `state.lsp`
/// is `None` in every manual test run so far, so this path compiles
/// and matches the crate-level protocol tests but hasn't been observed
/// producing real diagnostics in the running app.
pub fn notify_open(client: &LspClient, path: &Path, text: &str) {
    let _ = client.did_open(&file_uri(path), language_id_for(path), text);
}
