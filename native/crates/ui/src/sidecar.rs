use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use crossbeam_channel::{bounded, Receiver};

use coretrace_ipc::SidecarSupervisor;

/// A handle to the sidecar that may still be starting up. `.get()`
/// returns `None` until the background spawn thread finishes the
/// blocking `READY <port>` handshake -- callers that need the sidecar
/// before then (e.g. a click in the Extensions panel in the first
/// instant after launch) just see "not ready yet" rather than blocking
/// the whole UI thread on it.
pub type SidecarHandle = &'static OnceLock<&'static SidecarSupervisor>;

/// What `spawn_async` hands back: the handle used for real work, plus a
/// one-shot channel that fires with the negotiated port once the
/// sidecar is up. The channel exists because `OnceLock` isn't
/// reactive -- the status bar needs to *re-render* when the sidecar
/// becomes ready, not just be able to read it on demand.
pub struct SidecarStartup {
    pub handle: SidecarHandle,
    pub ready: Receiver<u16>,
}

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

/// How long to wait for the sidecar to report its port before giving
/// up on updating the status bar. The sidecar itself keeps retrying
/// with backoff regardless -- this only bounds the readiness watcher.
const READY_TIMEOUT: Duration = Duration::from_secs(30);

/// Brings up the extension-host sidecar without blocking the caller,
/// so window creation never waits on Node's cold start.
pub fn spawn_async() -> SidecarStartup {
    let cell: SidecarHandle = Box::leak(Box::new(OnceLock::new()));
    let (tx, ready) = bounded(1);
    std::thread::spawn(move || {
        let supervisor: &'static SidecarSupervisor = Box::leak(Box::new(SidecarSupervisor::start(entry_script_path())));
        let _ = cell.set(supervisor);

        // `SidecarSupervisor::start` returns immediately -- it spawns
        // its own supervise thread, which fills the port in only after
        // the Node process reports `READY <port>`. Reading `port()`
        // once right here always saw `None`, so the status bar sat on
        // "Extensions starting" forever even though the sidecar was up.
        let deadline = Instant::now() + READY_TIMEOUT;
        while Instant::now() < deadline {
            if let Some(port) = supervisor.port() {
                let _ = tx.send(port);
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    });
    SidecarStartup { handle: cell, ready }
}
