// Verifies the real updater client against a real HTTP server on a
// real socket -- no live update server exists for this project yet.
mod support;

use coretrace_updater::{check_for_update, download_update, fetch_manifest, Component, ComponentInfo};
use support::MockServer;

const MANIFEST: &str = r#"{
    "app": {"version": "2.0.0", "url": "http://example.invalid/app.exe"},
    "ctrace": {"version": "1.5.0", "url": "http://example.invalid/ctrace"}
}"#;

#[test]
fn detects_a_newer_app_version() {
    let server = MockServer::start("application/json", MANIFEST.as_bytes());
    let manifest = fetch_manifest(&server.base_url).expect("fetch manifest");

    let update = check_for_update(&manifest, Component::App, "1.9.0").expect("check app version");
    assert!(update.is_some());
    assert_eq!(update.unwrap().version, "2.0.0");
}

#[test]
fn reports_no_update_when_current_version_is_newer_or_equal() {
    let server = MockServer::start("application/json", MANIFEST.as_bytes());
    let manifest = fetch_manifest(&server.base_url).expect("fetch manifest");

    assert!(check_for_update(&manifest, Component::App, "2.0.0").unwrap().is_none());
    assert!(check_for_update(&manifest, Component::App, "3.0.0").unwrap().is_none());
}

#[test]
fn checks_ctrace_independently_of_the_app() {
    let server = MockServer::start("application/json", MANIFEST.as_bytes());
    let manifest = fetch_manifest(&server.base_url).expect("fetch manifest");

    // ctrace is ahead of the app's own current version in this
    // manifest -- confirms the two components are compared
    // independently, not conflated.
    let ctrace_update = check_for_update(&manifest, Component::Ctrace, "1.0.0").unwrap();
    assert_eq!(ctrace_update.unwrap().version, "1.5.0");
}

#[test]
fn downloads_real_bytes_to_disk() {
    let payload = b"fake binary contents for the update test";
    let server = MockServer::start("application/octet-stream", payload);

    let info = ComponentInfo { version: "9.9.9".to_string(), url: server.base_url.clone() };
    let dest = std::env::temp_dir().join(format!("coretrace_update_test_{}.bin", std::process::id()));
    download_update(&info, &dest).expect("download update");

    let downloaded = std::fs::read(&dest).expect("read downloaded file");
    assert_eq!(downloaded, payload);
    let _ = std::fs::remove_file(&dest);
}
