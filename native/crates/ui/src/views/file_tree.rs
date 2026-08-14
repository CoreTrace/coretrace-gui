use std::path::{Path, PathBuf};

use floem::keyboard::{Key, NamedKey};
use floem::menu::{Menu, MenuItem};
use floem::prelude::*;
use floem::views::{svg, Decorators};

use coretrace_core::{create_dir, create_file, delete_path, rename_path, scan_directory, FileEntry};

use crate::state::{AppState, PendingEdit};
use crate::theme;
use crate::views::icons;
use crate::views::widgets::{empty_state, icon_button, panel_header};

const ROW_HEIGHT: f64 = 23.0;
const INDENT: f64 = 12.0;
const BASE_PAD: f64 = 8.0;

pub fn file_tree_panel(state: AppState) -> impl IntoView {
    v_stack((
        panel_header(
            "EXPLORER",
            icon_button(icons::folder_open(), "Open Folder", move || {
                if let Some(folder) = rfd::FileDialog::new().pick_folder() {
                    state.workspace_root.set(Some(folder));
                    state.expanded_dirs.set(Default::default());
                }
            }),
        ),
        file_tree_view(state),
    ))
    .style(|s| s.width_full().flex_col())
}

fn file_tree_view(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.workspace_root.get(),
        move |root| match root {
            Some(root) => file_tree_children(root, 0, state).into_any(),
            None => empty_state("No folder open").into_any(),
        },
    )
    .style(|s| s.flex_col().width_full())
}

fn file_tree_children(dir: PathBuf, depth: usize, state: AppState) -> impl IntoView {
    let scan_dir = dir.clone();
    v_stack((
        dyn_stack(
            move || {
                state.tree_version.get();
                scan_directory(&scan_dir).unwrap_or_default()
            },
            |entry: &FileEntry| entry.path.clone(),
            move |entry| file_tree_node(entry, depth, state).into_any(),
        )
        .style(|s| s.flex_col().width_full()),
        new_entry_input(dir, depth, state),
    ))
    .style(|s| s.width_full())
}

/// Inline text input shown at the end of `parent`'s children while
/// creating a new file or directory inside it.
fn new_entry_input(parent: PathBuf, depth: usize, state: AppState) -> impl IntoView {
    let watch_parent = parent.clone();
    dyn_container(
        move || {
            state.pending_edit.with(|edit| {
                matches!(
                    edit,
                    Some(PendingEdit::NewFile { parent: p } | PendingEdit::NewDir { parent: p })
                        if p == &watch_parent
                )
            })
        },
        move |active| {
            if active {
                let parent = parent.clone();
                edit_row(depth, state, move |name| parent.join(name)).into_any()
            } else {
                empty().into_any()
            }
        },
    )
}

