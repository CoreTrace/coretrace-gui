// Manual test helper: installs a real extension and leaves it installed
// (unlike install_and_run.rs, which cleans up after itself) so a human
// or a follow-up manual UI test can see it in the running app.
use coretrace_extensions::{install_extension, RegistrySource};

fn main() {
    let registry = RegistrySource::open_vsx();
    let summary = registry.get_extension("wmaurer", "change-case").expect("look up extension");
    let dir = coretrace_extensions::extensions_dir();
    std::fs::create_dir_all(&dir).expect("create extensions dir");
    let install_dir = install_extension(&registry, &summary, &dir).expect("install extension");
    println!("installed to {}", install_dir.display());
}
