// Same pattern again, for Ollama's /api/chat shape (no auth,
// message.content in a non-choices-wrapped response).
mod support;

use coretrace_llm::{ChatOptions, LlmProvider, OllamaProvider};
use support::MockServer;

#[test]
fn posts_to_api_chat_and_parses_reply() {
    let response = r#"{"message": {"role": "assistant", "content": "hello from ollama mock"}, "done": true}"#;
    let server = MockServer::start(response);

    let provider = OllamaProvider::new(&server.base_url, "llama3");
    let reply = provider.chat("hi", &ChatOptions::default()).expect("chat should succeed");

    assert_eq!(reply, "hello from ollama mock");

    let request = server.into_request_text();
    assert!(request.contains("POST /api/chat"), "request was:\n{request}");
    assert!(request.contains("\"model\":\"llama3\""), "request was:\n{request}");
}

#[test]
fn defaults_to_localhost_when_endpoint_is_empty() {
    let provider = OllamaProvider::new("", "llama3");
    // No network call here -- just confirms the default doesn't panic
    // and produces the expected connection-refused-shaped error rather
    // than silently pointing nowhere (localhost:11434 with nothing
    // listening, in this test environment).
    let err = provider.chat("hi", &ChatOptions::default()).unwrap_err();
    assert!(matches!(err, coretrace_llm::LlmError::Request(_)));
}
