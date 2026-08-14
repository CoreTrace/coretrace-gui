// Proves the Phase 0 sidecar is running a real, unmodified VSCode
// extension (wmaurer.change-case, fetched from Open VSX — see
// native/extension-host/spike-extension/README.md), not a hand-written
// stub command. Run against a live sidecar that loaded it successfully.
use coretrace_ipc::{ExtensionHostClient, HostResponse};

fn main() {
    let mut client = ExtensionHostClient::connect(7331).expect("connect to sidecar");

    client
        .set_document_text("hello world", None, None)
        .expect("set document text");

    let response = client
        .invoke_command("extension.changeCase.camel", vec![])
        .expect("invoke real extension command");
    match response {
        HostResponse::CommandResult { .. } => {}
        other => panic!("unexpected response invoking command: {other:?}"),
    }

    let response = client.get_document_text().expect("read document text back");
    let HostResponse::DocumentText { text } = response else {
        panic!("unexpected response reading document text: {response:?}");
    };

    println!("document after real extension command ran: {text:?}");
    assert_eq!(text, "helloWorld", "real change-case extension did not produce the expected result");
    println!("OK: unmodified wmaurer.change-case extension ran inside the Node sidecar and mutated the document via IPC");
}
