use std::path::PathBuf;
use std::sync::OnceLock;

use coretrace_ipc::SidecarSupervisor;

/// A handle to the sidecar that may still be starting up. `.get()`
/// returns `None` until the background spawn thread finishes the
/// blocking `READY <port>` handshake -- callers that need the sidecar
/// before then (e.g. a click in the Extensions panel in the first
/// instant after launch) just see "not ready yet" rather than blocking
/// the whole UI thread on it.
pub type SidecarHandle = &'static OnceLock<&'static SidecarSupervisor>;

/// Packaged installs bundle `extension-host/` next to the exe (see the
/// NSIS script in `native/packaging/`); dev builds fall back to this
/// crate's own source tree. See `bundled_path::resolve`.
fn entry_script_path() -> PathBuf {
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("extension-host")
        .join("src")
        .join("index.js");
    crate::bundled_path::resolve(dev, "extension-host/src/index.js")
}

/// Starts spawning the extension-host sidecar on a background thread
/// and returns immediately -- `SidecarSupervisor::start` blocks on a
/// real handshake with the Node process (see crates/ipc/src/
/// supervisor.rs), which used to happen before the window was even
/// created, adding node's own cold-start time directly to this app's
/// time-to-visible-window. A real regression found by re-measuring
/// startup for Phase 5 (see native/docs/phase5-status.md) -- window
/// creation no longer waits on it.
pub fn spawn_async() -> SidecarHandle {
    let cell: SidecarHandle = Box::leak(Box::new(OnceLock::new()));
    std::thread::spawn(move || {
        let supervisor: &'static SidecarSupervisor = Box::leak(Box::new(SidecarSupervisor::start(entry_script_path())));
        let _ = cell.set(supervisor);
    });
    cell
}
