use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use floem::ext_event::create_signal_from_channel;
use floem::reactive::untrack;
use floem::reactive::{ReadSignal, RwSignal, Scope, SignalGet, SignalUpdate, SignalWith};

use coretrace_core::{search_in_files, SearchMatch};

use crate::assistant_state::AssistantState;
use crate::diagnostics_state::DiagnosticsState;
use crate::extensions_state::ExtensionsState;
use crate::session::{self, SessionData};

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
    Assistant,
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
    /// Live editor handles by path, registered as each tab mounts, so
    /// other panels can drive the cursor (see `goto_location`).
    pub editors: RwSignal<HashMap<PathBuf, floem::views::editor::Editor>>,
    /// A requested jump, consumed by whichever editor owns that path.
    /// Routed through a signal rather than called directly because the
    /// target file may not be open yet -- `open_file` mounts its editor
    /// asynchronously, so there is nothing to drive at call time.
    pub pending_goto: RwSignal<Option<(PathBuf, u32)>>,
    pub sidebar_mode: RwSignal<SidebarMode>,
    /// Whether the sidebar panel is expanded. Clicking the already-
    /// active activity-bar icon collapses it, the same toggle every
    /// IDE with an icon rail uses to reclaim width for the editor.
    pub sidebar_open: RwSignal<bool>,
    pub search_query: RwSignal<String>,
    pub search_results: RwSignal<Vec<SearchMatch>>,
    /// Files whose search-result group is collapsed.
    pub search_collapsed: RwSignal<HashSet<PathBuf>>,
    pub extensions: ExtensionsState,
    pub diagnostics: DiagnosticsState,
    pub lsp: crate::lsp::LspHandle,
    pub assistant: AssistantState,
    pub palette: crate::palette_state::PaletteState,
    /// Sidecar port once the background spawn finishes, for the status
    /// bar. Reactive (unlike the `OnceLock` handles), so the bar
    /// re-renders the moment startup completes.
    pub sidecar_port: ReadSignal<Option<u16>>,
    /// `Some(true)`/`Some(false)` once the clangd lookup finishes.
    pub lsp_found: ReadSignal<Option<bool>>,
}

impl AppState {
    pub fn new(cx: Scope, sidecar: crate::sidecar::SidecarStartup, lsp: crate::lsp::LspStartup) -> Self {
        let sidecar_port = create_signal_from_channel(sidecar.ready);
        let lsp_found = create_signal_from_channel(lsp.ready);
        let sidecar = sidecar.handle;
        let lsp = lsp.handle;
        let restored = session::load();
        let workspace_root = restored.workspace_root.clone().or_else(|| std::env::current_dir().ok());
        let open_tabs: Vec<OpenTab> = restored.open_tabs.iter().map(|p| OpenTab { path: p.clone() }).collect();
        let active_tab = restored.active_tab.clone();

        let state = Self {
            workspace_root: cx.create_rw_signal(workspace_root),
            expanded_dirs: cx.create_rw_signal(HashSet::new()),
            open_tabs: cx.create_rw_signal(open_tabs),
            active_tab: cx.create_rw_signal(active_tab),
            tree_version: cx.create_rw_signal(0),
            pending_edit: cx.create_rw_signal(None),
            pending_edit_name: cx.create_rw_signal(String::new()),
            editors: cx.create_rw_signal(HashMap::new()),
            pending_goto: cx.create_rw_signal(None),
            sidebar_mode: cx.create_rw_signal(SidebarMode::Files),
            sidebar_open: cx.create_rw_signal(true),
            search_query: cx.create_rw_signal(String::new()),
            search_results: cx.create_rw_signal(Vec::new()),
            search_collapsed: cx.create_rw_signal(HashSet::new()),
            extensions: ExtensionsState::new(cx, sidecar),
            diagnostics: DiagnosticsState::new(cx),
            lsp,
            assistant: AssistantState::new(cx),
            palette: crate::palette_state::PaletteState::new(cx),
            sidecar_port,
            lsp_found,
        };

        // An editor computes its syntax/diagnostic styling once, when
        // it mounts. Analysis is now asynchronous, so results arrive
        // after the editor is already on screen -- without this the
        // markers only ever showed up on the *next* run. Remounting the
        // analyzed file when results land rebuilds its styling with
        // them.
        //
        // The body must run untracked. `close_tab`/`open_file` *read*
        // `open_tabs` as well as writing it, and a tracked read inside
        // an effect that also writes that signal makes the effect
        // retrigger itself -- which overflowed the stack and killed the
        // process the first time this shipped.
        cx.create_effect(move |_| {
            let _ = state.diagnostics.result.get();
            untrack(|| {
                let Some(path) = state.diagnostics.last_run_file.get_untracked() else { return };
                if state.open_tabs.with(|tabs| tabs.iter().any(|t| t.path == path)) {
                    state.close_tab(&path);
                    state.open_file(path);
                }
            });
        });

        // Persist whenever the workspace/tabs change -- continuous
        // rather than only on a clean exit, so a crash doesn't lose the
        // last-known session (see native/docs/phase5-status.md).
        cx.create_effect(move |_| {
            let data = SessionData {
                workspace_root: state.workspace_root.get(),
                open_tabs: state.open_tabs.with(|tabs| tabs.iter().map(|t| t.path.clone()).collect()),
                active_tab: state.active_tab.get(),
            };
            session::save(&data);
        });

        state
    }

    /// `None` if clangd wasn't found, or hasn't finished the
    /// background lookup/initialize yet -- see `lsp::LspHandle`.
    pub fn lsp_client(&self) -> Option<&'static coretrace_lsp::LspClient> {
        self.lsp.get().copied().flatten()
    }

    /// Switches the sidebar to `mode`, or collapses the panel if that
    /// mode was already showing.
    pub fn toggle_panel(&self, mode: SidebarMode) {
        if self.sidebar_mode.get_untracked() == mode && self.sidebar_open.get_untracked() {
            self.sidebar_open.set(false);
        } else {
            self.sidebar_mode.set(mode);
            self.sidebar_open.set(true);
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

    /// Opens `path` if needed and moves its caret to `line` (1-based).
    /// The editor that owns the path applies this when it sees it --
    /// immediately if already mounted, or on mount if it was just
    /// opened by this call.
    pub fn goto_location(&self, path: PathBuf, line: u32) {
        self.pending_goto.set(Some((path.clone(), line)));
        self.open_file(path);
    }

    pub fn close_tab(&self, path: &std::path::Path) {
        self.open_tabs.update(|tabs| tabs.retain(|t| t.path != path));
        // Drop the editor handle too, or the map keeps a closed tab's
        // editor (and its document) alive for the rest of the session.
        self.editors.update(|editors| {
            editors.remove(path);
        });
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
