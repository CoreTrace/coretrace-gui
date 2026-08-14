mod error;
mod installed;
mod manifest;
mod registry;
mod vsix;

pub use error::RegistryError;
pub use installed::{extensions_dir, install_extension, list_installed, uninstall_extension};
pub use manifest::{read_manifest, ExtensionManifest};
pub use registry::{ExtensionFiles, ExtensionSummary, RegistrySource, DEFAULT_REGISTRY_URL};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_finds_something_for_a_common_query() {
        let registry = RegistrySource::open_vsx();
        let results = registry.search("csv", 5).expect("search open-vsx.org");
        assert!(!results.is_empty(), "expected at least one result for a common query");
    }
}
