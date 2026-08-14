use floem::keyboard::{Key, NamedKey};
use floem::prelude::*;
use floem::views::Decorators;

use crate::palette_state::{filter_items, PaletteAction, PaletteItem};
use crate::sidecar_bridge::{list_commands, run_command_on_file};
use crate::state::{AppState, SidebarMode};
use crate::theme;

const WIDTH: f64 = 560.0;

/// Collects everything the palette can act on, at open time.
pub fn build_items(state: AppState) -> Vec<PaletteItem> {
    let mut items = vec![
        PaletteItem {
            label: "Run CTrace on the active file".to_string(),
            kind: "Action",
            action: PaletteAction::RunCtrace,
        },
        PaletteItem {
            label: "View: Explorer".to_string(),
            kind: "Action",
            action: PaletteAction::SwitchPanel(SidebarMode::Files),
        },
        PaletteItem {
            label: "View: Search".to_string(),
            kind: "Action",
            action: PaletteAction::SwitchPanel(SidebarMode::Search),
        },
        PaletteItem {
            label: "View: Diagnostics".to_string(),
            kind: "Action",
            action: PaletteAction::SwitchPanel(SidebarMode::Diagnostics),
        },
        PaletteItem {
            label: "View: Extensions".to_string(),
            kind: "Action",
            action: PaletteAction::SwitchPanel(SidebarMode::Extensions),
        },
        PaletteItem {
            label: "View: Assistant".to_string(),
            kind: "Action",
            action: PaletteAction::SwitchPanel(SidebarMode::Assistant),
        },
    ];

    // Open tabs, so the palette doubles as a file switcher.
    items.extend(state.open_tabs.get_untracked().into_iter().map(|tab| {
        let label = tab
            .path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| tab.path.to_string_lossy().into_owned());
        PaletteItem { label, kind: "Open file", action: PaletteAction::OpenFile(tab.path) }
    }));

    items.extend(list_commands(state.extensions.sidecar).into_iter().map(|command| PaletteItem {
        label: command.clone(),
        kind: "Extension",
        action: PaletteAction::RunExtensionCommand(command),
    }));

    items
}

fn run(action: PaletteAction, state: AppState) {
    state.palette.hide();
    match action {
        PaletteAction::OpenFile(path) => state.open_file(path),
        PaletteAction::SwitchPanel(mode) => {
            state.sidebar_mode.set(mode);
            state.sidebar_open.set(true);
        }
        PaletteAction::RunCtrace => {
            if let Some(path) = state.active_tab.get_untracked() {
                state.diagnostics.run_on(&path);
                state.sidebar_mode.set(SidebarMode::Diagnostics);
                state.sidebar_open.set(true);
            }
        }
        PaletteAction::RunExtensionCommand(command) => {
            let Some(path) = state.active_tab.get_untracked() else { return };
            if run_command_on_file(state.extensions.sidecar, &path, &command) {
                state.close_tab(&path);
                state.open_file(path);
            }
        }
    }
}

/// The palette overlay. Rendered last in the shell's stack so it paints
/// above the rest of the UI.
pub fn palette(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.palette.open.get(),
        move |open| {
            if !open {
                return empty().into_any();
            }
            overlay(state).into_any()
        },
    )
    .style(move |s| {
        s.apply_if(!state.palette.open.get(), |s| s.hide())
            .absolute()
            .inset_top(0.0)
            .inset_left(0.0)
            .size_full()
            // Horizontally centered but pinned near the top, where
            // every command palette lives -- vertical centering put it
            // awkwardly low in a tall window.
            .justify_center()
            .items_start()
    })
}

fn overlay(state: AppState) -> impl IntoView {
    let palette = state.palette;

    v_stack((
        text_input(palette.query)
            .placeholder("Type to search files, actions and extension commands")
            .keyboard_navigable()
            // Without this the palette opens but keystrokes still go to
            // whatever had focus (usually the editor), so typing filters
            // nothing and silently edits the file behind it.
            .request_focus(move || {
                palette.open.get();
            })
            .on_key_down(Key::Named(NamedKey::Escape), |_| true, move |_| palette.hide())
            .on_key_down(Key::Named(NamedKey::ArrowDown), |_| true, move |_| {
                let len = visible(state).len();
                palette.move_selection(1, len);
            })
            .on_key_down(Key::Named(NamedKey::ArrowUp), |_| true, move |_| {
                let len = visible(state).len();
                palette.move_selection(-1, len);
            })
            .on_key_down(Key::Named(NamedKey::Enter), |_| true, move |_| {
                let items = visible(state);
                let index = palette.selected.get_untracked().min(items.len().saturating_sub(1));
                if let Some(item) = items.get(index) {
                    run(item.action.clone(), state);
                }
            })
            .style(|s| s.width_full().font_size(14.0).padding(9.0)),
        results(state),
    ))
    .style(|s| {
        s.width(WIDTH)
            .max_height(420.0)
            .flex_col()
            .margin_top(90.0)
            .padding(8.0)
            .row_gap(6.0)
            .background(theme::BG_SIDEBAR)
            .border(1.0)
            .border_color(theme::BORDER)
            .border_radius(8.0)
    })
}

fn visible(state: AppState) -> Vec<PaletteItem> {
    let items = state.palette.items.get_untracked();
    filter_items(&items, &state.palette.query.get_untracked())
}

fn results(state: AppState) -> impl IntoView {
    let palette = state.palette;
    dyn_container(
        move || (palette.query.get(), palette.items.get(), palette.selected.get()),
        move |(query, items, selected)| {
            let filtered = filter_items(&items, &query);
            if filtered.is_empty() {
                return label(|| "No matching commands".to_string())
                    .style(|s| s.color(theme::TEXT_MUTED).font_size(12.0).padding(10.0))
                    .into_any();
            }
            let selected = selected.min(filtered.len() - 1);
            dyn_stack(
                move || filtered.clone().into_iter().enumerate().collect::<Vec<_>>(),
                |(i, item): &(usize, PaletteItem)| (*i, item.label.clone()),
                move |(i, item)| row(item, i == selected, state).into_any(),
            )
            .style(|s| s.flex_col().width_full())
            .into_any()
        },
    )
    .style(|s| s.width_full().flex_col())
}

fn row(item: PaletteItem, is_selected: bool, state: AppState) -> impl IntoView {
    let label_text = item.label.clone();
    let kind = item.kind;
    let action = item.action.clone();

    h_stack((
        label(move || label_text.clone()).style(move |s| {
            s.font_size(13.0)
                .min_width(0.0)
                .color(if is_selected { theme::TEXT_BRIGHT } else { theme::TEXT })
        }),
        empty().style(|s| s.flex_grow(1.0)),
        label(move || kind.to_string()).style(|s| s.color(theme::TEXT_MUTED).font_size(10.5)),
    ))
    .on_click_stop(move |_| run(action.clone(), state))
    .style(move |s| {
        s.width_full()
            .items_center()
            .column_gap(8.0)
            .padding_horiz(8.0)
            .padding_vert(5.0)
            .border_radius(4.0)
            .apply_if(is_selected, |s| s.background(theme::SELECTED))
            .hover(|s| s.background(theme::HOVER))
    })
}
