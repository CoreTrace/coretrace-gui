use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

// The `Io` payload is read via the derived Debug impl (`{err:?}` in the
// supervise loop below), which the dead_code lint doesn't recognize as
// a use.
#[derive(Debug)]
#[allow(dead_code)]
pub enum SpawnError {
    Io(std::io::Error),
    NoReadyLine,
}

impl From<std::io::Error> for SpawnError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

struct SidecarHandle {
    child: Child,
    port: u16,
}

/// Spawns `node <entry_script>` and blocks until its `READY <port>`
/// stdout line appears (see extension-host/src/index.js -- keep that
/// line format in sync with the parsing here). Forwards the sidecar's
/// remaining stdout to this process's stdout on a background thread so
/// its pipe never fills up and blocks the child.
fn spawn_sidecar(entry_script: &Path) -> Result<SidecarHandle, SpawnError> {
    let mut child = Command::new("node")
        .arg(entry_script)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()?;

    let stdout = child.stdout.take().expect("stdout was piped");
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();

    let port = loop {
        line.clear();
        let bytes_read = reader.read_line(&mut line)?;
        if bytes_read == 0 {
            return Err(SpawnError::NoReadyLine);
        }
        if let Some(port_str) = line.trim().strip_prefix("READY ") {
            if let Ok(port) = port_str.trim().parse() {
                break port;
            }
        }
        print!("[sidecar] {line}");
    };

    thread::spawn(move || {
        for line in reader.lines().map_while(Result::ok) {
            println!("[sidecar] {line}");
        }
    });

    Ok(SidecarHandle { child, port })
}

/// Keeps the extension-host sidecar running, respawning it (with
/// exponential backoff) if it crashes. `port()` always reflects the
/// current instance -- callers should re-fetch it before reconnecting
/// after a respawn rather than caching it.
#[derive(Clone, Copy, Default)]
struct SidecarInfo {
    port: Option<u16>,
    pid: Option<u32>,
}

pub struct SidecarSupervisor {
    info: Arc<Mutex<SidecarInfo>>,
}

impl SidecarSupervisor {
    pub fn start(entry_script: PathBuf) -> Self {
        let info = Arc::new(Mutex::new(SidecarInfo::default()));
        let info_for_thread = Arc::clone(&info);
        thread::spawn(move || supervise_loop(entry_script, info_for_thread));
        Self { info }
    }

    pub fn port(&self) -> Option<u16> {
        self.info.lock().unwrap().port
    }

    /// The current sidecar process's OS PID. Mainly for
    /// observability/testing (e.g. proving crash recovery by killing
    /// the real process and watching a new one -- with a new PID and
    /// port -- come up); production code should prefer `port()`.
    pub fn pid(&self) -> Option<u32> {
        self.info.lock().unwrap().pid
    }
}

fn supervise_loop(entry_script: PathBuf, info_slot: Arc<Mutex<SidecarInfo>>) {
    let mut backoff = Duration::from_millis(200);
    const MAX_BACKOFF: Duration = Duration::from_secs(10);

    loop {
        *info_slot.lock().unwrap() = SidecarInfo::default();
        match spawn_sidecar(&entry_script) {
            Ok(mut handle) => {
                *info_slot.lock().unwrap() =
                    SidecarInfo { port: Some(handle.port), pid: Some(handle.child.id()) };
                backoff = Duration::from_millis(200);
                let _ = handle.child.wait(); // blocks until the sidecar exits or crashes
                eprintln!("[sidecar] process exited, respawning");
            }
            Err(err) => {
                eprintln!("[sidecar] failed to start ({err:?}), retrying in {backoff:?}");
                thread::sleep(backoff);
                backoff = (backoff * 2).min(MAX_BACKOFF);
            }
        }
    }
}
