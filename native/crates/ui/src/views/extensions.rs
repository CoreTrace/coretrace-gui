use std::path::PathBuf;

use floem::keyboard::{Key, NamedKey};
use floem::prelude::*;
use floem::views::Decorators;

use coretrace_extensions::{ExtensionManifest, ExtensionSummary};

use crate::state::AppState;
use crate::theme;
use crate::views::widgets::{empty_state, panel_header, section_label};

pub fn extensions_panel(state: AppState) -> impl IntoView {
    let ext = state.extensions;

    v_stack((
        panel_header("EXTENSIONS", empty()),
        text_input(ext.search_query)
            .placeholder("Search Open VSX")
            .keyboard_navigable()
            .on_key_down(Key::Named(NamedKey::Enter), |_| true, move |_| ext.search())
            .style(|s| s.width_full().margin_horiz(10.0).margin_bottom(4.0)),
        dyn_container(
            move || ext.search_results.get(),
            move |results| {
                if results.is_empty() {
                    return empty().into_any();
                }
                v_stack((
                    section_label("RESULTS"),
                    dyn_stack(
                        move || results.clone(),
                        |e: &ExtensionSummary| e.id(),
                        move |e| search_result_row(e, state).into_any(),
                    )
                    .style(|s| s.flex_col().width_full()),
                ))
                .style(|s| s.width_full())
                .into_any()
            },
        ),
        section_label("INSTALLED"),
        dyn_container(
            move || ext.installed.get(),
            move |installed| {
                if installed.is_empty() {
                    return empty_state("None installed").into_any();
                }
                dyn_stack(
                    move || installed.clone(),
                    |(path, _): &(PathBuf, ExtensionManifest)| path.clone(),
                    move |(path, manifest)| installed_row(path, manifest, state).into_any(),
                )
                .style(|s| s.flex_col().width_full())
                .into_any()
            },
        ),
        install_confirm_dialog(state),
    ))
    .style(|s| s.width_full().flex_col())
}

/// Name over publisher/description, with the action on the right --
/// the standard marketplace-listing shape, and dense enough that
/// several fit in a 260px panel.
fn entry_row(
    title: String,
    subtitle: String,
    action_label: &'static str,
    on_action: impl Fn() + 'static,
) -> impl IntoView {
    h_stack((
        v_stack((
            label(move || title.clone()).style(|s| s.color(theme::TEXT_BRIGHT).font_size(12.5).min_width(0.0)),
            label(move || subtitle.clone()).style(|s| s.color(theme::TEXT_MUTED).font_size(11.0).min_width(0.0)),
        ))
        .style(|s| s.flex_col().min_width(0.0).flex_grow(1.0).row_gap(1.0)),
        button(action_label)
            .action(on_action)
            .style(|s| s.font_size(11.0).padding_horiz(7.0).padding_vert(2.0)),
    ))
    .style(|s| {
        s.width_full()
            .items_center()
            .column_gap(6.0)
            .padding_horiz(12.0)
            .padding_vert(6.0)
            .hover(|s| s.background(theme::HOVER))
    })
}

fn search_result_row(summary: ExtensionSummary, state: AppState) -> impl IntoView {
    let title = summary.display_name.clone().unwrap_or_else(|| summary.name.clone());
    let subtitle = summary.description.clone().unwrap_or_else(|| summary.id());
    let install_summary = summary.clone();

    entry_row(title, subtitle, "Install", move || {
        state.extensions.request_install(install_summary.clone())
    })
}

fn installed_row(path: PathBuf, manifest: ExtensionManifest, state: AppState) -> impl IntoView {
    let title = manifest.display_name.clone().unwrap_or_else(|| manifest.name.clone());
    let subtitle = format!("{} · v{}", manifest.id(), manifest.version);

    entry_row(title, subtitle, "Remove", move || state.extensions.uninstall(&path))
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
        label(move || format!("Install \"{title}\"?"))
            .style(|s| s.color(theme::TEXT_BRIGHT).font_weight(floem::text::Weight::SEMIBOLD)),
        label(move || id.clone()).style(|s| s.color(theme::TEXT_MUTED).font_size(11.0)),
        label(move || description.clone()).style(|s| s.color(theme::TEXT).font_size(12.0)),
        h_stack((
            button("Install").action(move || state.extensions.confirm_install()),
            button("Cancel").action(move || state.extensions.cancel_install()),
        ))
        .style(|s| s.column_gap(6.0).margin_top(2.0)),
    ))
    .style(|s| {
        s.margin(10.0)
            .padding(10.0)
            .background(theme::BG_ELEVATED)
            .border(1.0)
            .border_color(theme::ACCENT)
            .border_radius(6.0)
            .flex_col()
            .row_gap(4.0)
    })
}
