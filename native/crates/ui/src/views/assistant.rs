use floem::keyboard::{Key, NamedKey};
use floem::prelude::*;
use floem::views::Decorators;

use coretrace_llm::{ProviderKind, Role};

use crate::assistant_state::DisplayMessage;
use crate::state::AppState;
use crate::theme;
use crate::views::widgets::{empty_state, panel_header};

pub fn assistant_panel(state: AppState) -> impl IntoView {
    let assistant = state.assistant;

    v_stack((
        panel_header("ASSISTANT", empty()),
        provider_row(state),
        settings_section(state),
        error_line(state),
        messages(state),
        input_row(state),
    ))
    .style(move |s| {
        let _ = assistant;
        s.width_full().flex_col()
    })
}

/// One line: which provider is active, and a link-styled toggle for the
/// settings below. Cycling providers by clicking the name keeps this to
/// a single row -- Floem 0.2 has a dropdown, but it renders its own
/// light-themed popup list that would need separate restyling for one
/// control.
fn provider_row(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    h_stack((
        label(|| "Provider".to_string()).style(|s| s.color(theme::TEXT_MUTED).font_size(11.0)),
        label(move || assistant.provider_kind.get().label().to_string())
            .on_click_stop(move |_| {
                let all = ProviderKind::all();
                let current = assistant.provider_kind.get_untracked();
                let idx = all.iter().position(|k| *k == current).unwrap_or(0);
                assistant.select_provider(all[(idx + 1) % all.len()]);
            })
            .style(|s| {
                s.color(theme::ACCENT)
                    .font_size(12.0)
                    .padding_horiz(5.0)
                    .padding_vert(1.0)
                    .border_radius(4.0)
                    .hover(|s| s.background(theme::HOVER).color(theme::TEXT_BRIGHT))
            }),
        empty().style(|s| s.flex_grow(1.0)),
        label(move || if assistant.settings_open.get() { "Hide".to_string() } else { "Settings".to_string() })
            .on_click_stop(move |_| assistant.settings_open.update(|o| *o = !*o))
            .style(|s| {
                s.color(theme::TEXT_MUTED)
                    .font_size(11.0)
                    .padding_horiz(5.0)
                    .padding_vert(1.0)
                    .border_radius(4.0)
                    .hover(|s| s.background(theme::HOVER).color(theme::TEXT_BRIGHT))
            }),
    ))
    .style(|s| s.width_full().items_center().column_gap(6.0).padding_horiz(12.0).padding_bottom(6.0))
}

/// Collapsed by default: API keys and model paths are set once and then
/// only get in the way of the conversation, which is what the panel is
/// actually for.
fn settings_section(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    dyn_container(
        move || assistant.settings_open.get(),
        move |open| {
            if !open {
                return empty().into_any();
            }
            v_stack((
                field("API key", assistant.api_key),
                field("Model", assistant.model),
                field("Endpoint", assistant.endpoint),
                field("Local model path", assistant.model_path),
                button("Save settings")
                    .action(move || assistant.save_settings())
                    .style(|s| s.font_size(11.0).margin_top(2.0)),
            ))
            .style(|s| {
                s.width_full()
                    .flex_col()
                    .row_gap(5.0)
                    .margin_horiz(10.0)
                    .margin_bottom(8.0)
                    .padding(8.0)
                    .background(theme::BG_EDITOR)
                    .border(1.0)
                    .border_color(theme::BORDER)
                    .border_radius(6.0)
            })
            .into_any()
        },
    )
}

/// Label above input rather than beside it -- a 260px panel has no room
/// for a two-column form without squeezing the field to uselessness.
fn field(label_text: &'static str, value: RwSignal<String>) -> impl IntoView {
    v_stack((
        label(move || label_text.to_string()).style(|s| s.color(theme::TEXT_MUTED).font_size(11.0)),
        text_input(value).style(|s| s.width_full()),
    ))
    .style(|s| s.width_full().flex_col().row_gap(2.0))
}

fn error_line(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.assistant.error.get(),
        move |err| match err {
            Some(message) => label(move || message.clone())
                .style(|s| s.color(theme::ERROR).font_size(11.0).padding_horiz(12.0).padding_bottom(4.0).width_full())
                .into_any(),
            None => empty().into_any(),
        },
    )
}

fn messages(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    dyn_container(
        move || assistant.messages.get(),
        move |items| {
            if items.is_empty() {
                return empty_state("Ask about the code in your workspace").into_any();
            }
            dyn_stack(move || items.clone(), |m: &DisplayMessage| m.id, message_row)
                .style(|s| s.flex_col().width_full().row_gap(6.0).padding_horiz(10.0))
                .into_any()
        },
    )
}

fn message_row(message: DisplayMessage) -> impl IntoView {
    let is_user = message.role == Role::User;
    let author = if is_user { "You" } else { "Assistant" };
    let text = message.content.clone();

    v_stack((
        label(move || author.to_string()).style(move |s| {
            s.font_size(10.5)
                .font_weight(floem::text::Weight::SEMIBOLD)
                .color(if is_user { theme::TEXT_MUTED } else { theme::ACCENT })
        }),
        label(move || text.clone()).style(|s| s.color(theme::TEXT).font_size(12.0)),
    ))
    .style(move |s| {
        s.width_full()
            .flex_col()
            .row_gap(2.0)
            .padding(8.0)
            .border_radius(6.0)
            .background(if is_user { theme::BG_ELEVATED } else { theme::BG_EDITOR })
    })
}

fn input_row(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    h_stack((
        text_input(assistant.input)
            .placeholder("Ask a question")
            .keyboard_navigable()
            .on_key_down(Key::Named(NamedKey::Enter), |_| true, move |_| assistant.send())
            .style(|s| s.flex_grow(1.0).min_width(0.0)),
        button("Send").action(move || assistant.send()).style(|s| s.font_size(11.0)),
    ))
    .style(move |s| {
        s.width_full()
            .items_center()
            .column_gap(5.0)
            .padding_horiz(10.0)
            .padding_vert(8.0)
            .apply_if(assistant.sending.get(), |s| s.color(theme::TEXT_MUTED))
    })
}
