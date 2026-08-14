use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use coretrace_lsp::LspClient;

/// `None` inside the `OnceLock` means "checked, clangd isn't
/// available"; not-yet-set means "still checking". Same async-startup
/// reasoning as `sidecar::SidecarHandle` -- `where clangd` plus, if
/// found, a real `initialize` round trip are both real blocking work
/// that shouldn't sit in front of the first window paint.
pub type LspHandle = &'static OnceLock<Option<&'static LspClient>>;

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

fn spawn_and_initialize() -> Option<&'static LspClient> {
    let binary = find_clangd()?;
    let client = LspClient::spawn(&binary, &["--log=error"]).ok()?;
    let root = std::env::current_dir().ok()?;
    let root_uri = format!("file:///{}", root.to_string_lossy().replace('\\', "/"));
    client.initialize(&root_uri).ok()?;
    println!("[lsp] clangd found and initialized: {}", binary.display());
    Some(Box::leak(Box::new(client)))
}

/// Starts the clangd lookup/spawn/initialize on a background thread and
/// returns immediately -- see `LspHandle`'s doc comment for why.
pub fn spawn_async() -> LspHandle {
    let cell: LspHandle = Box::leak(Box::new(OnceLock::new()));
    std::thread::spawn(move || {
        let client = spawn_and_initialize();
        if client.is_none() {
            println!("[lsp] clangd not found on PATH -- LSP diagnostics/hover disabled, ctrace diagnostics unaffected");
        }
        let _ = cell.set(client);
    });
    cell
}
