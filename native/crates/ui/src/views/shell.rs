use floem::keyboard::{Key, NamedKey};
use floem::prelude::*;
use floem::views::{scroll, stack, Decorators};

use crate::state::{AppState, SidebarMode};
use crate::theme;
use crate::views::activity_bar::activity_bar;
use crate::views::palette::{build_items, palette};
use crate::views::assistant::assistant_panel;
use crate::views::commands::commands_panel;
use crate::views::diagnostics::diagnostics_panel;
use crate::views::editor::editor_area;
use crate::views::extensions::extensions_panel;
use crate::views::file_tree::file_tree_panel;
use crate::views::search::search_panel;
use crate::views::status_bar::status_bar;
use crate::views::tab_bar::tab_bar;

const SIDEBAR_WIDTH: f64 = 260.0;

/// Standard IDE shell: a fixed icon rail, a collapsible sidebar panel,
/// the editor area, and a status strip along the bottom. The app theme
/// is applied here at the root -- class rules cascade, so this one call
/// restyles every button, input, scrollbar, and tooltip in the tree
/// (see `theme::app_theme` for why that's necessary rather than styling
/// each view individually).
pub fn shell(state: AppState) -> impl IntoView {
    let base = v_stack((
        h_stack((activity_bar(state), sidebar(state), main_area(state)))
            .style(|s| s.width_full().flex_grow(1.0).min_height(0.0)),
        status_bar(state),
    ))
    .style(|s| s.size_full().flex_col());

    // The palette is a sibling of the whole shell rather than a child
    // of any panel, so it can float above everything.
    stack((base, palette(state)))
        .keyboard_navigable()
        .on_key_down(
            Key::Character("p".into()),
            |modifiers| modifiers.control() && modifiers.shift(),
            move |_| state.palette.show(build_items(state)),
        )
        .on_key_down(Key::Named(NamedKey::Escape), |_| true, move |_| state.palette.hide())
        .style(|s| {
            s.width_full()
                .height_full()
                .background(theme::BG_EDITOR)
                .color(theme::TEXT)
                .apply(theme::app_theme())
        })
}

fn sidebar(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.sidebar_open.get(),
        move |open| {
            if !open {
                return empty().into_any();
            }
            panel(state)
                .style(|s| {
                    s.width(SIDEBAR_WIDTH)
                        .min_width(SIDEBAR_WIDTH)
                        .flex_shrink(0.0)
                        .height_full()
                        .background(theme::BG_SIDEBAR)
                        .border_right(1.0)
                        .border_color(theme::BORDER)
                })
                .into_any()
        },
    )
}

/// Panels manage their own scrolling. Wrapping the whole sidebar in one
/// scroll view meant a panel could never bound its own height -- which
/// the assistant needs, to keep its composer pinned to the bottom while
/// only the conversation scrolls.
fn panel(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.sidebar_mode.get(),
        move |mode| match mode {
            SidebarMode::Files => scrolled(file_tree_panel(state)).into_any(),
            SidebarMode::Search => scrolled(search_panel(state)).into_any(),
            SidebarMode::Extensions => scrolled(extensions_panel(state)).into_any(),
            SidebarMode::Commands => scrolled(commands_panel(state)).into_any(),
            SidebarMode::Diagnostics => scrolled(diagnostics_panel(state)).into_any(),
            // Not wrapped: it scrolls its conversation area internally.
            SidebarMode::Assistant => assistant_panel(state).into_any(),
        },
    )
    .style(|s| s.width(SIDEBAR_WIDTH).height_full().flex_col())
}

fn scrolled(view: impl IntoView + 'static) -> impl IntoView {
    scroll(view).style(|s| s.width_full().height_full())
}

fn main_area(state: AppState) -> impl IntoView {
    v_stack((tab_bar(state), editor_area(state))).style(|s| {
        s.flex_grow(1.0)
            .min_width(0.0)
            .height_full()
            .flex_col()
            .background(theme::BG_EDITOR)
    })
}
