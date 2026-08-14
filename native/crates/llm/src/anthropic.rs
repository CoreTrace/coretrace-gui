use serde_json::json;

use crate::provider::LlmProvider;
use crate::types::{ChatOptions, LlmError};

const ANTHROPIC_VERSION: &str = "2023-06-01";

pub struct AnthropicProvider {
    endpoint: String,
    model: String,
    api_key: String,
}

impl AnthropicProvider {
    pub fn new(model: &str, api_key: &str) -> Self {
        Self::with_endpoint("https://api.anthropic.com/v1/messages", model, api_key)
    }

    /// Same as `new`, with a caller-chosen endpoint -- exists so tests
    /// can point the real client at a local mock server instead of
    /// duplicating its request-building logic.
    pub fn with_endpoint(endpoint: &str, model: &str, api_key: &str) -> Self {
        Self { endpoint: endpoint.to_string(), model: model.to_string(), api_key: api_key.to_string() }
    }
}

impl LlmProvider for AnthropicProvider {
    fn name(&self) -> &str {
        "Anthropic (Claude)"
    }

    fn chat(&self, message: &str, options: &ChatOptions) -> Result<String, LlmError> {
        if self.api_key.is_empty() {
            return Err(LlmError::MissingApiKey);
        }

        let mut messages: Vec<_> =
            options.history.iter().map(|m| json!({"role": m.role.as_str(), "content": m.content})).collect();
        messages.push(json!({"role": "user", "content": message}));

        let body = json!({
            "model": self.model,
            "max_tokens": options.max_tokens,
            "system": options.system_prompt,
            "messages": messages,
            "temperature": options.temperature,
        });

        let client = reqwest::blocking::Client::new();
        let response = client
            .post(&self.endpoint)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&body)
            .send()
            .map_err(|e| LlmError::Request(e.to_string()))?;

        let parsed: serde_json::Value = response.json().map_err(|e| LlmError::InvalidResponse(e.to_string()))?;

        if let Some(error) = parsed.get("error") {
            let message = error.get("message").and_then(|m| m.as_str()).unwrap_or("unknown API error");
            return Err(LlmError::Api(message.to_string()));
        }

        parsed["content"][0]["text"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| LlmError::InvalidResponse("missing content[0].text".to_string()))
    }
}
