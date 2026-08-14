use floem::prelude::*;
use floem::views::Decorators;

use crate::state::AppState;
use crate::views::editor::editor_area;
use crate::views::file_tree::file_tree_view;
use crate::views::tab_bar::tab_bar;

pub fn shell(state: AppState) -> impl IntoView {
    h_stack((sidebar(state), main_area(state)))
        .style(|s| s.width_full().height_full())
}

fn sidebar(state: AppState) -> impl IntoView {
    v_stack((
        button("Open Folder").action(move || {
            if let Some(folder) = rfd::FileDialog::new().pick_folder() {
                state.workspace_root.set(Some(folder));
                state.expanded_dirs.set(Default::default());
            }
        }),
        file_tree_view(state),
    ))
    .style(|s| s.width(260.0).height_full().padding(6.0).flex_col())
}

fn main_area(state: AppState) -> impl IntoView {
    v_stack((tab_bar(state), editor_area(state)))
        .style(|s| s.flex_grow(1.0).height_full().flex_col())
}
