use std::sync::atomic::{AtomicU64, Ordering};

use floem::reactive::{RwSignal, Scope, SignalGet, SignalUpdate, SignalWith};

use coretrace_llm::{build_provider, ChatMessage, ChatOptions, ProviderKind, Role};

use crate::llm_settings::PersistedSettings;

static NEXT_MESSAGE_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, PartialEq)]
pub struct DisplayMessage {
    pub id: u64,
    pub role: Role,
    pub content: String,
}

#[derive(Clone, Copy)]
pub struct AssistantState {
    pub provider_kind: RwSignal<ProviderKind>,
    pub api_key: RwSignal<String>,
    pub model: RwSignal<String>,
    pub endpoint: RwSignal<String>,
    pub model_path: RwSignal<String>,
    pub messages: RwSignal<Vec<DisplayMessage>>,
    pub input: RwSignal<String>,
    pub sending: RwSignal<bool>,
    pub error: RwSignal<Option<String>>,
}

impl AssistantState {
    pub fn new(cx: Scope) -> Self {
        let settings = PersistedSettings::load();
        let kind = settings.selected.unwrap_or(ProviderKind::OpenAi);
        let config = settings.config_for(kind);
        Self {
            provider_kind: cx.create_rw_signal(kind),
            api_key: cx.create_rw_signal(config.api_key),
            model: cx.create_rw_signal(config.model),
            endpoint: cx.create_rw_signal(config.endpoint),
            model_path: cx.create_rw_signal(config.model_path),
            messages: cx.create_rw_signal(Vec::new()),
            input: cx.create_rw_signal(String::new()),
            sending: cx.create_rw_signal(false),
            error: cx.create_rw_signal(None),
        }
    }

    /// Switches the active provider, loading whatever config was last
    /// saved for it (empty fields if none yet).
    pub fn select_provider(&self, kind: ProviderKind) {
        let settings = PersistedSettings::load();
        let config = settings.config_for(kind);
        self.provider_kind.set(kind);
        self.api_key.set(config.api_key);
        self.model.set(config.model);
        self.endpoint.set(config.endpoint);
        self.model_path.set(config.model_path);
    }

    pub fn save_settings(&self) {
        let mut settings = PersistedSettings::load();
        let kind = self.provider_kind.get_untracked();
        settings.selected = Some(kind);
        settings.set_config(
            kind,
            coretrace_llm::ProviderConfig {
                api_key: self.api_key.get_untracked(),
                model: self.model.get_untracked(),
                endpoint: self.endpoint.get_untracked(),
                model_path: self.model_path.get_untracked(),
            },
        );
        settings.save();
    }

    /// Sends `input` to the active provider and appends both the user
    /// message and the reply to `messages`. Blocking, like
    /// `DiagnosticsState::run_on` -- a button-triggered network/local-
    /// inference call, not a hot path; see native/docs/phase4-status.md
    /// for why an async executor isn't justified here either.
    pub fn send(&self) {
        let text = self.input.get_untracked();
        if text.trim().is_empty() {
            return;
        }
        self.error.set(None);
        self.sending.set(true);
        self.input.set(String::new());

        // Snapshot history *before* appending this turn's own user
        // message -- ChatOptions.history is everything that came
        // before `message`, and every provider's chat() appends
        // `message` as the final user turn itself. Appending it to
        // `messages` first and then reading `messages` into `history`
        // would send the same user turn to the provider twice.
        let history: Vec<ChatMessage> =
            self.messages.with(|m| m.iter().map(|d| ChatMessage { role: d.role, content: d.content.clone() }).collect());

        let user_id = NEXT_MESSAGE_ID.fetch_add(1, Ordering::Relaxed);
        self.messages.update(|m| m.push(DisplayMessage { id: user_id, role: Role::User, content: text.clone() }));

        let config = coretrace_llm::ProviderConfig {
            api_key: self.api_key.get_untracked(),
            model: self.model.get_untracked(),
            endpoint: self.endpoint.get_untracked(),
            model_path: self.model_path.get_untracked(),
        };
        let provider = build_provider(self.provider_kind.get_untracked(), &config);
        let options = ChatOptions { history, ..ChatOptions::default() };

        match provider.chat(&text, &options) {
            Ok(reply) => {
                let reply_id = NEXT_MESSAGE_ID.fetch_add(1, Ordering::Relaxed);
                self.messages.update(|m| m.push(DisplayMessage { id: reply_id, role: Role::Assistant, content: reply }));
            }
            Err(e) => self.error.set(Some(e.to_string())),
        }
        self.sending.set(false);
    }
}
