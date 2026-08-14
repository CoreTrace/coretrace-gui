use floem::prelude::*;

use coretrace_ipc::{ExtensionHostClient, HostResponse};

/// TCP loopback port the extension-host sidecar listens on for the spike.
/// Hardcoded for Phase 0 only; Phase 3 replaces this with a supervised,
/// dynamically-negotiated local IPC channel.
const SIDECAR_PORT: u16 = 7331;

/// View that pings the extension-host sidecar and shows the round-trip
/// result. This is the Phase 0 proof: native UI -> IPC -> Node sidecar -> back.
pub fn sidecar_panel() -> impl IntoView {
    let status = RwSignal::new("not connected".to_string());

    v_stack((
        label(move || format!("Sidecar status: {}", status.get())),
        button("Ping extension host").action(move || {
            status.set(ping_sidecar());
        }),
    ))
}

fn ping_sidecar() -> String {
    match ExtensionHostClient::connect(SIDECAR_PORT) {
        Ok(mut client) => match client.ping() {
            Ok(HostResponse::Pong) => "pong received".to_string(),
            Ok(other) => format!("unexpected response: {other:?}"),
            Err(err) => format!("ping failed: {err}"),
        },
        Err(err) => format!("connect failed: {err}"),
    }
}
