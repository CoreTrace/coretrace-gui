use floem::peniko::Color;
use floem::prelude::*;
use floem::views::{svg, Decorators};

use crate::state::{AppState, SidebarMode};
use crate::theme;
use crate::views::icons;

const RAIL_WIDTH: f64 = 48.0;
const ITEM_HEIGHT: f64 = 44.0;
const ICON_SIZE: f64 = 19.0;

/// The vertical icon rail along the far left, the way essentially every
/// IDE presents top-level navigation. Replaces the seven labelled pill
/// buttons that used to sit stacked in the sidebar: those consumed
/// three rows of vertical space, overflowed the sidebar's width (which
/// made the overflowing ones genuinely unclickable), and made the app
/// read as a settings form rather than an editor.
pub fn activity_bar(state: AppState) -> impl IntoView {
    v_stack((
        item(state, SidebarMode::Files, icons::files(), "Explorer"),
        item(state, SidebarMode::Search, icons::search(), "Search"),
        item(state, SidebarMode::Diagnostics, icons::diagnostics(), "Diagnostics"),
        item(state, SidebarMode::Extensions, icons::extensions(), "Extensions"),
        item(state, SidebarMode::Commands, icons::commands(), "Commands"),
        item(state, SidebarMode::Assistant, icons::assistant(), "Assistant"),
    ))
    .style(|s| {
        s.width(RAIL_WIDTH)
            .min_width(RAIL_WIDTH)
            // Flex children shrink by default, and the editor's
            // content can demand more width than the window has -- the
            // rail was getting squeezed to a few pixels wide before
            // this, with its icons clipped away entirely.
            .flex_shrink(0.0)
            .height_full()
            .flex_col()
            .background(theme::BG_ACTIVITY)
            .border_right(1.0)
            .border_color(theme::BORDER)
    })
}

fn item(state: AppState, mode: SidebarMode, icon: String, tip: &'static str) -> impl IntoView {
    let is_active = move || state.sidebar_mode.get() == mode;

    svg(icon)
        .style(move |s| s.size(ICON_SIZE, ICON_SIZE))
        .container()
        .on_click_stop(move |_| state.toggle_panel(mode))
        .style(move |s| {
            let active = is_active();
            s.width(RAIL_WIDTH)
                .height(ITEM_HEIGHT)
                .items_center()
                .justify_center()
                // The accent stripe is the standard "you are here"
                // marker for a rail like this -- it reads at a glance
                // without needing a filled background that would fight
                // the icon itself.
                .border_left(2.0)
                .border_color(if active { theme::ACCENT } else { Color::TRANSPARENT })
                .color(if active { theme::TEXT_BRIGHT } else { theme::TEXT_MUTED })
                .hover(|s| s.color(theme::TEXT_BRIGHT).background(theme::HOVER))
        })
        .tooltip(move || tip.to_string())
}
