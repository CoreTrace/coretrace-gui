// End-to-end proof that the Phase 3 pieces connect: install a real
// extension via coretrace_extensions into the real extensions_dir(),
// spawn the sidecar via coretrace_ipc::SidecarSupervisor (which loads
// everything in that directory, see extension-host/src/index.js), and
// invoke the extension's real command over IPC.
use std::path::PathBuf;
use std::time::{Duration, Instant};

use coretrace_extensions::{install_extension, uninstall_extension, RegistrySource};
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
    let extensions_dir = coretrace_extensions::extensions_dir();
    std::fs::create_dir_all(&extensions_dir).expect("create extensions dir");

    let registry = RegistrySource::open_vsx();
    let summary = registry.get_extension("wmaurer", "change-case").expect("look up wmaurer.change-case");
    let install_dir = install_extension(&registry, &summary, &extensions_dir).expect("install extension");
    println!("installed to {}", install_dir.display());

    let entry_script =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("extension-host").join("src").join("index.js");
    let supervisor = SidecarSupervisor::start(entry_script);
    let port = wait_for("sidecar start", Duration::from_secs(10), || supervisor.port());

    let mut client = ExtensionHostClient::connect(port).expect("connect to sidecar");
    client.set_document_text("hello world", None, None).expect("set document text");
    client.invoke_command("extension.changeCase.camel", vec![]).expect("invoke real command");
    let HostResponse::DocumentText { text } = client.get_document_text().expect("read document text") else {
        panic!("unexpected response reading document text");
    };
    assert_eq!(text, "helloWorld");
    println!("OK: extension installed via coretrace_extensions was loaded by the sidecar and ran for real");

    uninstall_extension(&install_dir).expect("clean up installed extension");
}
