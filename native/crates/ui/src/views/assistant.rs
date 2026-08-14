use floem::keyboard::{Key, NamedKey};
use floem::peniko::Color;
use floem::prelude::*;
use floem::views::Decorators;

use coretrace_llm::{ProviderKind, Role};

use crate::assistant_state::DisplayMessage;
use crate::state::AppState;

pub fn assistant_panel(state: AppState) -> impl IntoView {
    let assistant = state.assistant;

    v_stack((
        provider_row(state),
        config_fields(state),
        dyn_container(
            move || assistant.error.get(),
            move |err| match err {
                Some(message) => label(move || format!("Error: {message}")).style(|s| s.padding(4.0)).into_any(),
                None => empty().into_any(),
            },
        ),
        dyn_stack(
            move || assistant.messages.get(),
            |m: &DisplayMessage| m.id,
            message_row,
        )
        .style(|s| s.flex_col().width_full()),
        input_row(state),
    ))
    .style(|s| s.width_full())
}

fn provider_row(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    button(label(move || format!("Provider: {}", assistant.provider_kind.get().label())).style(|s| s.padding(4.0)))
        .action(move || {
            let all = ProviderKind::all();
            let current = assistant.provider_kind.get_untracked();
            let idx = all.iter().position(|k| *k == current).unwrap_or(0);
            assistant.select_provider(all[(idx + 1) % all.len()]);
        })
        .style(|s| s.margin(4.0))
}

fn config_fields(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    v_stack((
        labeled_input("API key", assistant.api_key),
        labeled_input("Model", assistant.model),
        labeled_input("Endpoint (Generic/Ollama)", assistant.endpoint),
        labeled_input("Model path (Local)", assistant.model_path),
        button("Save settings").action(move || assistant.save_settings()).style(|s| s.margin(4.0)),
    ))
    .style(|s| s.width_full())
}

fn labeled_input(label_text: &str, value: RwSignal<String>) -> impl IntoView {
    let label_text = label_text.to_string();
    h_stack((
        label(move || label_text.clone()).style(|s| s.width(180.0)),
        text_input(value).style(|s| s.flex_grow(1.0)),
    ))
    .style(|s| s.padding(2.0).width_full().items_center())
}

fn message_row(message: DisplayMessage) -> impl IntoView {
    let prefix = match message.role {
        Role::User => "You",
        Role::Assistant => "Assistant",
    };
    let text = format!("{prefix}: {}", message.content);
    label(move || text.clone())
        .style(|s| s.padding(4.0).width_full())
}

fn input_row(state: AppState) -> impl IntoView {
    let assistant = state.assistant;
    h_stack((
        text_input(assistant.input)
            .keyboard_navigable()
            .on_key_down(Key::Named(NamedKey::Enter), |_| true, move |_| assistant.send())
            .style(|s| s.flex_grow(1.0)),
        button("Send").action(move || assistant.send()),
    ))
    .style(move |s| {
        s.width_full().padding(4.0).apply_if(assistant.sending.get(), |s| s.color(Color::rgb8(0x90, 0x90, 0x90)))
    })
}
