// Hits the real open-vsx.org API and installs a real extension --
// deliberately not mocked, matching this project's established
// preference for verifying against the real thing over synthetic
// fixtures. Requires network access.
use coretrace_extensions::{install_extension, list_installed, read_manifest, RegistrySource};

#[test]
fn search_install_and_read_a_real_extension() {
    let registry = RegistrySource::open_vsx();

    let summary = registry
        .get_extension("wmaurer", "change-case")
        .expect("direct lookup of wmaurer.change-case");
    assert_eq!(summary.id(), "wmaurer.change-case");

    let tmp_dir = std::env::temp_dir().join(format!("coretrace-ext-test-{}", std::process::id()));
    std::fs::create_dir_all(&tmp_dir).unwrap();

    let install_dir = install_extension(&registry, &summary, &tmp_dir).expect("install extension");
    assert!(install_dir.join("package.json").is_file(), "package.json should exist after install");
    assert!(install_dir.join("out/src/extension.js").is_file(), "main entry should exist after install");

    let manifest = read_manifest(&install_dir).expect("read installed manifest");
    assert_eq!(manifest.name, "change-case");
    assert_eq!(manifest.publisher.as_deref(), Some("wmaurer"));
    assert_eq!(manifest.id(), "wmaurer.change-case");

    let installed = list_installed(&tmp_dir);
    assert_eq!(installed.len(), 1);
    assert_eq!(installed[0].1.id(), "wmaurer.change-case");

    std::fs::remove_dir_all(&tmp_dir).unwrap();
}
