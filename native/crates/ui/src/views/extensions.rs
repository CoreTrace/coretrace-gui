use std::path::PathBuf;

use floem::keyboard::{Key, NamedKey};
use floem::prelude::*;
use floem::views::Decorators;

use coretrace_extensions::{ExtensionManifest, ExtensionSummary};

use crate::state::AppState;
use crate::theme;
use crate::views::widgets::{empty_state, panel_header, section_label};

pub fn extensions_panel(state: AppState) -> impl IntoView {
    // Selecting a result swaps the whole panel for a detail view.
    // Previously the install confirmation was appended *below* the
    // search results and the installed list, so installing anything
    // meant scrolling past every result to reach it.
    dyn_container(
        move || state.extensions.selected.get(),
        move |selected| match selected {
            Some(summary) => detail_view(summary, state).into_any(),
            None => browse_view(state).into_any(),
        },
    )
    .style(|s| s.width_full().flex_col())
}

fn browse_view(state: AppState) -> impl IntoView {
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
    ))
    .style(|s| s.width_full().flex_col())
}

/// Full-panel detail for one extension, reached by clicking a result.
/// The action sits at the top, so it is reachable without scrolling
/// regardless of how long the description runs.
fn detail_view(summary: ExtensionSummary, state: AppState) -> impl IntoView {
    let title = summary.display_name.clone().unwrap_or_else(|| summary.name.clone());
    let id = summary.id();
    let version = summary.version.clone();
    let description = summary
        .description
        .clone()
        .unwrap_or_else(|| "No description provided.".to_string());
    let install_summary = summary.clone();

    let installing = state.extensions.installing;

    v_stack((
        h_stack((
            label(|| "\u{2039} Back".to_string())
                .on_click_stop(move |_| state.extensions.clear_selection())
                .style(|s| {
                    s.color(theme::TEXT_MUTED)
                        .font_size(12.0)
                        .padding_horiz(6.0)
                        .padding_vert(2.0)
                        .border_radius(4.0)
                        .hover(|s| s.background(theme::HOVER).color(theme::TEXT_BRIGHT))
                }),
            empty().style(|s| s.flex_grow(1.0)),
        ))
        .style(|s| s.width_full().items_center().padding_horiz(6.0).padding_vert(6.0)),
        v_stack((
            label(move || title.clone())
                .style(|s| s.color(theme::TEXT_BRIGHT).font_size(15.0).font_weight(floem::text::Weight::SEMIBOLD)),
            label(move || {
                if version.is_empty() {
                    id.clone()
                } else {
                    format!("{id} · v{version}")
                }
            })
            .style(|s| s.color(theme::TEXT_MUTED).font_size(11.0)),
            dyn_container(
                move || installing.get(),
                move |busy| {
                    if busy {
                        return label(|| "Installing...".to_string())
                            .style(|s| s.color(theme::TEXT_MUTED).font_size(12.0).padding_vert(4.0))
                            .into_any();
                    }
                    let summary = install_summary.clone();
                    button("Install")
                        .action(move || state.extensions.install(summary.clone()))
                        .style(|s| s.margin_top(4.0))
                        .into_any()
                },
            ),
            label(move || description.clone())
                .style(|s| s.color(theme::TEXT).font_size(12.0).margin_top(6.0).width_full()),
        ))
        .style(|s| s.width_full().flex_col().row_gap(3.0).padding_horiz(12.0)),
    ))
    .style(|s| s.width_full().flex_col())
}

/// Name over publisher/description, dense enough that several fit in a
/// 260px panel. The whole row selects; there is no per-row Install
/// button, because installing without seeing what you're installing was
/// the other half of the problem.
fn entry_row(title: String, subtitle: String, action: Option<(&'static str, Box<dyn Fn()>)>) -> impl IntoView {
    let trailing = match action {
        Some((text, on_click)) => button(text)
            .action(move || on_click())
            .style(|s| s.font_size(11.0).padding_horiz(7.0).padding_vert(2.0))
            .into_any(),
        None => empty().into_any(),
    };

    h_stack((
        v_stack((
            label(move || title.clone()).style(|s| s.color(theme::TEXT_BRIGHT).font_size(12.5).min_width(0.0)),
            label(move || subtitle.clone()).style(|s| s.color(theme::TEXT_MUTED).font_size(11.0).min_width(0.0)),
        ))
        .style(|s| s.flex_col().min_width(0.0).flex_grow(1.0).row_gap(1.0)),
        trailing,
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
    let selected = summary.clone();

    entry_row(title, subtitle, None).on_click_stop(move |_| state.extensions.select(selected.clone()))
}

fn installed_row(path: PathBuf, manifest: ExtensionManifest, state: AppState) -> impl IntoView {
    let title = manifest.display_name.clone().unwrap_or_else(|| manifest.name.clone());
    let subtitle = format!("{} · v{}", manifest.id(), manifest.version);

    entry_row(
        title,
        subtitle,
        Some(("Remove", Box::new(move || state.extensions.uninstall(&path)))),
    )
}
