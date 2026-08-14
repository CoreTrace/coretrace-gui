use floem::peniko::Color;
use floem::prelude::*;
use floem::views::Decorators;

use crate::state::{AppState, OpenTab};

pub fn tab_bar(state: AppState) -> impl IntoView {
    dyn_stack(
        move || state.open_tabs.get(),
        |tab: &OpenTab| tab.path.clone(),
        move |tab| tab_item(tab, state).into_any(),
    )
    .style(|s| s.flex_row().width_full())
}

fn tab_item(tab: OpenTab, state: AppState) -> impl IntoView {
    let title = tab
        .path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| tab.path.to_string_lossy().into_owned());

    let activate_path = tab.path.clone();
    let close_path = tab.path.clone();
    let is_active_path = tab.path.clone();

    h_stack((
        label(move || title.clone()).on_click_stop(move |_| state.active_tab.set(Some(activate_path.clone()))),
        label(|| "\u{2715}".to_string())
            .on_click_stop(move |_| state.close_tab(&close_path))
            .style(|s| s.margin_left(6.0)),
    ))
    .style(move |s| {
        s.padding(6.0)
            .items_center()
            .apply_if(state.active_tab.get().as_deref() == Some(is_active_path.as_path()), |s| {
                s.background(Color::rgba8(255, 255, 255, 30))
            })
    })
}
