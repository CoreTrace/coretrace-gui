// Exercises LspClient against a real subprocess speaking the real LSP
// wire protocol (Content-Length framing, JSON-RPC id correlation,
// request/response vs notification demuxing) -- clangd itself isn't
// available on this dev machine, so this is the real verification
// available for the client's own logic. See phase2-status.md.
use std::path::PathBuf;
use std::time::{Duration, Instant};

use coretrace_lsp::LspClient;

fn fake_server_binary() -> PathBuf {
    let exe = format!("fake_lsp_server{}", std::env::consts::EXE_SUFFIX);
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/debug/examples").join(exe)
}

#[test]
fn full_round_trip_against_a_real_subprocess() {
    let binary = fake_server_binary();
    assert!(
        binary.exists(),
        "build the fake server first: cargo build -p coretrace-lsp --example fake_lsp_server"
    );

    let client = LspClient::spawn(&binary, &[]).expect("spawn fake server");

    let init = client.initialize("file:///test").expect("initialize");
    assert!(init.get("capabilities").is_some());

    client.did_open("file:///test/a.c", "c", "int main(){}").expect("did_open");

    let deadline = Instant::now() + Duration::from_secs(2);
    let mut diagnostics = Vec::new();
    while Instant::now() < deadline {
        diagnostics = client.diagnostics_for("file:///test/a.c");
        if !diagnostics.is_empty() {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].message, "fake diagnostic from test server");

    let hover = client.hover("file:///test/a.c", 0, 0).expect("hover");
    assert_eq!(hover["contents"], "fake hover text");
}
