use std::collections::HashSet;
use std::path::PathBuf;

use floem::reactive::{RwSignal, Scope, SignalUpdate, SignalWith};

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct OpenTab {
    pub path: PathBuf,
}

#[derive(Clone, Copy)]
pub struct AppState {
    pub workspace_root: RwSignal<Option<PathBuf>>,
    pub expanded_dirs: RwSignal<HashSet<PathBuf>>,
    pub open_tabs: RwSignal<Vec<OpenTab>>,
    pub active_tab: RwSignal<Option<PathBuf>>,
}

impl AppState {
    pub fn new(cx: Scope) -> Self {
        Self {
            workspace_root: cx.create_rw_signal(std::env::current_dir().ok()),
            expanded_dirs: cx.create_rw_signal(HashSet::new()),
            open_tabs: cx.create_rw_signal(Vec::new()),
            active_tab: cx.create_rw_signal(None),
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
}
