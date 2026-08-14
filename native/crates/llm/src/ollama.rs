use serde_json::json;

use crate::provider::LlmProvider;
use crate::types::{ChatOptions, LlmError};

/// Ollama's local `/api/chat` endpoint -- no API key, defaults to the
/// standard `http://localhost:11434` if `endpoint` is empty.
pub struct OllamaProvider {
    endpoint: String,
    model: String,
}

impl OllamaProvider {
    pub fn new(endpoint: &str, model: &str) -> Self {
        let endpoint = if endpoint.is_empty() { "http://localhost:11434" } else { endpoint };
        Self { endpoint: endpoint.to_string(), model: model.to_string() }
    }
}

impl LlmProvider for OllamaProvider {
    fn name(&self) -> &str {
        "Ollama (local)"
    }

    fn chat(&self, message: &str, options: &ChatOptions) -> Result<String, LlmError> {
        let mut messages = vec![json!({"role": "system", "content": options.system_prompt})];
        messages.extend(options.history.iter().map(|m| json!({"role": m.role.as_str(), "content": m.content})));
        messages.push(json!({"role": "user", "content": message}));

        let body = json!({
            "model": self.model,
            "messages": messages,
            "stream": false,
            "options": {"temperature": options.temperature},
        });

        let client = reqwest::blocking::Client::new();
        let response = client
            .post(format!("{}/api/chat", self.endpoint))
            .json(&body)
            .send()
            .map_err(|e| LlmError::Request(e.to_string()))?;

        let parsed: serde_json::Value = response.json().map_err(|e| LlmError::InvalidResponse(e.to_string()))?;

        if let Some(error) = parsed.get("error").and_then(|e| e.as_str()) {
            return Err(LlmError::Api(error.to_string()));
        }

        parsed["message"]["content"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| LlmError::InvalidResponse("missing message.content".to_string()))
    }
}
