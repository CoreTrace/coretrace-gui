use std::fmt;

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    User,
    Assistant,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::User => "user",
            Role::Assistant => "assistant",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ChatOptions {
    pub system_prompt: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub history: Vec<ChatMessage>,
}

impl Default for ChatOptions {
    fn default() -> Self {
        Self {
            system_prompt: "You are a helpful coding assistant.".to_string(),
            temperature: 0.7,
            max_tokens: 2000,
            history: Vec::new(),
        }
    }
}

#[derive(Debug)]
pub enum LlmError {
    MissingApiKey,
    Request(String),
    InvalidResponse(String),
    Api(String),
}

impl fmt::Display for LlmError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LlmError::MissingApiKey => write!(f, "API key is required"),
            LlmError::Request(e) => write!(f, "request failed: {e}"),
            LlmError::InvalidResponse(e) => write!(f, "invalid response: {e}"),
            LlmError::Api(e) => write!(f, "API error: {e}"),
        }
    }
}

impl std::error::Error for LlmError {}
