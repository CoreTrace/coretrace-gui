use floem::reactive::Scope;
use floem::Application;

use crate::lsp;
use crate::sidecar;
use crate::state::AppState;
use crate::views::shell::shell;

/// Window chrome, file tree, tabbed editor, an extension-host sidecar,
/// ctrace diagnostics, and an optional clangd LSP client -- see
/// native/docs/ for phase status.
pub fn run() {
    let sidecar = sidecar::spawn();
    let lsp_client = lsp::spawn();
    if lsp_client.is_none() {
        println!("[lsp] clangd not found on PATH -- LSP diagnostics/hover disabled, ctrace diagnostics unaffected");
    }

    Application::new()
        .window(
            move |_| {
                let state = AppState::new(Scope::current(), sidecar, lsp_client);
                shell(state)
            },
            None,
        )
        .run();
}
