use std::path::PathBuf;

use floem::keyboard::{Key, NamedKey};
use floem::prelude::*;
use floem::views::{svg, Decorators};

use coretrace_core::SearchMatch;

use crate::state::AppState;
use crate::theme;
use crate::views::icons;
use crate::views::widgets::{empty_state, panel_header};

/// One file's worth of hits.
#[derive(Clone, PartialEq, Eq)]
struct FileGroup {
    path: PathBuf,
    matches: Vec<SearchMatch>,
}

pub fn search_panel(state: AppState) -> impl IntoView {
    v_stack((
        panel_header("SEARCH", empty()),
        text_input(state.search_query)
            .placeholder("Search in files")
            .keyboard_navigable()
            .on_key_down(Key::Named(NamedKey::Enter), |_| true, move |_| state.run_search())
            .style(|s| s.width_full().margin_horiz(10.0).margin_bottom(6.0)),
        results(state),
    ))
    .style(|s| s.width_full().flex_col())
}

/// Groups hits by file, preserving the order files were first seen so
/// results stay stable between renders.
fn group_by_file(matches: Vec<SearchMatch>) -> Vec<FileGroup> {
    let mut groups: Vec<FileGroup> = Vec::new();
    for m in matches {
        match groups.iter_mut().find(|g| g.path == m.path) {
            Some(group) => group.matches.push(m),
            None => groups.push(FileGroup { path: m.path.clone(), matches: vec![m] }),
        }
    }
    groups
}

fn results(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.search_results.get(),
        move |matches| {
            if matches.is_empty() {
                return empty_state("No results").into_any();
            }
            let total = matches.len();
            let groups = group_by_file(matches);
            let file_count = groups.len();

            v_stack((
                label(move || {
                    format!(
                        "{total} result{} in {file_count} file{}",
                        plural(total),
                        plural(file_count)
                    )
                })
                .style(|s| s.color(theme::TEXT_MUTED).font_size(11.0).padding_horiz(12.0).padding_bottom(4.0)),
                dyn_stack(
                    move || groups.clone(),
                    |g: &FileGroup| g.path.clone(),
                    move |g| file_group(g, state).into_any(),
                )
                .style(|s| s.flex_col().width_full()),
            ))
            .style(|s| s.width_full())
            .into_any()
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

/// A collapsible file header with a match-count badge, then the
/// matching lines indented beneath it. The previous flat list gave no
/// sense of which file a hit belonged to until you read every row.
fn file_group(group: FileGroup, state: AppState) -> impl IntoView {
    let path = group.path.clone();
    let toggle_path = path.clone();
    let watch_path = path.clone();
    let count = group.matches.len();

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let parent = path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    let chevron_path = watch_path.clone();
    let is_collapsed = move || state.search_collapsed.with(|set| set.contains(&watch_path));
    let chevron_collapsed = move || state.search_collapsed.with(|set| set.contains(&chevron_path));

    let header = h_stack((
        svg(icons::chevron_down())
            .update_value(move || {
                if chevron_collapsed() {
                    icons::chevron_right()
                } else {
                    icons::chevron_down()
                }
            })
            .style(|s| s.size(13.0, 13.0).min_width(13.0).color(theme::TEXT_MUTED)),
        label(move || name.clone()).style(|s| s.color(theme::TEXT_BRIGHT).font_size(12.5)),
        // Explicit margin rather than the parent's `column_gap`, which
        // does not render between these labels.
        label(move || parent.clone())
            .style(|s| s.color(theme::TEXT_MUTED).font_size(11.0).min_width(0.0).margin_left(6.0)),
        empty().style(|s| s.flex_grow(1.0)),
        label(move || count.to_string()).style(|s| {
            s.color(theme::TEXT_MUTED)
                .font_size(10.5)
                .background(theme::BG_ELEVATED)
                .border_radius(9.0)
                .padding_horiz(6.0)
                .padding_vert(1.0)
        }),
    ))
    .on_click_stop(move |_| {
        state.search_collapsed.update(|set| {
            if !set.remove(&toggle_path) {
                set.insert(toggle_path.clone());
            }
        });
    })
    .style(|s| {
        s.width_full()
            .items_center()
            .column_gap(5.0)
            .padding_left(8.0)
            .padding_right(10.0)
            .padding_vert(4.0)
            .hover(|s| s.background(theme::HOVER))
    });

    let matches = group.matches.clone();
    v_stack((
        header,
        dyn_container(
            is_collapsed,
            move |collapsed| {
                if collapsed {
                    return empty().into_any();
                }
                let matches = matches.clone();
                dyn_stack(
                    move || matches.clone(),
                    |m: &SearchMatch| (m.path.clone(), m.line_number),
                    move |m| match_row(m, state).into_any(),
                )
                .style(|s| s.flex_col().width_full())
                .into_any()
            },
        ),
    ))
    .style(|s| s.width_full().flex_col())
}

fn match_row(m: SearchMatch, state: AppState) -> impl IntoView {
    let open_path = m.path.clone();
    let line = m.line_number;
    let snippet = m.line_text.trim().to_string();

    h_stack((
        label(move || line.to_string())
            .style(|s| s.color(theme::TEXT_MUTED).font_size(11.0).min_width(28.0)),
        label(move || snippet.clone()).style(|s| s.color(theme::TEXT).font_size(12.0).min_width(0.0)),
    ))
    // Jumping straight to the matching line is the whole point of a
    // search result; opening the file at the top was never useful.
    .on_click_stop(move |_| state.goto_location(open_path.clone(), line as u32))
    .style(|s| {
        s.width_full()
            .items_center()
            .column_gap(6.0)
            .padding_left(26.0)
            .padding_right(10.0)
            .padding_vert(2.0)
            .hover(|s| s.background(theme::HOVER))
    })
}
