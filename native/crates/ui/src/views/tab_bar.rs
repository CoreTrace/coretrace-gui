use floem::peniko::Color;
use floem::prelude::*;
use floem::views::{scroll, svg, Decorators};

use crate::state::{AppState, OpenTab};
use crate::theme;
use crate::views::icons;

const HEIGHT: f64 = 35.0;

pub fn tab_bar(state: AppState) -> impl IntoView {
    scroll(
        dyn_stack(
            move || state.open_tabs.get(),
            |tab: &OpenTab| tab.path.clone(),
            move |tab| tab_item(tab, state).into_any(),
        )
        .style(|s| s.flex_row().height_full()),
    )
    .style(|s| {
        s.width_full()
            .height(HEIGHT)
            .min_height(HEIGHT)
            .background(theme::BG_SIDEBAR)
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
    let tooltip_path = tab.path.to_string_lossy().into_owned();

    let label_path = is_active_path.clone();
    let is_active = move || state.active_tab.get().as_deref() == Some(is_active_path.as_path());
    let label_is_active = move || state.active_tab.get().as_deref() == Some(label_path.as_path());

    h_stack((
        label(move || title.clone()).style(move |s| {
            s.font_size(12.5)
                .color(if label_is_active() { theme::TEXT_BRIGHT } else { theme::TEXT_MUTED })
        }),
        svg(icons::close())
            .style(|s| s.size(11.0, 11.0))
            .container()
            .on_click_stop(move |_| state.close_tab(&close_path))
            .style(|s| {
                s.size(17.0, 17.0)
                    .items_center()
                    .justify_center()
                    .border_radius(3.0)
                    .color(theme::TEXT_MUTED)
                    .hover(|s| s.background(theme::ACTIVE).color(theme::TEXT_BRIGHT))
            }),
    ))
    .on_click_stop(move |_| state.active_tab.set(Some(activate_path.clone())))
    .style(move |s| {
        let active = is_active();
        // A top accent rule plus the editor's own background is how an
        // active tab reads as physically connected to the content
        // below it. No side separators: Floem has a single
        // `border_color` for all edges, so a neutral separator and an
        // accent top rule can't coexist on one view -- and the
        // background contrast already separates the tabs.
        s.height_full()
            .items_center()
            .column_gap(7.0)
            .padding_left(12.0)
            .padding_right(7.0)
            .border_top(2.0)
            .border_color(if active { theme::ACCENT } else { Color::TRANSPARENT })
            .apply_if(active, |s| s.background(theme::BG_EDITOR))
            .apply_if(!active, |s| s.hover(|s| s.background(theme::HOVER)))
    })
    .tooltip(move || tooltip_path.clone())
}
