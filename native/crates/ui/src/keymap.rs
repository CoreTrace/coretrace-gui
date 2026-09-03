use floem::keyboard::{Key, Modifiers, NamedKey};

use crate::state::{AppState, SidebarMode};

/// Everything reachable from the keyboard.
///
/// Kept as data rather than closures so the same table can answer two
/// different questions: what a keypress should do, and what shortcut to
/// print next to a command in the palette.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Action {
    ShowPalette,
    ToggleSidebar,
    ShowPanel(SidebarMode),
    ToggleAssistant,
    ToggleTerminal,
    InlineAssistant,
    RunCtrace,
    CloseTab,
}

/// Modifier combination for a binding. Matched exactly -- `Ctrl+P` must
/// not fire on `Ctrl+Shift+P`, or the two would collide.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Mods {
    Ctrl,
    CtrlShift,
}

impl Mods {
    fn matches(self, m: Modifiers) -> bool {
        let ctrl = m.control();
        let shift = m.shift();
        let clean = !m.alt() && !m.meta();
        match self {
            Mods::Ctrl => ctrl && !shift && clean,
            Mods::CtrlShift => ctrl && shift && clean,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Mods::Ctrl => "Ctrl",
            Mods::CtrlShift => "Ctrl+Shift",
        }
    }
}

struct Binding {
    mods: Mods,
    /// The unmodified character, lowercase. Compared case-insensitively
    /// because Shift changes the logical key the platform reports
    /// ("p" becomes "P").
    key: &'static str,
    action: Action,
}

const BINDINGS: &[Binding] = &[
    Binding { mods: Mods::CtrlShift, key: "p", action: Action::ShowPalette },
    Binding { mods: Mods::Ctrl, key: "p", action: Action::ShowPalette },
    Binding { mods: Mods::Ctrl, key: "b", action: Action::ToggleSidebar },
    Binding { mods: Mods::CtrlShift, key: "e", action: Action::ShowPanel(SidebarMode::Files) },
    Binding { mods: Mods::CtrlShift, key: "f", action: Action::ShowPanel(SidebarMode::Search) },
    Binding { mods: Mods::CtrlShift, key: "x", action: Action::ShowPanel(SidebarMode::Extensions) },
    Binding { mods: Mods::CtrlShift, key: "m", action: Action::ShowPanel(SidebarMode::Diagnostics) },
    Binding { mods: Mods::CtrlShift, key: "a", action: Action::ToggleAssistant },
    Binding { mods: Mods::Ctrl, key: "`", action: Action::ToggleTerminal },
    Binding { mods: Mods::Ctrl, key: "i", action: Action::InlineAssistant },
    Binding { mods: Mods::CtrlShift, key: "r", action: Action::RunCtrace },
    Binding { mods: Mods::Ctrl, key: "w", action: Action::CloseTab },
];

/// The shortcut to advertise for `action`, e.g. "Ctrl+Shift+P".
pub fn shortcut_for(action: Action) -> Option<String> {
    let binding = BINDINGS.iter().find(|b| b.action == action)?;
    Some(format!("{}+{}", binding.mods.label(), binding.key.to_uppercase()))
}

/// Maps a logical key plus modifiers to an action, if any is bound.
pub fn action_for(key: &Key, modifiers: Modifiers) -> Option<Action> {
    let name = match key {
        Key::Character(c) => c.as_str(),
        // Some layouts report the backtick as a named key.
        Key::Named(NamedKey::Backquote) => "`",
        _ => return None,
    };
    BINDINGS
        .iter()
        .find(|b| b.mods.matches(modifiers) && b.key.eq_ignore_ascii_case(name))
        .map(|b| b.action)
}

/// Runs `action`. Separate from `action_for` so the palette can invoke
/// the same behavior without synthesizing a keypress.
pub fn run(action: Action, state: AppState) {
    match action {
        Action::ShowPalette => state.palette.show(crate::views::palette::build_items(state)),
        Action::ToggleSidebar => state.sidebar_open.update(|open| *open = !*open),
        Action::ShowPanel(mode) => state.toggle_panel(mode),
        Action::ToggleAssistant => state.assistant_open.update(|open| *open = !*open),
        Action::ToggleTerminal => state.terminal.toggle(),
        Action::InlineAssistant => state.start_inline_assistant(),
        Action::RunCtrace => {
            if let Some(path) = state.active_tab.get_untracked() {
                state.diagnostics.run_on(&path);
            }
        }
        Action::CloseTab => {
            if let Some(path) = state.active_tab.get_untracked() {
                state.close_tab(&path);
            }
        }
    }
}

/// Handles a keypress, returning whether it was bound.
pub fn handle(key: &Key, modifiers: Modifiers, state: AppState) -> bool {
    match action_for(key, modifiers) {
        Some(action) => {
            run(action, state);
            true
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ch(c: &str) -> Key {
        Key::Character(c.into())
    }

    #[test]
    fn ctrl_shift_p_opens_the_palette() {
        let mods = Modifiers::CONTROL | Modifiers::SHIFT;
        // Shift makes the platform report the uppercase logical key.
        assert_eq!(action_for(&ch("P"), mods), Some(Action::ShowPalette));
    }

    #[test]
    fn shift_distinguishes_otherwise_identical_bindings() {
        // Ctrl+F is unbound; only Ctrl+Shift+F opens search. A binding
        // that ignored Shift would make these two collide.
        assert_eq!(action_for(&ch("f"), Modifiers::CONTROL), None);
        assert_eq!(
            action_for(&ch("F"), Modifiers::CONTROL | Modifiers::SHIFT),
            Some(Action::ShowPanel(SidebarMode::Search))
        );
    }

    #[test]
    fn a_plain_keypress_is_never_bound() {
        // Otherwise typing in the editor would trigger commands.
        assert_eq!(action_for(&ch("p"), Modifiers::empty()), None);
    }

    #[test]
    fn alt_combinations_do_not_match() {
        let mods = Modifiers::CONTROL | Modifiers::ALT;
        assert_eq!(action_for(&ch("p"), mods), None);
    }

    #[test]
    fn every_action_advertises_a_shortcut() {
        for action in [
            Action::ShowPalette,
            Action::ToggleSidebar,
            Action::ToggleAssistant,
            Action::ToggleTerminal,
            Action::InlineAssistant,
            Action::RunCtrace,
            Action::CloseTab,
        ] {
            assert!(shortcut_for(action).is_some(), "{action:?} has no shortcut");
        }
    }

    #[test]
    fn no_two_bindings_share_a_chord() {
        for (i, a) in BINDINGS.iter().enumerate() {
            for b in &BINDINGS[i + 1..] {
                assert!(
                    !(a.mods == b.mods && a.key.eq_ignore_ascii_case(b.key)),
                    "{}+{} is bound twice",
                    a.mods.label(),
                    a.key
                );
            }
        }
    }
}
