use floem::prelude::*;
use floem::views::Decorators;

use crate::state::{AppState, OpenTab};
use crate::theme;

pub fn tab_bar(state: AppState) -> impl IntoView {
    dyn_stack(
        move || state.open_tabs.get(),
        |tab: &OpenTab| tab.path.clone(),
        move |tab| tab_item(tab, state).into_any(),
    )
    .style(|s| {
        s.flex_row()
            .width_full()
            .background(theme::BG_ELEVATED)
            .border_bottom(1.0)
            .border_color(theme::BORDER)
    })
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
            .style(|s| s.margin_left(6.0).color(theme::TEXT_MUTED)),
    ))
    .style(move |s| {
        let is_active = state.active_tab.get().as_deref() == Some(is_active_path.as_path());
        s.padding(8.0)
            .items_center()
            .border_bottom(2.0)
            .border_color(if is_active { theme::ACCENT } else { floem::peniko::Color::TRANSPARENT })
            .apply_if(is_active, |s| s.background(theme::BG_SURFACE))
    })
}
