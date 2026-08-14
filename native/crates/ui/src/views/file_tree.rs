use std::path::PathBuf;

use floem::peniko::Color;
use floem::prelude::*;
use floem::views::Decorators;

use coretrace_core::{scan_directory, FileEntry};

use crate::state::AppState;

pub fn file_tree_view(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.workspace_root.get(),
        move |root| match root {
            Some(root) => file_tree_children(root, 0, state).into_any(),
            None => label(|| "No folder open".to_string()).into_any(),
        },
    )
    .style(|s| s.flex_col().width_full())
}

fn file_tree_children(dir: PathBuf, depth: usize, state: AppState) -> impl IntoView {
    dyn_stack(
        move || scan_directory(&dir).unwrap_or_default(),
        |entry: &FileEntry| entry.path.clone(),
        move |entry| file_tree_node(entry, depth, state).into_any(),
    )
    .style(|s| s.flex_col().width_full())
}

fn file_tree_node(entry: FileEntry, depth: usize, state: AppState) -> impl IntoView {
    let path = entry.path.clone();
    let is_dir = entry.is_dir;
    let icon = if is_dir { "\u{25B8}" } else { "\u{2022}" };
    let label_text = format!("{}{} {}", "  ".repeat(depth), icon, entry.name);

    let click_path = path.clone();
    let row = label(move || label_text.clone())
        .on_click_stop(move |_| {
            if is_dir {
                state.toggle_expanded(click_path.clone());
            } else {
                state.open_file(click_path.clone());
            }
        })
        .style(|s| {
            s.padding(4.0)
                .width_full()
                .hover(|s| s.background(Color::rgba8(255, 255, 255, 20)))
        });

    if !is_dir {
        return row.into_any();
    }

    let children_path = path.clone();
    v_stack((
        row,
        dyn_container(
            move || state.is_expanded(&path),
            move |expanded| {
                if expanded {
                    file_tree_children(children_path.clone(), depth + 1, state).into_any()
                } else {
                    empty().into_any()
                }
            },
        ),
    ))
    .style(|s| s.width_full())
    .into_any()
}
