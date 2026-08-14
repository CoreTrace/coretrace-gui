use std::path::PathBuf;
use std::rc::Rc;

use floem::reactive::{RwSignal, Scope, SignalUpdate};

/// What a palette entry does when chosen.
#[derive(Clone)]
pub enum PaletteAction {
    OpenFile(PathBuf),
    SwitchPanel(crate::state::SidebarMode),
    RunCtrace,
    RunExtensionCommand(String),
}

#[derive(Clone)]
pub struct PaletteItem {
    /// What the user reads and types against.
    pub label: String,
    /// Group shown on the right ("File", "Command", ...).
    pub kind: &'static str,
    pub action: PaletteAction,
}

#[derive(Clone, Copy)]
pub struct PaletteState {
    pub open: RwSignal<bool>,
    pub query: RwSignal<String>,
    /// Everything available this time the palette was opened. Built on
    /// open rather than kept live, so walking the workspace happens
    /// once per invocation instead of on every keystroke.
    pub items: RwSignal<Rc<Vec<PaletteItem>>>,
    /// Index into the *filtered* list.
    pub selected: RwSignal<usize>,
}

impl PaletteState {
    pub fn new(cx: Scope) -> Self {
        Self {
            open: cx.create_rw_signal(false),
            query: cx.create_rw_signal(String::new()),
            items: cx.create_rw_signal(Rc::new(Vec::new())),
            selected: cx.create_rw_signal(0),
        }
    }

    pub fn show(&self, items: Vec<PaletteItem>) {
        self.query.set(String::new());
        self.selected.set(0);
        self.items.set(Rc::new(items));
        self.open.set(true);
    }

    pub fn hide(&self) {
        self.open.set(false);
    }

    pub fn move_selection(&self, delta: isize, len: usize) {
        if len == 0 {
            return;
        }
        self.selected.update(|i| {
            let next = *i as isize + delta;
            *i = next.rem_euclid(len as isize) as usize;
        });
    }
}

/// Subsequence match, the standard command-palette behavior: "opf"
/// matches "open file". Returns a score where lower is better, so
/// tighter and earlier matches sort first.
pub fn fuzzy_score(haystack: &str, needle: &str) -> Option<i32> {
    if needle.is_empty() {
        return Some(0);
    }
    let hay: Vec<char> = haystack.to_lowercase().chars().collect();
    let needle_lower = needle.to_lowercase();
    let mut needle_chars = needle_lower.chars().peekable();

    let mut first_match = None;
    let mut last_match = 0usize;
    let mut matched = 0usize;

    for (i, c) in hay.iter().enumerate() {
        let Some(&want) = needle_chars.peek() else { break };
        if *c == want {
            needle_chars.next();
            first_match.get_or_insert(i);
            last_match = i;
            matched += 1;
        }
    }

    if needle_chars.peek().is_some() {
        return None;
    }
    let start = first_match.unwrap_or(0);
    // Span of the match plus how late it starts: a contiguous hit at
    // the beginning scores best.
    Some(((last_match - start + 1) - matched) as i32 + start as i32)
}

/// Filters and ranks `items` against `query`.
pub fn filter_items(items: &[PaletteItem], query: &str) -> Vec<PaletteItem> {
    let mut scored: Vec<(i32, &PaletteItem)> = items
        .iter()
        .filter_map(|item| fuzzy_score(&item.label, query).map(|score| (score, item)))
        .collect();
    scored.sort_by_key(|(score, _)| *score);
    scored.into_iter().map(|(_, item)| item.clone()).take(60).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_subsequences_not_just_prefixes() {
        assert!(fuzzy_score("Open Folder", "opf").is_some());
        assert!(fuzzy_score("Open Folder", "folder").is_some());
    }

    #[test]
    fn rejects_characters_that_are_not_present_in_order() {
        assert!(fuzzy_score("Open Folder", "xyz").is_none());
        assert!(fuzzy_score("Open Folder", "redlof").is_none());
    }

    #[test]
    fn ranks_contiguous_and_early_matches_first() {
        let early = fuzzy_score("run ctrace", "run").unwrap();
        let late = fuzzy_score("about to run", "run").unwrap();
        assert!(early < late, "early={early} late={late}");
    }

    #[test]
    fn empty_query_keeps_everything() {
        assert_eq!(fuzzy_score("anything", ""), Some(0));
    }
}
