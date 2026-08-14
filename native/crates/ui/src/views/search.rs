use floem::keyboard::{Key, NamedKey};
use floem::prelude::*;
use floem::views::Decorators;

use coretrace_core::SearchMatch;

use crate::state::AppState;
use crate::theme;

pub fn search_panel(state: AppState) -> impl IntoView {
    v_stack((
        h_stack((
            theme::text_input(state.search_query)
                .keyboard_navigable()
                .on_key_down(Key::Named(NamedKey::Enter), |_| true, move |_| state.run_search())
                .style(|s| s.flex_grow(1.0)),
            theme::button("Search").action(move || state.run_search()),
        ))
        .style(|s| s.width_full().column_gap(6.0)),
        dyn_stack(
            move || state.search_results.get(),
            |m: &SearchMatch| (m.path.clone(), m.line_number),
            move |m| search_result_row(m, state).into_any(),
        )
        .style(|s| s.flex_col().width_full()),
    ))
    .style(|s| s.width_full().row_gap(6.0))
}

fn search_result_row(m: SearchMatch, state: AppState) -> impl IntoView {
    let open_path = m.path.clone();
    let display = format!(
        "{}:{}  {}",
        m.path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        m.line_number,
        m.line_text.trim()
    );

    label(move || display.clone())
        .on_click_stop(move |_| state.open_file(open_path.clone()))
        .style(|s| s.padding(4.0).width_full().hover(|s| s.background(theme::BUTTON_BG_HOVER)))
}
