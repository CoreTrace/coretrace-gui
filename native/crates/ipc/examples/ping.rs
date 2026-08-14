// Headless smoke test for the Phase 0 IPC round-trip, run against a live
// `node native/extension-host/src/index.js` sidecar. The UI crate exercises
// the same client from a button click; this just proves it without a GUI.
use coretrace_ipc::ExtensionHostClient;

fn main() {
    let mut client = ExtensionHostClient::connect(7331).expect("connect to sidecar");
    let pong = client.ping().expect("ping sidecar");
    println!("ping -> {pong:?}");

    let result = client
        .invoke_command("coretrace.spike.echo", vec![serde_json::json!("hello")])
        .expect("invoke command");
    println!("invoke_command -> {result:?}");
}
