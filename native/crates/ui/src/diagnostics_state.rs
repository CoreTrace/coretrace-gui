use std::path::{Path, PathBuf};

use floem::reactive::{RwSignal, Scope, SignalGet, SignalUpdate};

use coretrace_ctrace::{run_static_analysis, AnalysisResult, Diagnostic};

/// Packaged installs bundle `bin/ctrace` next to the exe (same
/// electron-builder `extraResources` layout the old app used, kept for
/// parity -- see `native/packaging/`); dev builds fall back to the
/// repo's own `bin/ctrace`. See `bundled_path::resolve`.
fn ctrace_bin_path() -> PathBuf {
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../bin/ctrace");
    crate::bundled_path::resolve(dev, "bin/ctrace")
}

#[derive(Clone, Copy)]
pub struct DiagnosticsState {
    pub running: RwSignal<bool>,
    pub last_run_file: RwSignal<Option<PathBuf>>,
    pub result: RwSignal<Option<AnalysisResult>>,
    pub error: RwSignal<Option<String>>,
}

impl DiagnosticsState {
    pub fn new(cx: Scope) -> Self {
        Self {
            running: cx.create_rw_signal(false),
            last_run_file: cx.create_rw_signal(None),
            result: cx.create_rw_signal(None),
            error: cx.create_rw_signal(None),
        }
    }

    /// Blocking on purpose -- ctrace's one-shot WSL invocation takes on
    /// the order of a second for a single file, called from a UI action
    /// (button click), not a hot path. Async would need real justification
    /// (a background executor wired into Floem) that this doesn't have yet.
    pub fn run_on(&self, file: &Path) {
        self.running.set(true);
        self.error.set(None);
        match run_static_analysis(&ctrace_bin_path(), file) {
            Ok(result) => {
                self.result.set(Some(result));
                self.last_run_file.set(Some(file.to_path_buf()));
            }
            Err(e) => {
                self.result.set(None);
                self.error.set(Some(e.to_string()));
            }
        }
        self.running.set(false);
    }

    /// Diagnostics belonging to `file`, for gutter/inline rendering in
    /// that file's editor. Compares by file name only -- ctrace reports
    /// the WSL-side path (`/mnt/c/...`), not the original Windows path.
    pub fn diagnostics_for(&self, file: &Path) -> Vec<Diagnostic> {
        let Some(result) = self.result.get_untracked() else {
            return Vec::new();
        };
        let target_name = file.file_name();
        result
            .diagnostics
            .into_iter()
            .filter(|d| Path::new(&d.location.file).file_name() == target_name)
            .collect()
    }
}
