use floem::prelude::*;
use floem::views::Decorators;

use crate::sidecar_bridge::{list_commands, run_command_on_file};
use crate::state::AppState;
use crate::theme;
use crate::views::widgets::{empty_state, panel_header};

/// Lists commands registered by installed extensions and runs one
/// against the active tab's file. Snapshot at panel-open time (shell.rs
/// rebuilds this panel fresh each time the sidebar switches here), same
/// reasoning as the Extensions panel's installed list.
pub fn commands_panel(state: AppState) -> impl IntoView {
    let commands = list_commands(state.extensions.sidecar);

    v_stack((
        panel_header("COMMANDS", empty()),
        if commands.is_empty() {
            empty_state("No extension commands registered").into_any()
        } else {
            dyn_stack(
                move || commands.clone(),
                |c: &String| c.clone(),
                move |command| command_row(command, state).into_any(),
            )
            .style(|s| s.flex_col().width_full())
            .into_any()
        },
    ))
    .style(|s| s.width_full().flex_col())
}

fn command_row(command: String, state: AppState) -> impl IntoView {
    let run_command = command.clone();
    // The whole row runs the command -- a per-row "Run" button was
    // redundant chrome when the row has no other action.
    label(move || command.clone())
        .on_click_stop(move |_| {
            let Some(path) = state.active_tab.get_untracked() else { return };
            if run_command_on_file(state.extensions.sidecar, &path, &run_command) {
                // Force the tab to remount with the file's new on-disk
                // content -- there's no supported way to patch an
                // already-mounted TextDocument's text from outside its
                // own view (see sidecar_bridge.rs).
                state.close_tab(&path);
                state.open_file(path);
            }
        })
        .style(|s| {
            s.width_full()
                .padding_horiz(12.0)
                .padding_vert(5.0)
                .font_size(12.0)
                .color(theme::TEXT)
                .hover(|s| s.background(theme::HOVER).color(theme::TEXT_BRIGHT))
        })
}
