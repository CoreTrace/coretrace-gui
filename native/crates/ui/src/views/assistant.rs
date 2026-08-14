use floem::keyboard::{Key, NamedKey};
use floem::prelude::*;
use floem::views::{scroll, Decorators};

use coretrace_llm::{ProviderKind, Role};

use crate::assistant_state::DisplayMessage;
use crate::state::AppState;
use crate::theme;
use crate::views::skeleton::shimmer_bar;
use crate::views::widgets::{panel_header, panel_row};

/// Chat layout: a fixed header, a scrolling conversation that takes the
/// remaining height, and an input pinned to the bottom. Previously
/// every part -- provider row, settings form, messages, input -- was
/// stacked in one column, so the input drifted down the panel as the
/// conversation grew and the settings form dominated the view.
pub fn assistant_panel(state: AppState) -> impl IntoView {
    v_stack((
        panel_header("ASSISTANT", empty()),
        provider_bar(state),
        settings_section(state),
        conversation(state),
        composer(state),
    ))
    .style(|s| s.width_full().height_full().flex_col())
}

/// Provider name and a settings toggle on one compact line.
fn provider_bar(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    panel_row(
        h_stack((
            label(move || assistant.provider_kind.get().label().to_string())
                .on_click_stop(move |_| {
                    let all = ProviderKind::all();
                    let current = assistant.provider_kind.get_untracked();
                    let idx = all.iter().position(|k| *k == current).unwrap_or(0);
                    assistant.select_provider(all[(idx + 1) % all.len()]);
                })
                .style(|s| {
                    s.color(theme::TEXT)
                        .font_size(11.5)
                        .background(theme::BG_ELEVATED)
                        .border(1.0)
                        .border_color(theme::BORDER)
                        .border_radius(10.0)
                        .padding_horiz(9.0)
                        .padding_vert(2.0)
                        .hover(|s| s.color(theme::TEXT_BRIGHT).border_color(theme::ACCENT))
                }),
            empty().style(|s| s.flex_grow(1.0)),
            label(move || if assistant.settings_open.get() { "Done".to_string() } else { "Configure".to_string() })
                .on_click_stop(move |_| assistant.settings_open.update(|o| *o = !*o))
                .style(|s| {
                    s.color(theme::TEXT_MUTED)
                        .font_size(11.0)
                        .padding_horiz(5.0)
                        .padding_vert(2.0)
                        .border_radius(4.0)
                        .hover(|s| s.background(theme::HOVER).color(theme::TEXT_BRIGHT))
                }),
        ))
        .style(|s| s.width_full().items_center()),
    )
    .style(|s| s.margin_bottom(6.0))
}

/// Collapsed by default: keys and model paths are set once and then
/// only get in the way of the conversation.
fn settings_section(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    dyn_container(
        move || assistant.settings_open.get(),
        move |open| {
            if !open {
                return empty().into_any();
            }
            panel_row(
                v_stack((
                    field("API key", assistant.api_key),
                    field("Model", assistant.model),
                    field("Endpoint", assistant.endpoint),
                    field("Local model path", assistant.model_path),
                    button("Save")
                        .action(move || assistant.save_settings())
                        .style(|s| s.font_size(11.0).margin_top(2.0)),
                ))
                .style(|s| {
                    s.width_full()
                        .flex_col()
                        .row_gap(6.0)
                        .padding(9.0)
                        .background(theme::BG_EDITOR)
                        .border(1.0)
                        .border_color(theme::BORDER)
                        .border_radius(6.0)
                }),
            )
            .style(|s| s.margin_bottom(6.0))
            .into_any()
        },
    )
}

/// Label above input: a 260px panel has no room for a two-column form
/// without squeezing the field to uselessness.
fn field(label_text: &'static str, value: RwSignal<String>) -> impl IntoView {
    v_stack((
        label(move || label_text.to_string()).style(|s| s.color(theme::TEXT_MUTED).font_size(10.5)),
        text_input(value).style(|s| s.width_full()),
    ))
    .style(|s| s.width_full().flex_col().row_gap(2.0))
}

