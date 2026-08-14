use std::path::{Path, PathBuf};

use crossbeam_channel::{unbounded, Sender};
use floem::ext_event::create_signal_from_channel;
use floem::reactive::{RwSignal, Scope, SignalGet, SignalUpdate};

use coretrace_extensions::{extensions_dir, install_extension, list_installed, uninstall_extension};
use coretrace_extensions::{ExtensionManifest, ExtensionSummary, RegistrySource};

use crate::sidecar::SidecarHandle;

/// Results of the two network operations this panel performs, delivered
/// back to the UI thread. Both used to run inline on the UI thread,
/// which froze the whole window for the length of an HTTP round trip.
#[derive(Clone)]
enum RegistryEvent {
    Results(Vec<ExtensionSummary>),
    Installed(Result<(), String>),
}

#[derive(Clone, Copy)]
pub struct ExtensionsState {
    pub sidecar: SidecarHandle,
    pub installed: RwSignal<Vec<(PathBuf, ExtensionManifest)>>,
    pub search_query: RwSignal<String>,
    pub search_results: RwSignal<Vec<ExtensionSummary>>,
    pub searching: RwSignal<bool>,
    /// The extension whose detail view is open, if any.
    pub selected: RwSignal<Option<ExtensionSummary>>,
    pub installing: RwSignal<bool>,
    pub error: RwSignal<Option<String>>,
    tx: &'static Sender<RegistryEvent>,
}

impl ExtensionsState {
    pub fn new(cx: Scope, sidecar: SidecarHandle) -> Self {
        let (tx, rx) = unbounded::<RegistryEvent>();
        let incoming = create_signal_from_channel(rx);

        let state = Self {
            sidecar,
            installed: cx.create_rw_signal(Vec::new()),
            search_query: cx.create_rw_signal(String::new()),
            search_results: cx.create_rw_signal(Vec::new()),
            searching: cx.create_rw_signal(false),
            selected: cx.create_rw_signal(None),
            installing: cx.create_rw_signal(false),
            error: cx.create_rw_signal(None),
            tx: Box::leak(Box::new(tx)),
        };

        cx.create_effect(move |_| {
            let Some(event) = incoming.get() else { return };
            match event {
                RegistryEvent::Results(results) => {
                    state.search_results.set(results);
                    state.searching.set(false);
                }
                RegistryEvent::Installed(outcome) => {
                    state.installing.set(false);
                    match outcome {
                        Ok(()) => {
                            state.error.set(None);
                            state.selected.set(None);
                            state.refresh_installed();
                        }
                        Err(message) => state.error.set(Some(message)),
                    }
                }
            }
        });

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
        self.searching.set(true);
        let tx = self.tx.clone();
        std::thread::spawn(move || {
            let results = RegistrySource::open_vsx().search(&query, 20).unwrap_or_default();
            let _ = tx.send(RegistryEvent::Results(results));
        });
    }

    pub fn select(&self, summary: ExtensionSummary) {
        self.error.set(None);
        self.selected.set(Some(summary));
    }

    pub fn clear_selection(&self) {
        self.selected.set(None);
    }

    /// Downloads and unpacks the extension on a background thread.
    ///
    /// Restart required to activate: the sidecar only enumerates
    /// extensions_dir() at startup (see extension-host/src/index.js).
    /// Known limitation -- hot-reload is future work.
    pub fn install(&self, summary: ExtensionSummary) {
        if self.installing.get_untracked() {
            return;
        }
        self.installing.set(true);
        self.error.set(None);
        let tx = self.tx.clone();
        std::thread::spawn(move || {
            let registry = RegistrySource::open_vsx();
            let dir = extensions_dir();
            let outcome = std::fs::create_dir_all(&dir)
                .map_err(|e| e.to_string())
                .and_then(|()| install_extension(&registry, &summary, &dir).map_err(|e| e.to_string()))
                .map(|_| ());
            let _ = tx.send(RegistryEvent::Installed(outcome));
        });
    }

    pub fn uninstall(&self, extension_dir: &Path) {
        let _ = uninstall_extension(extension_dir);
        self.refresh_installed();
    }
}
