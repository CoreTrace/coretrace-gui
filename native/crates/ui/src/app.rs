use floem::reactive::Scope;
use floem::Application;

use crate::sidecar;
use crate::state::AppState;
use crate::views::shell::shell;

/// Phase 3 shell: window chrome, file tree, tabbed editor, and a
/// running extension-host sidecar (spawned once here) backing the
/// Extensions panel. No LSP/ctrace yet -- see native/docs/ for phase
/// status.
pub fn run() {
    let sidecar = sidecar::spawn();

    Application::new()
        .window(
            move |_| {
                let state = AppState::new(Scope::current(), sidecar);
                shell(state)
            },
            None,
        )
        .run();
}
