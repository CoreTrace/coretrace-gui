use floem::keyboard::{Key, NamedKey};
use floem::prelude::*;
use floem::views::Decorators;

use coretrace_llm::{ProviderKind, Role};

use crate::assistant_state::DisplayMessage;
use crate::state::AppState;
use crate::theme;

pub fn assistant_panel(state: AppState) -> impl IntoView {
    let assistant = state.assistant;

    v_stack((
        provider_row(state),
        config_fields(state),
        dyn_container(
            move || assistant.error.get(),
            move |err| match err {
                Some(message) => {
                    label(move || format!("Error: {message}")).style(|s| s.padding(4.0).color(theme::ERROR)).into_any()
                }
                None => empty().into_any(),
            },
        ),
        dyn_stack(
            move || assistant.messages.get(),
            |m: &DisplayMessage| m.id,
            message_row,
        )
        .style(|s| s.flex_col().width_full().row_gap(4.0)),
        input_row(state),
    ))
    .style(|s| s.width_full().row_gap(6.0))
}

fn provider_row(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    theme::button_view(label(move || format!("Provider: {}", assistant.provider_kind.get().label())))
        .action(move || {
            let all = ProviderKind::all();
            let current = assistant.provider_kind.get_untracked();
            let idx = all.iter().position(|k| *k == current).unwrap_or(0);
            assistant.select_provider(all[(idx + 1) % all.len()]);
        })
        .style(|s| s.width_full())
}

fn config_fields(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    v_stack((
        labeled_input("API key", assistant.api_key),
        labeled_input("Model", assistant.model),
        labeled_input("Endpoint (Generic/Ollama)", assistant.endpoint),
        labeled_input("Model path (Local)", assistant.model_path),
        theme::button("Save settings").action(move || assistant.save_settings()),
    ))
    .style(|s| s.width_full().row_gap(4.0))
}

fn labeled_input(label_text: &str, value: RwSignal<String>) -> impl IntoView {
    let label_text = label_text.to_string();
    h_stack((
        label(move || label_text.clone()).style(|s| s.width(180.0).color(theme::TEXT_MUTED)),
        theme::text_input(value).style(|s| s.flex_grow(1.0)),
    ))
    .style(|s| s.width_full().items_center())
}

fn message_row(message: DisplayMessage) -> impl IntoView {
    let (prefix, accent) = match message.role {
        Role::User => ("You", theme::TEXT_MUTED),
        Role::Assistant => ("Assistant", theme::ACCENT),
    };
    let text = format!("{}", message.content);
    v_stack((
        label(move || prefix.to_string()).style(move |s| s.color(accent).font_weight(floem::text::Weight::BOLD)),
        label(move || text.clone()).style(|s| s.margin_top(2.0)),
    ))
    .style(move |s| {
        s.padding(8.0).width_full().background(theme::BG_SURFACE).border_radius(6.0).border(1.0).border_color(theme::BORDER)
    })
}

fn input_row(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    h_stack((
        theme::text_input(assistant.input)
            .keyboard_navigable()
            .on_key_down(Key::Named(NamedKey::Enter), |_| true, move |_| assistant.send())
            .style(|s| s.flex_grow(1.0)),
        theme::button("Send").action(move || assistant.send()),
    ))
    .style(move |s| {
        s.width_full().column_gap(6.0).apply_if(assistant.sending.get(), |s| s.color(theme::TEXT_MUTED))
    })
}