/// The scrolling message area. `flex_grow` plus `min_height(0)` is what
/// keeps the composer pinned to the bottom: without the zero minimum a
/// flex child refuses to shrink below its content, so a long
/// conversation would push the input off the panel.
fn conversation(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    scroll(
        v_stack((
            dyn_container(
                move || assistant.error.get(),
                move |err| match err {
                    Some(message) => error_banner(message).into_any(),
                    None => empty().into_any(),
                },
            ),
            dyn_container(
                move || (assistant.messages.get(), assistant.sending.get()),
                move |(items, sending)| {
                    if items.is_empty() && !sending {
                        return welcome().into_any();
                    }
                    v_stack((
                        dyn_stack(move || items.clone(), |m: &DisplayMessage| m.id, message_row)
                            .style(|s| s.flex_col().width_full().row_gap(10.0)),
                        // A thinking indicator in the same shape as an
                        // assistant reply, so the layout doesn't jump
                        // when the real answer replaces it.
                        if sending { pending_reply().into_any() } else { empty().into_any() },
                    ))
                    .style(|s| s.flex_col().width_full().row_gap(10.0))
                    .into_any()
                },
            ),
        ))
        .style(|s| s.flex_col().width_full().padding_horiz(10.0).padding_bottom(8.0)),
    )
    .style(|s| s.width_full().flex_grow(1.0).min_height(0.0))
}

fn welcome() -> impl IntoView {
    v_stack((
        label(|| "Ask about your code".to_string())
            .style(|s| s.color(theme::TEXT).font_size(12.5).font_weight(floem::text::Weight::SEMIBOLD)),
        label(|| "Questions about the open file, an error, or a diagnostic finding.".to_string())
            .style(|s| s.color(theme::TEXT_MUTED).font_size(11.5).width_full()),
    ))
    .style(|s| s.width_full().flex_col().row_gap(4.0).padding_vert(14.0))
}

fn error_banner(message: String) -> impl IntoView {
    label(move || message.clone()).style(|s| {
        s.color(theme::ERROR)
            .font_size(11.0)
            .width_full()
            .padding(8.0)
            .margin_bottom(8.0)
            .background(theme::BG_ELEVATED)
            .border(1.0)
            .border_color(theme::ERROR)
            .border_radius(6.0)
    })
}

fn pending_reply() -> impl IntoView {
    v_stack((
        label(|| "Assistant".to_string())
            .style(|s| s.color(theme::ACCENT).font_size(10.5).font_weight(floem::text::Weight::SEMIBOLD)),
        v_stack((shimmer_bar(95.0, 9.0), shimmer_bar(75.0, 9.0)))
            .style(|s| s.flex_col().width_full().row_gap(6.0).margin_top(5.0)),
    ))
    .style(|s| {
        s.width_full()
            .flex_col()
            .padding(9.0)
            .background(theme::BG_EDITOR)
            .border_radius(8.0)
            .border(1.0)
            .border_color(theme::BORDER)
    })
}

/// User messages are right-weighted with an accent border; assistant
/// replies are full width on the editor surface. Distinguishing the two
/// by shape, not just by a small label, is what makes a transcript
/// readable at a glance.
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
        label(move || text.clone()).style(|s| s.color(theme::TEXT).font_size(12.0).width_full()),
    ))
    .style(move |s| {
        s.width_full()
            .flex_col()
            .row_gap(4.0)
            .padding(9.0)
            .border_radius(8.0)
            .background(if is_user { theme::BG_ELEVATED } else { theme::BG_EDITOR })
            .border(1.0)
            .border_color(if is_user { theme::BORDER } else { theme::BORDER })
            .apply_if(is_user, |s| s.margin_left(16.0))
    })
}

fn composer(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    panel_row(
        h_stack((
            text_input(assistant.input)
                .placeholder("Ask a question")
                .keyboard_navigable()
                .on_key_down(Key::Named(NamedKey::Enter), |_| true, move |_| assistant.send())
                .style(|s| s.flex_grow(1.0).min_width(0.0)),
            button("Send")
                .action(move || assistant.send())
                .style(|s| s.font_size(11.0)),
        ))
        .style(|s| s.width_full().items_center().column_gap(6.0)),
    )
    .style(|s| {
        s.padding_vert(8.0)
            .background(theme::BG_SIDEBAR)
            .border_top(1.0)
            .border_color(theme::BORDER)
    })
}
