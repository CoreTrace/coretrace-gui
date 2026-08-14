use crate::types::{ChatOptions, LlmError};

pub trait LlmProvider {
    fn name(&self) -> &str;
    fn chat(&self, message: &str, options: &ChatOptions) -> Result<String, LlmError>;
}
