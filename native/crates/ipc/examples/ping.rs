// Headless smoke test for the Phase 0 IPC round-trip, run against a live
// `node native/extension-host/src/index.js` sidecar. The UI crate exercises
// the same client from a button click; this just proves it without a GUI.
use coretrace_ipc::ExtensionHostClient;

fn main() {
    let mut client = ExtensionHostClient::connect(7331, &dev_token()).expect("connect to sidecar");
    let pong = client.ping().expect("ping sidecar");
    println!("ping -> {pong:?}");

    let result = client
        .invoke_command("coretrace.spike.echo", vec![serde_json::json!("hello")])
        .expect("invoke command");
    println!("invoke_command -> {result:?}");
}

/// Manual dev runs start the sidecar by hand (`PORT=7331 node src/index.js`);
/// it prints `TOKEN <hex>` at startup, pass that back via CORETRACE_HOST_TOKEN.
fn dev_token() -> String {
    std::env::var(coretrace_ipc::TOKEN_ENV).unwrap_or_default()
}
