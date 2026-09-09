// Proves the Phase 3 production-quality requirement: the sidecar is
// spawned by Rust (not manually started like the Phase 0 examples),
// gets a dynamically negotiated port (not the old hardcoded 7331), and
// automatically respawns with a new port after a real crash.
use std::path::PathBuf;
use std::time::{Duration, Instant};

use coretrace_ipc::{ExtensionHostClient, HostResponse, SidecarSupervisor};

fn wait_for<T>(label: &str, timeout: Duration, mut poll: impl FnMut() -> Option<T>) -> T {
    let start = Instant::now();
    loop {
        if let Some(value) = poll() {
            return value;
        }
        if start.elapsed() > timeout {
            panic!("timed out waiting for {label}");
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn main() {
    let entry_script =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("extension-host").join("src").join("index.js");
    let supervisor = SidecarSupervisor::start(entry_script);

    let port1 = wait_for("first sidecar start", Duration::from_secs(10), || supervisor.port());
    let pid1 = supervisor.pid().expect("pid available once port is set");
    println!("sidecar #1: pid={pid1} port={port1}");

    let token1 = supervisor.token().expect("token available");
    let mut client = ExtensionHostClient::connect(port1, &token1).expect("connect to sidecar #1");
    assert!(matches!(client.ping().unwrap(), HostResponse::Pong));
    println!("sidecar #1 responds to ping");

    println!("killing pid {pid1} to simulate a crash...");
    kill_process(pid1);

    let port2 = wait_for("respawn after crash", Duration::from_secs(10), || {
        supervisor.port().filter(|p| *p != port1)
    });
    let pid2 = supervisor.pid().expect("pid available after respawn");
    println!("sidecar #2: pid={pid2} port={port2}");
    assert_ne!(pid1, pid2, "respawned process should have a different PID");
    assert_ne!(port1, port2, "respawned process should get a freshly negotiated port");

    let token2 = supervisor.token().expect("token available after respawn");
    let mut client2 = ExtensionHostClient::connect(port2, &token2).expect("connect to sidecar #2");
    assert!(matches!(client2.ping().unwrap(), HostResponse::Pong));
    println!("sidecar #2 responds to ping");

    println!("OK: spawn -> dynamic port -> crash -> auto-respawn -> new port, all verified");
    kill_process(pid2); // clean up before exiting
}

#[cfg(windows)]
fn kill_process(pid: u32) {
    std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .status()
        .expect("run taskkill");
}

#[cfg(not(windows))]
fn kill_process(pid: u32) {
    std::process::Command::new("kill").args(["-9", &pid.to_string()]).status().expect("run kill");
}
