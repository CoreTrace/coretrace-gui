use std::path::PathBuf;

use coretrace_ipc::SidecarSupervisor;

/// Dev-time path resolution: relative to this crate's own manifest dir.
/// Packaged builds will need to bundle extension-host/ alongside the
/// exe and resolve relative to `current_exe()` instead -- Phase 5
/// packaging concern, not addressed here.
fn entry_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("extension-host")
        .join("src")
        .join("index.js")
}

/// Spawns the extension-host sidecar for the lifetime of the app. Leaked
/// deliberately: this is a process-lifetime singleton service, same
/// shape as e.g. a logger -- there's exactly one, it never gets torn
/// down early, and leaking it keeps `AppState` plain `Copy` instead of
/// needing `Rc`/lifetime plumbing through every view.
pub fn spawn() -> &'static SidecarSupervisor {
    Box::leak(Box::new(SidecarSupervisor::start(entry_script_path())))
}
