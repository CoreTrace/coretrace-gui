use floem::prelude::*;
use floem::views::Decorators;

use crate::sidecar_bridge::{list_commands, run_command_on_file};
use crate::state::AppState;
use crate::theme;

/// Lists commands registered by installed extensions and runs one
/// against the active tab's file. Snapshot at panel-open time (shell.rs
/// rebuilds this panel fresh each time the sidebar switches here), same
/// reasoning as the Extensions panel's sidecar status line.
pub fn commands_panel(state: AppState) -> impl IntoView {
    let commands = list_commands(state.extensions.sidecar);
    let active_path = state.active_tab.get_untracked();

    v_stack((
        label(move || match &active_path {
            Some(path) => format!("Active file: {}", path.display()),
            None => "No active file -- open one to run a command against it".to_string(),
        })
        .style(|s| s.padding(4.0).color(theme::TEXT_MUTED)),
        dyn_stack(
            move || commands.clone(),
            |c: &String| c.clone(),
            move |command| command_row(command, state).into_any(),
        )
        .style(|s| s.flex_col().width_full().row_gap(2.0)),
    ))
    .style(|s| s.width_full())
}

fn command_row(command: String, state: AppState) -> impl IntoView {
    let run_command = command.clone();
    h_stack((
        theme::button("Run").action(move || {
            if let Some(path) = state.active_tab.get_untracked() {
                if run_command_on_file(state.extensions.sidecar, &path, &run_command) {
                    // Force the tab to remount with the file's new
                    // on-disk content -- there's no supported way to
                    // patch an already-mounted TextDocument's text from
                    // outside its own view (see sidecar_bridge.rs).
                    state.close_tab(&path);
                    state.open_file(path);
                }
            }
        }),
        label(move || command.clone()).style(|s| s.margin_left(8.0)),
    ))
    .style(|s| s.padding(4.0).width_full().items_center())
}
