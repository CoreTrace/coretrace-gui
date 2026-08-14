use floem::kurbo::Size;
use floem::reactive::Scope;
use floem::window::WindowConfig;
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
            // Default size matters here: an icon rail, a 260px sidebar,
            // and a code editor genuinely don't fit in the small window
            // winit picks by default -- the editor ended up narrower
            // than the sidebar. This is a *logical* size, so it's
            // multiplied by the display scale: 1100x700 is still
            // 1650x1050 physical at 150% scaling, which is about the
            // largest that fits a 1080p screen at that setting.
            Some(
                WindowConfig::default()
                    .size(Size::new(1100.0, 700.0))
                    .title("CoreTrace"),
            ),
        )
        .run();
}
