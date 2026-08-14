use floem::keyboard::{Key, NamedKey};
use floem::prelude::*;
use floem::views::Decorators;

use coretrace_core::SearchMatch;

use crate::state::AppState;
use crate::theme;
use crate::views::widgets::{empty_state, panel_header};

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

fn results(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.search_results.get(),
        move |matches| {
            if matches.is_empty() {
                return empty_state("No results").into_any();
            }
            let count = matches.len();
            v_stack((
                label(move || format!("{count} result{}", if count == 1 { "" } else { "s" }))
                    .style(|s| s.color(theme::TEXT_MUTED).font_size(11.0).padding_horiz(12.0).padding_bottom(4.0)),
                dyn_stack(
                    move || matches.clone(),
                    |m: &SearchMatch| (m.path.clone(), m.line_number),
                    move |m| result_row(m, state).into_any(),
                )
                .style(|s| s.flex_col().width_full()),
            ))
            .style(|s| s.width_full())
            .into_any()
        },
    )
}

fn result_row(m: SearchMatch, state: AppState) -> impl IntoView {
    let open_path = m.path.clone();
    let file = m
        .path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let location = format!("{file}:{}", m.line_number);
    let snippet = m.line_text.trim().to_string();

    // Two lines per hit: where it is, then what matched. The old
    // single-line "file:line  text" run-on was unreadable once the
    // snippet was more than a few characters.
    v_stack((
        label(move || location.clone()).style(|s| s.color(theme::TEXT_MUTED).font_size(11.0)),
        label(move || snippet.clone()).style(|s| s.color(theme::TEXT).font_size(12.0)),
    ))
    .on_click_stop(move |_| state.open_file(open_path.clone()))
    .style(|s| {
        s.width_full()
            .padding_horiz(12.0)
            .padding_vert(4.0)
            .flex_col()
            .row_gap(1.0)
            .hover(|s| s.background(theme::HOVER))
    })
}