fn file_tree_node(entry: FileEntry, depth: usize, state: AppState) -> impl IntoView {
    let path = entry.path.clone();
    let is_dir = entry.is_dir;

    let renaming = {
        let path = path.clone();
        move || state.pending_edit.with(|e| e == &Some(PendingEdit::Rename { path: path.clone() }))
    };

    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let row = dyn_container(renaming, {
        let path = path.clone();
        let entry_name = entry.name.clone();
        move |is_renaming| {
            if is_renaming {
                let path = path.clone();
                edit_row(depth, state, move |name| {
                    path.parent().map(|p| p.join(name)).unwrap_or_else(|| PathBuf::from(name))
                })
                .into_any()
            } else {
                display_row(path.clone(), entry_name.clone(), depth, is_dir, state).into_any()
            }
        }
    });

    let ctx_path = path.clone();
    let ctx_parent = parent.clone();
    let row = row.context_menu(move || tree_context_menu(ctx_path.clone(), ctx_parent.clone(), is_dir, state));

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

fn display_row(path: PathBuf, name: String, depth: usize, is_dir: bool, state: AppState) -> impl IntoView {
    let click_path = path.clone();
    let active_path = path.clone();
    let expanded_path = path.clone();

    // Directories get a chevron that flips with their open state;
    // files get a document glyph. `Svg::update_value` re-reads its
    // source reactively, so the chevron follows expansion without
    // rebuilding the row.
    let leading = svg(if is_dir { icons::chevron_right() } else { icons::file_generic() })
        .update_value(move || {
            if !is_dir {
                return icons::file_generic();
            }
            if state.is_expanded(&expanded_path) {
                icons::chevron_down()
            } else {
                icons::chevron_right()
            }
        })
        .style(move |s| {
            s.size(13.0, 13.0)
                .min_width(13.0)
                .color(if is_dir { theme::TEXT_MUTED } else { theme::TEXT_MUTED.multiply_alpha(0.7) })
        });

    h_stack((leading, label(move || name.clone()).style(|s| s.min_width(0.0))))
        .on_click_stop(move |_| {
            if is_dir {
                state.toggle_expanded(click_path.clone());
            } else {
                state.open_file(click_path.clone());
            }
        })
        .style(move |s| {
            let is_active = state.active_tab.get().as_deref() == Some(active_path.as_path());
            s.height(ROW_HEIGHT)
                .width_full()
                .items_center()
                .column_gap(5.0)
                .padding_left(BASE_PAD + depth as f64 * INDENT)
                .padding_right(6.0)
                .color(if is_active { theme::TEXT_BRIGHT } else { theme::TEXT })
                .apply_if(is_active, |s| s.background(theme::SELECTED))
                .hover(|s| s.background(theme::HOVER))
        })
}

/// Inline rename/create text input, shown in place of a row. `to_path`
/// turns the entered name into the target path (rename: sibling of the
/// original; create: child of the parent directory).
fn edit_row(depth: usize, state: AppState, to_path: impl Fn(&str) -> PathBuf + 'static) -> impl IntoView {
    let confirm: std::rc::Rc<dyn Fn(AppState)> = std::rc::Rc::new(move |state: AppState| {
        let name = state.pending_edit_name.get_untracked();
        if name.trim().is_empty() {
            state.cancel_edit();
            return;
        }
        let target = to_path(name.trim());
        let edit = state.pending_edit.get_untracked();
        let _ = match edit {
            Some(PendingEdit::Rename { path }) => rename_path(&path, &target),
            Some(PendingEdit::NewFile { .. }) => create_file(&target),
            Some(PendingEdit::NewDir { .. }) => create_dir(&target),
            None => Ok(()),
        };
        state.bump_tree_version();
        state.cancel_edit();
    });

    text_input(state.pending_edit_name)
        .keyboard_navigable()
        .on_key_down(Key::Named(NamedKey::Enter), |_| true, {
            let confirm = confirm.clone();
            move |_| confirm(state)
        })
        .on_key_down(Key::Named(NamedKey::Escape), |_| true, move |_| state.cancel_edit())
        .style(move |s| {
            s.width_full()
                .margin_left(BASE_PAD + depth as f64 * INDENT)
                .margin_right(6.0)
                .margin_vert(1.0)
                .padding_vert(2.0)
        })
}

fn tree_context_menu(path: PathBuf, parent: PathBuf, is_dir: bool, state: AppState) -> Menu {
    // Inside a directory, new entries go in it; next to a file, new
    // entries go in its parent -- both land where you'd expect them.
    let create_target = if is_dir { path.clone() } else { parent };
    let new_file_target = create_target.clone();
    let new_dir_target = create_target.clone();
    let rename_path_val = path.clone();
    let rename_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let delete_path_val = path.clone();

    Menu::new("")
        .entry(MenuItem::new("New File").action(move || {
            state.expanded_dirs.update(|dirs| {
                dirs.insert(new_file_target.clone());
            });
            state.begin_edit(PendingEdit::NewFile { parent: new_file_target.clone() }, String::new());
        }))
        .entry(MenuItem::new("New Folder").action(move || {
            state.expanded_dirs.update(|dirs| {
                dirs.insert(new_dir_target.clone());
            });
            state.begin_edit(PendingEdit::NewDir { parent: new_dir_target.clone() }, String::new());
        }))
        .separator()
        .entry(MenuItem::new("Rename").action(move || {
            state.begin_edit(PendingEdit::Rename { path: rename_path_val.clone() }, rename_name.clone());
        }))
        .entry(MenuItem::new("Delete").action(move || {
            let _ = delete_path(&delete_path_val);
            state.close_tab(&delete_path_val);
            state.bump_tree_version();
        }))
}
