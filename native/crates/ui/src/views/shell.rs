use floem::prelude::*;
use floem::views::Decorators;

use crate::state::{AppState, SidebarMode};
use crate::theme;
use crate::views::assistant::assistant_panel;
use crate::views::commands::commands_panel;
use crate::views::diagnostics::diagnostics_panel;
use crate::views::editor::editor_area;
use crate::views::extensions::extensions_panel;
use crate::views::file_tree::file_tree_view;
use crate::views::search::search_panel;
use crate::views::tab_bar::tab_bar;

pub fn shell(state: AppState) -> impl IntoView {
    h_stack((sidebar(state), main_area(state)))
        .style(|s| s.width_full().height_full().background(theme::BG).color(theme::TEXT))
}

fn mode_button(state: AppState, label: &str, mode: SidebarMode) -> impl IntoView {
    theme::toggle_button(label, move || state.sidebar_mode.get() == mode)
        .on_click_stop(move |_| state.sidebar_mode.set(mode))
}

fn sidebar(state: AppState) -> impl IntoView {
    v_stack((
        v_stack((
            h_stack((
                theme::button("Open Folder").action(move || {
                    if let Some(folder) = rfd::FileDialog::new().pick_folder() {
                        state.workspace_root.set(Some(folder));
                        state.expanded_dirs.set(Default::default());
                    }
                }),
                mode_button(state, "Files", SidebarMode::Files),
                mode_button(state, "Search", SidebarMode::Search),
            ))
            .style(|s| s.column_gap(4.0)),
            h_stack((
                mode_button(state, "Extensions", SidebarMode::Extensions),
                mode_button(state, "Commands", SidebarMode::Commands),
            ))
            .style(|s| s.column_gap(4.0)),
            h_stack((
                mode_button(state, "Diagnostics", SidebarMode::Diagnostics),
                mode_button(state, "Assistant", SidebarMode::Assistant),
            ))
            .style(|s| s.column_gap(4.0)),
        ))
        .style(|s| s.row_gap(4.0)),
        dyn_container(
            move || state.sidebar_mode.get(),
            move |mode| match mode {
                SidebarMode::Files => file_tree_view(state).into_any(),
                SidebarMode::Search => search_panel(state).into_any(),
                SidebarMode::Extensions => extensions_panel(state).into_any(),
                SidebarMode::Commands => commands_panel(state).into_any(),
                SidebarMode::Diagnostics => diagnostics_panel(state).into_any(),
                SidebarMode::Assistant => assistant_panel(state).into_any(),
            },
        ),
    ))
    .style(|s| {
        s.width(320.0)
            .height_full()
            .padding(8.0)
            .flex_col()
            .row_gap(8.0)
            .background(theme::BG_ELEVATED)
            .border_right(1.0)
            .border_color(theme::BORDER)
    })
}

fn main_area(state: AppState) -> impl IntoView {
    v_stack((tab_bar(state), editor_area(state)))
        .style(|s| s.flex_grow(1.0).height_full().flex_col())
}
