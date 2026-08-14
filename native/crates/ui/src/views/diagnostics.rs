use floem::prelude::*;
use floem::views::Decorators;

use coretrace_ctrace::Diagnostic;

use crate::state::AppState;
use crate::theme;
use crate::views::icons;
use crate::views::widgets::{empty_state, icon_button, panel_header};

/// Runs `ctrace`'s one-shot static analysis on the active file and lists
/// the resulting diagnostics. Reopens the tab after a run so the editor
/// remounts with diagnostic-aware syntax highlighting (see
/// `syntax::TreeSitterStyling`) -- same tab-reopen pattern the Commands
/// panel uses, for the same reason (no supported way to patch an
/// already-mounted TextDocument from outside its own view).
pub fn diagnostics_panel(state: AppState) -> impl IntoView {
    v_stack((
        panel_header(
            "DIAGNOSTICS",
            // The tab is remounted centrally when results arrive (see
            // AppState::new) -- doing it here would remount before the
            // analysis had produced anything to show.
            icon_button(icons::play(), "Run CTrace on the active file", move || {
                if let Some(path) = state.active_tab.get_untracked() {
                    state.diagnostics.run_on(&path);
                }
            }),
        ),
        body(state),
    ))
    .style(|s| s.width_full().flex_col())
}

fn body(state: AppState) -> impl IntoView {
    dyn_container(
        move || {
            (
                state.diagnostics.running.get(),
                state.diagnostics.error.get(),
                state.diagnostics.result.get().map(|r| r.diagnostics),
                state.active_tab.get().is_some(),
            )
        },
        move |(running, error, diagnostics, has_file)| {
            if running {
                return running_placeholder().into_any();
            }
            if let Some(message) = error {
                return label(move || message.clone())
                    .style(|s| s.color(theme::ERROR).padding(12.0).font_size(12.0).width_full())
                    .into_any();
            }
            match diagnostics {
                Some(items) if items.is_empty() => empty_state("No findings").into_any(),
                Some(items) => dyn_stack(
                    move || items.clone(),
                    |d: &Diagnostic| d.id.clone(),
                    move |d| diagnostic_row(d, state).into_any(),
                )
                .style(|s| s.flex_col().width_full())
                .into_any(),
                None if has_file => empty_state("Run CTrace to analyze the active file").into_any(),
                None => empty_state("Open a C/C++ file to analyze").into_any(),
            }
        },
    )
}

/// Skeleton rows shown while an analysis is in flight. A ctrace run is
/// a WSL round trip taking a second or more, and with no feedback the
/// Run button looked like it did nothing at all.
fn running_placeholder() -> impl IntoView {
    let bar = |w: f64, dim: bool| {
        empty().style(move |s| {
            s.height(9.0)
                .width(w)
                .border_radius(3.0)
                .background(if dim { theme::BG_ELEVATED } else { theme::ACTIVE })
        })
    };
    v_stack((
        label(|| "Analyzing...".to_string())
            .style(|s| s.color(theme::TEXT_MUTED).font_size(11.0).padding_horiz(12.0).padding_bottom(4.0)),
        v_stack((bar(120.0, false), bar(200.0, true), bar(90.0, true)))
            .style(|s| s.flex_col().row_gap(6.0).padding_horiz(12.0).padding_vert(7.0).width_full()),
        v_stack((bar(140.0, false), bar(180.0, true), bar(80.0, true)))
            .style(|s| s.flex_col().row_gap(6.0).padding_horiz(12.0).padding_vert(7.0).width_full()),
    ))
    .style(|s| s.width_full().flex_col())
}

/// ctrace formats its messages for a terminal: tab indentation, `↳`
/// continuation arrows, and a `[ !!Warn ]`-style severity marker. In a
/// panel that already shows severity as a colored bar and rule name,
/// all of that is noise, and the indentation renders as ragged
/// whitespace. This flattens it to a single clean sentence.
fn clean_message(raw: &str) -> String {
    raw.lines()
        .map(|line| {
            let line = line.trim_matches(|c: char| c.is_whitespace() || c == '↳').trim();
            // Drop a leading bracketed marker such as "[ !!Warn ]".
            match line.strip_prefix('[').and_then(|rest| rest.split_once(']')) {
                Some((_, after)) => after.trim(),
                None => line,
            }
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn diagnostic_row(d: Diagnostic, state: AppState) -> impl IntoView {
    let severity_color = theme::severity_color(&d.severity);
    let rule = d.rule_id.clone();
    let goto_line = d.location.start_line;
    // ctrace reports the WSL-side path (`/mnt/c/...`), which won't open
    // on the Windows side -- jump to the file the run targeted instead.
    let goto_file = state.diagnostics.last_run_file;
    let location = match &d.cwe {
        Some(cwe) => format!("Line {} · {cwe}", d.location.start_line),
        None => format!("Line {}", d.location.start_line),
    };
    let message = clean_message(&d.details.message);

    v_stack((
        h_stack((
            empty().style(move |s| s.size(3.0, 12.0).border_radius(2.0).background(severity_color)),
            label(move || rule.clone()).style(move |s| s.color(severity_color).font_size(12.0).font_weight(floem::text::Weight::SEMIBOLD)),
        ))
        .style(|s| s.items_center().column_gap(6.0)),
        label(move || message.clone()).style(|s| s.color(theme::TEXT).font_size(12.0)),
        label(move || location.clone()).style(|s| s.color(theme::TEXT_MUTED).font_size(11.0)),
    ))
    .on_click_stop(move |_| {
        if let Some(path) = goto_file.get_untracked() {
            state.goto_location(path, goto_line);
        }
    })
    .style(|s| {
        s.width_full()
            .flex_col()
            .row_gap(3.0)
            .padding_horiz(12.0)
            .padding_vert(7.0)
            .border_bottom(1.0)
            .border_color(theme::BORDER)
            .hover(|s| s.background(theme::HOVER))
    })
}

#[cfg(test)]
mod tests {
    use super::clean_message;

    #[test]
    fn strips_terminal_formatting_from_a_real_ctrace_message() {
        // Verbatim shape of what ctrace emits (see the fixture in
        // crates/ctrace/tests/fixtures/sample_output.txt).
        let raw = "\t[ !!Warn ] potential read of uninitialized local variable 'x'\n\t\t ↳ this load may execute before any definite initialization\n";
        assert_eq!(
            clean_message(raw),
            "potential read of uninitialized local variable 'x' this load may execute before any definite initialization"
        );
    }

    #[test]
    fn leaves_a_plain_message_untouched() {
        assert_eq!(clean_message("something went wrong"), "something went wrong");
    }

    #[test]
    fn keeps_brackets_that_are_not_a_leading_marker() {
        assert_eq!(clean_message("index [i] out of range"), "index [i] out of range");
    }
}
