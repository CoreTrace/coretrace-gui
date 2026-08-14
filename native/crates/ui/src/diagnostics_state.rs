use std::path::{Path, PathBuf};

use crossbeam_channel::{unbounded, Sender};
use floem::ext_event::create_signal_from_channel;
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

type RunOutcome = Result<AnalysisResult, String>;

#[derive(Clone, Copy)]
pub struct DiagnosticsState {
    pub running: RwSignal<bool>,
    pub last_run_file: RwSignal<Option<PathBuf>>,
    pub result: RwSignal<Option<AnalysisResult>>,
    pub error: RwSignal<Option<String>>,
    /// Sends a finished run back to the UI thread. Held here so every
    /// `run_on` reuses the same channel rather than creating a signal
    /// per run (`create_signal_from_channel` is a setup-time call).
    tx: &'static Sender<RunOutcome>,
}

impl DiagnosticsState {
    pub fn new(cx: Scope) -> Self {
        let (tx, rx) = unbounded::<RunOutcome>();
        let incoming = create_signal_from_channel(rx);

        let state = Self {
            running: cx.create_rw_signal(false),
            last_run_file: cx.create_rw_signal(None),
            result: cx.create_rw_signal(None),
            error: cx.create_rw_signal(None),
            tx: Box::leak(Box::new(tx)),
        };

        cx.create_effect(move |_| {
            let Some(outcome) = incoming.get() else { return };
            match outcome {
                Ok(result) => {
                    state.error.set(None);
                    state.result.set(Some(result));
                }
                Err(message) => {
                    state.result.set(None);
                    state.error.set(Some(message));
                }
            }
            state.running.set(false);
        });

        state
    }

    /// Runs ctrace on a background thread and reports back through the
    /// channel above.
    ///
    /// This used to run synchronously on the UI thread. That meant the
    /// `running` signal was set and cleared within a single frame, so
    /// the UI never repainted in between -- pressing Run appeared to do
    /// nothing for the second or two the analysis took, which is
    /// exactly the "no feedback" the review called out. The work is a
    /// WSL round trip, so it genuinely has to be off the UI thread for
    /// any progress state to be visible.
    pub fn run_on(&self, file: &Path) {
        if self.running.get_untracked() {
            return;
        }
        self.running.set(true);
        self.error.set(None);
        self.last_run_file.set(Some(file.to_path_buf()));

        let file = file.to_path_buf();
        let tx = self.tx.clone();
        std::thread::spawn(move || {
            let outcome = run_static_analysis(&ctrace_bin_path(), &file).map_err(|e| e.to_string());
            let _ = tx.send(outcome);
        });
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
