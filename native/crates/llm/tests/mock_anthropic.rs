// Same idea as mock_openai_compatible.rs, for Anthropic's different
// request/response shape (x-api-key header, content[0].text) --
// exercises the real AnthropicProvider, pointed at a local mock server
// via with_endpoint (production code always uses the real endpoint
// through `new`; `with_endpoint` exists so tests don't need to
// duplicate the client's request-building logic).
mod support;

use coretrace_llm::{AnthropicProvider, ChatOptions, LlmProvider};
use support::MockServer;

#[test]
fn sends_x_api_key_and_parses_reply() {
    let response = r#"{"content": [{"type": "text", "text": "hello from claude mock"}]}"#;
    let server = MockServer::start(response);

    let provider =
        AnthropicProvider::with_endpoint(&format!("{}/v1/messages", server.base_url), "test-model", "test-anthropic-key");
    let reply = provider.chat("hi", &ChatOptions::default()).expect("chat should succeed");

    assert_eq!(reply, "hello from claude mock");

    let request = server.into_request_text();
    assert!(request.contains("x-api-key: test-anthropic-key"), "request was:\n{request}");
    assert!(request.contains("anthropic-version: 2023-06-01"), "request was:\n{request}");
    assert!(request.contains("\"model\":\"test-model\""), "request was:\n{request}");
    assert!(request.contains("POST /v1/messages"), "request was:\n{request}");
}

#[test]
fn surfaces_api_error_messages() {
    let response = r#"{"error": {"type": "authentication_error", "message": "invalid x-api-key"}}"#;
    let server = MockServer::start(response);

    let provider =
        AnthropicProvider::with_endpoint(&format!("{}/v1/messages", server.base_url), "test-model", "bad-key");
    let err = provider.chat("hi", &ChatOptions::default()).unwrap_err();

    assert!(err.to_string().contains("invalid x-api-key"));
}

#[test]
fn rejects_empty_api_key_without_a_network_call() {
    let provider = AnthropicProvider::with_endpoint("http://127.0.0.1:1", "test-model", "");
    let err = provider.chat("hi", &ChatOptions::default()).unwrap_err();
    assert!(matches!(err, coretrace_llm::LlmError::MissingApiKey));
}
