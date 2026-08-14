// Verifies OpenAiCompatibleProvider's request shape and response
// parsing against a real HTTP server on a real socket -- no live API
// key needed or used. See tests/support/mod.rs and
// native/docs/phase4-status.md for why this is the honest substitute
// for a real provider in this environment.
mod support;

use coretrace_llm::{ChatOptions, LlmProvider, OpenAiCompatibleProvider};
use support::MockServer;

#[test]
fn sends_bearer_auth_and_parses_reply() {
    let response = r#"{"choices": [{"message": {"role": "assistant", "content": "hello from the mock"}}]}"#;
    let server = MockServer::start(response);

    let provider = OpenAiCompatibleProvider::generic(&format!("{}/v1/chat/completions", server.base_url), "test-model", "sk-test-key");
    let reply = provider.chat("hi", &ChatOptions::default()).expect("chat should succeed");

    assert_eq!(reply, "hello from the mock");

    let request = server.into_request_text();
    assert!(request.to_lowercase().contains("authorization: bearer sk-test-key"), "request was:\n{request}");
    assert!(request.contains("\"model\":\"test-model\""), "request was:\n{request}");
    assert!(request.contains("POST /v1/chat/completions"), "request was:\n{request}");
}

#[test]
fn surfaces_api_error_messages() {
    let response = r#"{"error": {"message": "invalid api key"}}"#;
    let server = MockServer::start(response);

    let provider = OpenAiCompatibleProvider::generic(&format!("{}/v1/chat/completions", server.base_url), "test-model", "sk-test-key");
    let err = provider.chat("hi", &ChatOptions::default()).unwrap_err();

    assert!(err.to_string().contains("invalid api key"));
}

#[test]
fn rejects_empty_api_key_without_a_network_call() {
    let provider = OpenAiCompatibleProvider::generic("http://127.0.0.1:1", "test-model", "");
    let err = provider.chat("hi", &ChatOptions::default()).unwrap_err();
    assert!(matches!(err, coretrace_llm::LlmError::MissingApiKey));
}
