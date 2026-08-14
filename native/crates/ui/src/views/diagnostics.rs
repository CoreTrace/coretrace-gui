use floem::prelude::*;
use floem::views::Decorators;

use coretrace_ctrace::Diagnostic;

use crate::state::AppState;

/// Runs `ctrace`'s one-shot static analysis on the active file and lists
/// the resulting diagnostics. Reopens the tab after a run so the editor
/// remounts with diagnostic-aware syntax highlighting (see
/// `syntax::TreeSitterStyling`) -- same tab-reopen pattern the Commands
/// panel uses, for the same reason (no supported way to patch an
/// already-mounted TextDocument from outside its own view).
pub fn diagnostics_panel(state: AppState) -> impl IntoView {
    v_stack((
        header(state),
        dyn_container(
            move || state.diagnostics.error.get(),
            move |err| match err {
                Some(message) => label(move || format!("Error: {message}")).into_any(),
                None => empty().into_any(),
            },
        ),
        dyn_container(
            move || state.diagnostics.result.get().map(|r| r.diagnostics),
            move |diagnostics| match diagnostics {
                Some(items) => dyn_stack(
                    move || items.clone(),
                    |d: &Diagnostic| d.id.clone(),
                    diagnostic_row,
                )
                .style(|s| s.flex_col().width_full())
                .into_any(),
                None => label(|| "No analysis run yet".to_string()).into_any(),
            },
        ),
    ))
    .style(|s| s.width_full())
}

fn header(state: AppState) -> impl IntoView {
    let active_path = state.active_tab;
    h_stack((
        button("Run CTrace").action(move || {
            if let Some(path) = active_path.get_untracked() {
                state.diagnostics.run_on(&path);
                state.close_tab(&path);
                state.open_file(path);
            }
        }),
        dyn_container(
            move || (state.diagnostics.running.get(), active_path.get()),
            move |(running, path)| {
                let text = if running {
                    "Running...".to_string()
                } else {
                    match path {
                        Some(p) => format!("Target: {}", p.display()),
                        None => "No active file".to_string(),
                    }
                };
                label(move || text.clone()).style(|s| s.margin_left(8.0)).into_any()
            },
        ),
    ))
    .style(|s| s.padding(4.0).items_center())
}

fn diagnostic_row(d: Diagnostic) -> impl IntoView {
    let summary = format!(
        "[{}] {}:{} {} ({})",
        d.severity,
        d.location.start_line,
        d.location.start_column,
        d.rule_id,
        d.cwe.clone().unwrap_or_default()
    );
    v_stack((
        label(move || summary.clone()),
        label(move || d.details.message.trim().to_string()).style(|s| s.margin_left(12.0)),
    ))
    .style(|s| s.padding(4.0).width_full())
}
