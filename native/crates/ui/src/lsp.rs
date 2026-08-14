use std::path::PathBuf;
use std::process::Command;

use coretrace_lsp::LspClient;

/// Looks up `clangd` on the Windows `PATH` via `where`. Not checked in
/// WSL: `wsl.exe`-wrapped stdio has a known encoding quirk for its own
/// text output (see `coretrace-ctrace`'s `wsl` module), and wrapping a
/// long-lived LSP process through it is real, untested risk with no
/// clangd install available anywhere on this machine to verify against
/// either way -- see native/docs/phase2-status.md.
fn find_clangd() -> Option<PathBuf> {
    let output = Command::new("where").arg("clangd").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let first = text.lines().next()?.trim();
    (!first.is_empty()).then(|| PathBuf::from(first))
}

/// Spawns and initializes a clangd client for the lifetime of the app if
/// clangd is available; `None` otherwise (this is the common case on a
/// dev machine without it installed -- diagnostics from ctrace still
/// work independently). Leaked deliberately, same reasoning as
/// `sidecar::spawn()`: one process-lifetime singleton, no teardown
/// needed before exit.
pub fn spawn() -> Option<&'static LspClient> {
    let binary = find_clangd()?;
    let client = LspClient::spawn(&binary, &["--log=error"]).ok()?;
    let root = std::env::current_dir().ok()?;
    let root_uri = format!("file:///{}", root.to_string_lossy().replace('\\', "/"));
    client.initialize(&root_uri).ok()?;
    println!("[lsp] clangd found and initialized: {}", binary.display());
    Some(Box::leak(Box::new(client)))
}
