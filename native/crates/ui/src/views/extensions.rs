use std::path::PathBuf;

use floem::keyboard::{Key, NamedKey};
use floem::peniko::Color;
use floem::prelude::*;
use floem::views::Decorators;

use coretrace_extensions::{ExtensionManifest, ExtensionSummary};

use crate::state::AppState;

pub fn extensions_panel(state: AppState) -> impl IntoView {
    let ext = state.extensions;
    // Snapshot at panel-open time: shell.rs rebuilds this whole panel
    // fresh each time the sidebar switches to Extensions, so re-opening
    // the tab is how this refreshes -- not live-updating while the
    // panel stays open, but honest about what it shows rather than a
    // value frozen from app startup.
    let sidecar_status = match ext.sidecar.port() {
        Some(port) => format!("Extension host: running (port {port})"),
        None => "Extension host: starting...".to_string(),
    };

    v_stack((
        label(move || sidecar_status.clone()).style(|s| s.padding(4.0).color(Color::rgb8(0x60, 0x60, 0x60))),
        h_stack((
            text_input(ext.search_query)
                .keyboard_navigable()
                .on_key_down(Key::Named(NamedKey::Enter), |_| true, move |_| ext.search())
                .style(|s| s.flex_grow(1.0)),
            button("Search").action(move || ext.search()),
        ))
        .style(|s| s.width_full().padding(4.0)),
        label(|| "Search results".to_string()).style(|s| s.padding(4.0).font_weight(floem::text::Weight::BOLD)),
        dyn_stack(
            move || ext.search_results.get(),
            |e: &ExtensionSummary| e.id(),
            move |e| search_result_row(e, state).into_any(),
        )
        .style(|s| s.flex_col().width_full()),
        label(|| "Installed".to_string()).style(|s| s.padding(4.0).font_weight(floem::text::Weight::BOLD)),
        dyn_stack(
            move || ext.installed.get(),
            |(path, _): &(PathBuf, ExtensionManifest)| path.clone(),
            move |(path, manifest)| installed_row(path, manifest, state).into_any(),
        )
        .style(|s| s.flex_col().width_full()),
        install_confirm_dialog(state),
    ))
    .style(|s| s.width_full())
}

fn search_result_row(summary: ExtensionSummary, state: AppState) -> impl IntoView {
    let title = summary.display_name.clone().unwrap_or_else(|| summary.name.clone());
    let subtitle = format!("{} -- {}", summary.id(), summary.description.clone().unwrap_or_default());
    let install_summary = summary.clone();

    h_stack((
        button("Install").action(move || state.extensions.request_install(install_summary.clone())),
        v_stack((label(move || title.clone()), label(move || subtitle.clone()))).style(|s| s.margin_left(8.0)),
    ))
    .style(|s| s.padding(4.0).width_full().items_center())
}

fn installed_row(path: PathBuf, manifest: ExtensionManifest, state: AppState) -> impl IntoView {
    let title = manifest.display_name.clone().unwrap_or_else(|| manifest.name.clone());
    let subtitle = format!("{} v{}", manifest.id(), manifest.version);
    let uninstall_path = path.clone();

    h_stack((
        button("Uninstall").action(move || state.extensions.uninstall(&uninstall_path)),
        v_stack((label(move || title.clone()), label(move || subtitle.clone()))).style(|s| s.margin_left(8.0)),
    ))
    .style(|s| s.padding(4.0).width_full().items_center())
}

/// Shown while `pending_install` is set: extension identity/description
/// review before anything is actually downloaded -- the closest
/// equivalent to a permissions prompt this shim currently has (no
/// fine-grained capability model exists yet, matching VSCode's own
/// install-confirmation-only approach for most extensions).
fn install_confirm_dialog(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.extensions.pending_install.get(),
        move |pending| match pending {
            Some(summary) => confirm_dialog_content(summary, state).into_any(),
            None => empty().into_any(),
        },
    )
}

fn confirm_dialog_content(summary: ExtensionSummary, state: AppState) -> impl IntoView {
    let title = summary.display_name.clone().unwrap_or_else(|| summary.name.clone());
    let id = summary.id();
    let description = summary.description.clone().unwrap_or_default();

    v_stack((
        label(move || format!("Install \"{title}\"?")),
        label(move || id.clone()),
        label(move || description.clone()),
        h_stack((
            button("Install").action(move || state.extensions.confirm_install()),
            button("Cancel").action(move || state.extensions.cancel_install()),
        )),
    ))
    .style(|s| {
        s.padding(10.0)
            .margin(6.0)
            .border(1.0)
            .border_color(Color::rgb8(0x80, 0x80, 0x80))
            .flex_col()
            .row_gap(6.0)
    })
}
