use floem::reactive::Scope;
use floem::Application;

use crate::crash_report;
use crate::lsp;
use crate::sidecar;
use crate::state::AppState;
use crate::views::shell::shell;

/// Window chrome, file tree, tabbed editor, an extension-host sidecar,
/// ctrace diagnostics, and an optional clangd LSP client -- see
/// native/docs/ for phase status.
pub fn run() {
    crash_report::install();
    let sidecar = sidecar::spawn_async();
    let lsp = lsp::spawn_async();

    Application::new()
        .window(
            move |_| {
                let state = AppState::new(Scope::current(), sidecar, lsp);
                shell(state)
            },
            None,
        )
        .run();
}
