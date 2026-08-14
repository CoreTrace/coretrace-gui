use floem::peniko::Color;
use floem::prelude::*;
use floem::views::Decorators;

use crate::state::AppState;
use crate::theme;

const HEIGHT: f64 = 24.0;

/// The bottom status strip. Beyond looking like an IDE, this is where
/// the background-service state now lives -- the extension-host port
/// used to be a line of body text inside the Extensions panel, and the
/// ctrace target/run state was a line inside the Diagnostics panel.
/// Both are ambient status, not panel content, so they belong here
/// where they're always visible and never in the way.
pub fn status_bar(state: AppState) -> impl IntoView {
    h_stack((
        ctrace_status(state),
        lsp_status(state),
        sidecar_status(state),
        empty().style(|s| s.flex_grow(1.0)),
        active_file(state),
    ))
    .style(|s| {
        s.width_full()
            .height(HEIGHT)
            .min_height(HEIGHT)
            .flex_shrink(0.0)
            .items_center()
            .padding_horiz(10.0)
            .background(theme::BG_ACTIVITY)
            .border_top(1.0)
            .border_color(theme::BORDER)
            .font_size(11.0)
            .color(theme::TEXT_MUTED)
    })
}

/// A small filled dot -- the standard "service state" affordance, and
/// far more scannable at 11px than colored words would be.
fn dot(color: Color) -> impl IntoView {
    empty().style(move |s| s.size(7.0, 7.0).border_radius(4.0).background(color))
}

/// Right margin lives on the item rather than as `column_gap` on the
/// parent: the items are `dyn_container`s, and the gap between them did
/// not render, leaving the labels running together.
fn item(color: Color, text: String) -> impl IntoView {
    h_stack((dot(color), label(move || text.clone())))
        .style(|s| s.items_center().column_gap(5.0).margin_right(16.0))
}

fn sidecar_status(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.sidecar_port.get(),
        move |port| match port {
            Some(port) => item(theme::SUCCESS, format!("Extensions :{port}")).into_any(),
            None => item(theme::TEXT_MUTED, "Extensions starting".to_string()).into_any(),
        },
    )
}

fn lsp_status(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.lsp_found.get(),
        move |found| match found {
            Some(true) => item(theme::SUCCESS, "clangd".to_string()).into_any(),
            // Not an error: ctrace diagnostics work independently, so
            // this is a neutral "unavailable", not a failure.
            Some(false) => item(theme::TEXT_MUTED, "clangd not found".to_string()).into_any(),
            None => item(theme::TEXT_MUTED, "clangd...".to_string()).into_any(),
        },
    )
}

fn ctrace_status(state: AppState) -> impl IntoView {
    dyn_container(
        move || {
            (
                state.diagnostics.running.get(),
                state.diagnostics.result.get().map(|r| r.diagnostics.len()),
                state.diagnostics.error.get().is_some(),
            )
        },
        move |(running, count, failed)| {
            if running {
                return item(theme::WARNING, "CTrace running...".to_string()).into_any();
            }
            if failed {
                return item(theme::ERROR, "CTrace failed".to_string()).into_any();
            }
            match count {
                Some(0) => item(theme::SUCCESS, "CTrace: no findings".to_string()).into_any(),
                Some(n) => item(theme::WARNING, format!("CTrace: {n} finding{}", plural(n))).into_any(),
                None => item(theme::TEXT_MUTED, "CTrace idle".to_string()).into_any(),
            }
        },
    )
}

fn plural(n: usize) -> &'static str {
    if n == 1 {
        ""
    } else {
        "s"
    }
}

fn active_file(state: AppState) -> impl IntoView {
    label(move || {
        state
            .active_tab
            .get()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
            .unwrap_or_default()
    })
}
