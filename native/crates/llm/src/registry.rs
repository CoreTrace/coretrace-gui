use serde::{Deserialize, Serialize};

use crate::anthropic::AnthropicProvider;
use crate::local_llama::LocalLlamaProvider;
use crate::ollama::OllamaProvider;
use crate::openai_compatible::OpenAiCompatibleProvider;
use crate::provider::LlmProvider;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProviderKind {
    OpenAi,
    Groq,
    Deepseek,
    Perplexity,
    Generic,
    Anthropic,
    Ollama,
    LocalLlama,
}

impl ProviderKind {
    pub fn all() -> [ProviderKind; 8] {
        [
            ProviderKind::OpenAi,
            ProviderKind::Groq,
            ProviderKind::Deepseek,
            ProviderKind::Perplexity,
            ProviderKind::Generic,
            ProviderKind::Anthropic,
            ProviderKind::Ollama,
            ProviderKind::LocalLlama,
        ]
    }

    pub fn label(self) -> &'static str {
        match self {
            ProviderKind::OpenAi => "OpenAI",
            ProviderKind::Groq => "Groq",
            ProviderKind::Deepseek => "Deepseek",
            ProviderKind::Perplexity => "Perplexity",
            ProviderKind::Generic => "Generic (OpenAI-compatible)",
            ProviderKind::Anthropic => "Anthropic (Claude)",
            ProviderKind::Ollama => "Ollama (local)",
            ProviderKind::LocalLlama => "Local (llama.cpp)",
        }
    }
}

/// Everything needed to build any provider -- fields not relevant to a
/// given `kind` are simply unused (e.g. `api_key` for Ollama/LocalLlama,
/// `endpoint` for anything but Generic/Ollama, `model_path` for
/// anything but LocalLlama).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub api_key: String,
    pub model: String,
    pub endpoint: String,
    pub model_path: String,
}

pub fn build_provider(kind: ProviderKind, config: &ProviderConfig) -> Box<dyn LlmProvider> {
    match kind {
        ProviderKind::OpenAi => Box::new(OpenAiCompatibleProvider::openai(&config.model, &config.api_key)),
        ProviderKind::Groq => Box::new(OpenAiCompatibleProvider::groq(&config.model, &config.api_key)),
        ProviderKind::Deepseek => Box::new(OpenAiCompatibleProvider::deepseek(&config.model, &config.api_key)),
        ProviderKind::Perplexity => Box::new(OpenAiCompatibleProvider::perplexity(&config.model, &config.api_key)),
        ProviderKind::Generic => {
            Box::new(OpenAiCompatibleProvider::generic(&config.endpoint, &config.model, &config.api_key))
        }
        ProviderKind::Anthropic => Box::new(AnthropicProvider::new(&config.model, &config.api_key)),
        ProviderKind::Ollama => Box::new(OllamaProvider::new(&config.endpoint, &config.model)),
        ProviderKind::LocalLlama => Box::new(LocalLlamaProvider::new(&config.model_path)),
    }
}
