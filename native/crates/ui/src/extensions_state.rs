use std::path::{Path, PathBuf};

use floem::reactive::{RwSignal, Scope, SignalGet, SignalUpdate};

use coretrace_extensions::{extensions_dir, install_extension, list_installed, uninstall_extension};
use coretrace_extensions::{ExtensionManifest, ExtensionSummary, RegistrySource};
use coretrace_ipc::SidecarSupervisor;

#[derive(Clone, Copy)]
pub struct ExtensionsState {
    pub sidecar: &'static SidecarSupervisor,
    pub installed: RwSignal<Vec<(PathBuf, ExtensionManifest)>>,
    pub search_query: RwSignal<String>,
    pub search_results: RwSignal<Vec<ExtensionSummary>>,
    /// Set while an install is awaiting user confirmation -- the UI
    /// shows this as a dialog with the extension's name/publisher/
    /// description before actually downloading anything.
    pub pending_install: RwSignal<Option<ExtensionSummary>>,
}

impl ExtensionsState {
    pub fn new(cx: Scope, sidecar: &'static SidecarSupervisor) -> Self {
        let state = Self {
            sidecar,
            installed: cx.create_rw_signal(Vec::new()),
            search_query: cx.create_rw_signal(String::new()),
            search_results: cx.create_rw_signal(Vec::new()),
            pending_install: cx.create_rw_signal(None),
        };
        state.refresh_installed();
        state
    }

    pub fn refresh_installed(&self) {
        self.installed.set(list_installed(&extensions_dir()));
    }

    pub fn search(&self) {
        let query = self.search_query.get_untracked();
        if query.trim().is_empty() {
            self.search_results.set(Vec::new());
            return;
        }
        if let Ok(results) = RegistrySource::open_vsx().search(&query, 20) {
            self.search_results.set(results);
        }
    }

    pub fn request_install(&self, summary: ExtensionSummary) {
        self.pending_install.set(Some(summary));
    }

    pub fn cancel_install(&self) {
        self.pending_install.set(None);
    }

    /// Restart required to activate: the sidecar only enumerates
    /// extensions_dir() at startup (see extension-host/src/index.js).
    /// Known Phase 3 limitation -- hot-reload is future work.
    pub fn confirm_install(&self) {
        let Some(summary) = self.pending_install.get_untracked() else {
            return;
        };
        let registry = RegistrySource::open_vsx();
        let dir = extensions_dir();
        let _ = std::fs::create_dir_all(&dir);
        let _ = install_extension(&registry, &summary, &dir);
        self.pending_install.set(None);
        self.refresh_installed();
    }

    pub fn uninstall(&self, extension_dir: &Path) {
        let _ = uninstall_extension(extension_dir);
        self.refresh_installed();
    }
}
