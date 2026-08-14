use floem::prelude::*;
use floem::views::Decorators;

use coretrace_ctrace::Diagnostic;

use crate::state::AppState;
use crate::theme;
use crate::views::icons;
use crate::views::skeleton::skeleton_card;
use crate::views::widgets::{empty_state, icon_button, panel_header};

/// Runs `ctrace`'s one-shot static analysis on the active file and lists
/// the resulting diagnostics.
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
                return running_placeholder(state).into_any();
            }
            if let Some(message) = error {
                return error_state(message).into_any();
            }
            match diagnostics {
                Some(items) if items.is_empty() => clean_state().into_any(),
                Some(items) => results(items, state).into_any(),
                None if has_file => empty_state("Run CTrace to analyze the active file").into_any(),
                None => empty_state("Open a C/C++ file to analyze").into_any(),
            }
        },
    )
}

/// Shown while an analysis is in flight. A ctrace run is a WSL round
/// trip taking a second or more, and with no feedback the Run button
/// looked like it did nothing at all.
fn running_placeholder(state: AppState) -> impl IntoView {
    let target = state
        .diagnostics
        .last_run_file
        .get_untracked()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
        .unwrap_or_default();

    v_stack((
        label(move || format!("Analyzing {target}"))
            .style(|s| s.color(theme::TEXT_MUTED).font_size(11.0).padding_horiz(12.0).padding_top(8.0)),
        skeleton_card(),
        skeleton_card(),
    ))
    .style(|s| s.width_full().flex_col())
}

fn error_state(message: String) -> impl IntoView {
    v_stack((
        label(|| "Analysis failed".to_string())
            .style(|s| s.color(theme::ERROR).font_size(12.5).font_weight(floem::text::Weight::SEMIBOLD)),
        label(move || message.clone()).style(|s| s.color(theme::TEXT_MUTED).font_size(11.5).width_full()),
    ))
    .style(|s| s.width_full().flex_col().row_gap(4.0).padding(12.0))
}

fn clean_state() -> impl IntoView {
    v_stack((
        label(|| "No findings".to_string())
            .style(|s| s.color(theme::SUCCESS).font_size(12.5).font_weight(floem::text::Weight::SEMIBOLD)),
        label(|| "CTrace found no issues in this file.".to_string())
            .style(|s| s.color(theme::TEXT_MUTED).font_size(11.5)),
    ))
    .style(|s| s.width_full().flex_col().row_gap(3.0).padding(12.0))
}

fn severity_rank(severity: &str) -> u8 {
    match severity.to_ascii_uppercase().as_str() {
        "ERROR" => 0,
        "WARNING" => 1,
        _ => 2,
    }
}

/// Results, most severe first, behind a summary line. Sorting matters
/// because ctrace emits findings in source order, so a critical error
/// could sit below a pile of informational notes.
fn results(items: Vec<Diagnostic>, state: AppState) -> impl IntoView {
    let mut sorted = items.clone();
    sorted.sort_by_key(|d| (severity_rank(&d.severity), d.location.start_line));

    let errors = sorted.iter().filter(|d| severity_rank(&d.severity) == 0).count();
    let warnings = sorted.iter().filter(|d| severity_rank(&d.severity) == 1).count();
    let notes = sorted.len() - errors - warnings;

    v_stack((
        summary(errors, warnings, notes),
        dyn_stack(
            move || sorted.clone(),
            |d: &Diagnostic| d.id.clone(),
            move |d| diagnostic_row(d, state).into_any(),
        )
        .style(|s| s.flex_col().width_full()),
    ))
    .style(|s| s.width_full().flex_col())
}

fn summary(errors: usize, warnings: usize, notes: usize) -> impl IntoView {
    // Carries the *data* rather than pre-built views: floem views are
    // not `Clone`, which `dyn_stack`'s item closure requires.
    let chips: Vec<(usize, floem::peniko::Color, &'static str)> =
        [(errors, theme::ERROR, "error"), (warnings, theme::WARNING, "warning"), (notes, theme::ACCENT, "note")]
            .into_iter()
            .filter(|(n, _, _)| *n > 0)
            .collect();

    dyn_stack(
        move || chips.clone(),
        |(_, _, noun): &(usize, floem::peniko::Color, &'static str)| *noun,
        |(n, color, noun)| {
            let text = format!("{n} {noun}{}", if n == 1 { "" } else { "s" });
            h_stack((
                empty().style(move |s| s.size(6.0, 6.0).border_radius(3.0).background(color)),
                label(move || text.clone()).style(|s| s.color(theme::TEXT).font_size(11.0)),
            ))
            .style(|s| s.items_center().column_gap(5.0).margin_right(12.0))
        },
    )
    .style(|s| {
        s.flex_row()
            .width_full()
            .items_center()
            .padding_horiz(12.0)
            .padding_vert(7.0)
            .border_bottom(1.0)
            .border_color(theme::BORDER)
    })
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
    let line_no = d.location.start_line;
    let cwe = d.cwe.clone();
    let message = clean_message(&d.details.message);
    let goto_line = d.location.start_line;
    // ctrace reports the WSL-side path (`/mnt/c/...`), which won't open
    // on the Windows side -- jump to the file the run targeted instead.
    let goto_file = state.diagnostics.last_run_file;

    // Severity is carried by a full-height stripe down the left edge
    // rather than a floating chip, so scanning the list vertically
    // shows the shape of the problems at a glance.
    h_stack((
        empty().style(move |s| s.width(3.0).height_full().background(severity_color)),
        v_stack((
            h_stack((
                label(move || rule.clone()).style(move |s| {
                    s.color(severity_color).font_size(12.0).font_weight(floem::text::Weight::SEMIBOLD).min_width(0.0)
                }),
                empty().style(|s| s.flex_grow(1.0)),
                label(move || format!("L{line_no}"))
                    .style(|s| s.color(theme::TEXT_MUTED).font_size(10.5).margin_left(6.0)),
            ))
            .style(|s| s.width_full().items_center()),
            label(move || message.clone()).style(|s| s.color(theme::TEXT).font_size(12.0).width_full()),
            match cwe {
                Some(cwe) => label(move || cwe.clone())
                    .style(|s| {
                        s.color(theme::TEXT_MUTED)
                            .font_size(10.0)
                            .background(theme::BG_ELEVATED)
                            .border_radius(3.0)
                            .padding_horiz(5.0)
                            .padding_vert(1.0)
                    })
                    .into_any(),
                None => empty().into_any(),
            },
        ))
        .style(|s| s.flex_col().row_gap(4.0).items_start().min_width(0.0).flex_grow(1.0).padding_horiz(10.0).padding_vert(8.0)),
    ))
    .on_click_stop(move |_| {
        if let Some(path) = goto_file.get_untracked() {
            state.goto_location(path, goto_line);
        }
    })
    .style(|s| {
        s.width_full()
            // Stretch so the severity stripe spans the row's full
            // height rather than collapsing to its own zero content.
            .align_items(Some(floem::taffy::style::AlignItems::Stretch))
            .border_bottom(1.0)
            .border_color(theme::BORDER)
            .hover(|s| s.background(theme::HOVER))
    })
}

#[cfg(test)]
mod tests {
    use super::{clean_message, severity_rank};

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

    #[test]
    fn orders_errors_before_warnings_before_notes() {
        assert!(severity_rank("ERROR") < severity_rank("WARNING"));
        assert!(severity_rank("WARNING") < severity_rank("INFO"));
        // ctrace's casing varies between tools.
        assert_eq!(severity_rank("error"), severity_rank("ERROR"));
    }
}
