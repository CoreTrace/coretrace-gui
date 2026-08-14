use floem::prelude::*;
use floem::views::Decorators;

use coretrace_ctrace::Diagnostic;

use crate::state::AppState;
use crate::theme;

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
                Some(message) => {
                    label(move || format!("Error: {message}")).style(|s| s.padding(4.0).color(theme::ERROR)).into_any()
                }
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
                .style(|s| s.flex_col().width_full().row_gap(4.0))
                .into_any(),
                None => label(|| "No analysis run yet".to_string()).style(|s| s.color(theme::TEXT_MUTED)).into_any(),
            },
        ),
    ))
    .style(|s| s.width_full().row_gap(6.0))
}

fn header(state: AppState) -> impl IntoView {
    let active_path = state.active_tab;
    h_stack((
        theme::button("Run CTrace").action(move || {
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
                label(move || text.clone()).style(|s| s.margin_left(8.0).color(theme::TEXT_MUTED)).into_any()
            },
        ),
    ))
    .style(|s| s.items_center())
}

fn diagnostic_row(d: Diagnostic) -> impl IntoView {
    let severity_color = theme::color_for_severity(&d.severity);
    let summary = format!(
        "[{}] {}:{} {} ({})",
        d.severity,
        d.location.start_line,
        d.location.start_column,
        d.rule_id,
        d.cwe.clone().unwrap_or_default()
    );
    v_stack((
        label(move || summary.clone()).style(move |s| s.color(severity_color).font_weight(floem::text::Weight::BOLD)),
        label(move || d.details.message.trim().to_string()).style(|s| s.margin_top(2.0).color(theme::TEXT_MUTED)),
    ))
    .style(|s| {
        s.padding(8.0).width_full().background(theme::BG_SURFACE).border_radius(6.0).border(1.0).border_color(theme::BORDER)
    })
}
