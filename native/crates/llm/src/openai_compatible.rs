use serde_json::json;

use crate::provider::LlmProvider;
use crate::types::{ChatOptions, LlmError};

/// OpenAI, Groq, Deepseek, and Perplexity all speak the same
/// `/chat/completions` shape (Bearer auth, `{model, messages,
/// temperature, max_tokens}` in, `choices[0].message.content` out) --
/// one client, different endpoint/model presets, matching how the old
/// Electron app's own providers only differed in those two fields.
pub struct OpenAiCompatibleProvider {
    name: String,
    endpoint: String,
    model: String,
    api_key: String,
}

impl OpenAiCompatibleProvider {
    pub fn new(name: &str, endpoint: &str, model: &str, api_key: &str) -> Self {
        Self {
            name: name.to_string(),
            endpoint: endpoint.to_string(),
            model: model.to_string(),
            api_key: api_key.to_string(),
        }
    }

    pub fn openai(model: &str, api_key: &str) -> Self {
        Self::new("OpenAI", "https://api.openai.com/v1/chat/completions", model, api_key)
    }

    pub fn groq(model: &str, api_key: &str) -> Self {
        Self::new("Groq", "https://api.groq.com/openai/v1/chat/completions", model, api_key)
    }

    pub fn deepseek(model: &str, api_key: &str) -> Self {
        Self::new("Deepseek", "https://api.deepseek.com/v1/chat/completions", model, api_key)
    }

    pub fn perplexity(model: &str, api_key: &str) -> Self {
        Self::new("Perplexity", "https://api.perplexity.ai/chat/completions", model, api_key)
    }

    pub fn generic(endpoint: &str, model: &str, api_key: &str) -> Self {
        Self::new("Generic (OpenAI-compatible)", endpoint, model, api_key)
    }
}

impl LlmProvider for OpenAiCompatibleProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn chat(&self, message: &str, options: &ChatOptions) -> Result<String, LlmError> {
        if self.api_key.is_empty() {
            return Err(LlmError::MissingApiKey);
        }

        let mut messages = vec![json!({"role": "system", "content": options.system_prompt})];
        messages.extend(options.history.iter().map(|m| json!({"role": m.role.as_str(), "content": m.content})));
        messages.push(json!({"role": "user", "content": message}));

        let body = json!({
            "model": self.model,
            "messages": messages,
            "temperature": options.temperature,
            "max_tokens": options.max_tokens,
        });

        let client = reqwest::blocking::Client::new();
        let response = client
            .post(&self.endpoint)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .map_err(|e| LlmError::Request(e.to_string()))?;

        let parsed: serde_json::Value = response.json().map_err(|e| LlmError::InvalidResponse(e.to_string()))?;

        if let Some(error) = parsed.get("error") {
            let message = error.get("message").and_then(|m| m.as_str()).unwrap_or("unknown API error");
            return Err(LlmError::Api(message.to_string()));
        }

        parsed["choices"][0]["message"]["content"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| LlmError::InvalidResponse("missing choices[0].message.content".to_string()))
    }
}
