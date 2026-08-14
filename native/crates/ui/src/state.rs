use std::collections::HashSet;
use std::path::PathBuf;

use floem::reactive::{RwSignal, Scope, SignalGet, SignalUpdate, SignalWith};

use coretrace_core::{search_in_files, SearchMatch};

use crate::diagnostics_state::DiagnosticsState;
use crate::extensions_state::ExtensionsState;

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct OpenTab {
    pub path: PathBuf,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SidebarMode {
    Files,
    Search,
    Extensions,
    Commands,
    Diagnostics,
}

/// An in-progress file-tree edit (rename or create), rendered as an
/// inline text input in place of the row it applies to.
#[derive(Clone, PartialEq, Eq)]
pub enum PendingEdit {
    Rename { path: PathBuf },
    NewFile { parent: PathBuf },
    NewDir { parent: PathBuf },
}

#[derive(Clone, Copy)]
pub struct AppState {
    pub workspace_root: RwSignal<Option<PathBuf>>,
    pub expanded_dirs: RwSignal<HashSet<PathBuf>>,
    pub open_tabs: RwSignal<Vec<OpenTab>>,
    pub active_tab: RwSignal<Option<PathBuf>>,
    /// Bumped after any create/delete/rename so file_tree's dyn_stack
    /// (which otherwise has no reactive dependency on the filesystem)
    /// knows to re-scan the affected directory.
    pub tree_version: RwSignal<u64>,
    pub pending_edit: RwSignal<Option<PendingEdit>>,
    pub pending_edit_name: RwSignal<String>,
    pub sidebar_mode: RwSignal<SidebarMode>,
    pub search_query: RwSignal<String>,
    pub search_results: RwSignal<Vec<SearchMatch>>,
    pub extensions: ExtensionsState,
    pub diagnostics: DiagnosticsState,
    pub lsp: Option<&'static coretrace_lsp::LspClient>,
}

impl AppState {
    pub fn new(
        cx: Scope,
        sidecar: &'static coretrace_ipc::SidecarSupervisor,
        lsp: Option<&'static coretrace_lsp::LspClient>,
    ) -> Self {
        Self {
            workspace_root: cx.create_rw_signal(std::env::current_dir().ok()),
            expanded_dirs: cx.create_rw_signal(HashSet::new()),
            open_tabs: cx.create_rw_signal(Vec::new()),
            active_tab: cx.create_rw_signal(None),
            tree_version: cx.create_rw_signal(0),
            pending_edit: cx.create_rw_signal(None),
            pending_edit_name: cx.create_rw_signal(String::new()),
            sidebar_mode: cx.create_rw_signal(SidebarMode::Files),
            search_query: cx.create_rw_signal(String::new()),
            search_results: cx.create_rw_signal(Vec::new()),
            extensions: ExtensionsState::new(cx, sidecar),
            diagnostics: DiagnosticsState::new(cx),
            lsp,
        }
    }

    pub fn toggle_expanded(&self, path: PathBuf) {
        self.expanded_dirs.update(|dirs| {
            if !dirs.remove(&path) {
                dirs.insert(path);
            }
        });
    }

    pub fn is_expanded(&self, path: &std::path::Path) -> bool {
        self.expanded_dirs.with(|dirs| dirs.contains(path))
    }

    pub fn open_file(&self, path: PathBuf) {
        let already_open = self
            .open_tabs
            .with(|tabs| tabs.iter().any(|t| t.path == path));
        if !already_open {
            self.open_tabs.update(|tabs| tabs.push(OpenTab { path: path.clone() }));
        }
        self.active_tab.set(Some(path));
    }

    pub fn close_tab(&self, path: &std::path::Path) {
        self.open_tabs.update(|tabs| tabs.retain(|t| t.path != path));
        let was_active = self.active_tab.with(|active| active.as_deref() == Some(path));
        if was_active {
            let next = self.open_tabs.with(|tabs| tabs.last().map(|t| t.path.clone()));
            self.active_tab.set(next);
        }
    }

    pub fn begin_edit(&self, edit: PendingEdit, initial_name: String) {
        self.pending_edit_name.set(initial_name);
        self.pending_edit.set(Some(edit));
    }

    pub fn cancel_edit(&self) {
        self.pending_edit.set(None);
    }

    pub fn bump_tree_version(&self) {
        self.tree_version.update(|v| *v += 1);
    }

    pub fn run_search(&self) {
        let Some(root) = self.workspace_root.get() else {
            return;
        };
        let query = self.search_query.get();
        let results = search_in_files(&root, &query);
        self.search_results.set(results);
    }
}
