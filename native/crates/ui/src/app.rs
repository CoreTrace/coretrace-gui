use floem::reactive::Scope;
use floem::Application;

use crate::state::AppState;
use crate::views::shell::shell;

/// Phase 1 minimal native shell: window chrome, file tree, tabbed editor.
/// No LSP, no extensions, no ctrace yet -- see native/docs/phase0-status.md
/// for the Phase 0 spike this builds on and native/docs/ for Phase 1 status.
pub fn run() {
    Application::new()
        .window(
            |_| {
                let state = AppState::new(Scope::current());
                shell(state)
            },
            None,
        )
        .run();
}
