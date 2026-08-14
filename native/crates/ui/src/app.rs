use floem::Application;

use crate::sidecar_panel::sidecar_panel;

/// Phase 0 spike entry point: a bare window proving the native Floem UI
/// can round-trip a command through the extension-host sidecar over IPC.
pub fn run() {
    Application::new()
        .window(|_| sidecar_panel(), None)
        .run();
}
