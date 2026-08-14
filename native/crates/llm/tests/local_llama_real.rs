// Real end-to-end verification of LocalLlamaProvider -- not a mock:
// loads the same real ~1MB GGUF the Phase 0 spike used
// (llm-spike/test-models/stories260K.gguf, llama.cpp's own tiny CI
// test model) and runs a real generation through the production
// wrapper's LlmProvider::chat. Output is expected to be small-model
// gibberish, not verified for quality -- there's no real
// instruction-tuned GGUF on this dev machine, see
// native/docs/phase4-status.md. What this test proves is that the
// load -> chat -> generate path in local_llama.rs actually works.
use std::path::PathBuf;

use coretrace_llm::{ChatOptions, LlmProvider, LocalLlamaProvider};

fn test_model_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../llm-spike/test-models/stories260K.gguf")
}

#[test]
fn generates_real_text_from_a_real_model() {
    let model_path = test_model_path();
    if !model_path.is_file() {
        eprintln!("no test model at {model_path:?}, skipping (see llm-spike/test-models/README.md)");
        return;
    }

    let provider = LocalLlamaProvider::new(&model_path.to_string_lossy());
    let mut options = ChatOptions::default();
    options.max_tokens = 16;

    let reply = provider.chat("Once upon a time", &options).expect("local generation should succeed");
    assert!(!reply.is_empty(), "expected non-empty generated text");

    // Second call reuses the already-loaded model/context instead of
    // reloading -- proves ensure_loaded()'s "load once" path, not just
    // the first call.
    let reply2 = provider.chat("The dog ran", &options).expect("second generation should succeed");
    assert!(!reply2.is_empty());
}

#[test]
fn reports_a_clear_error_for_a_missing_model_file() {
    let provider = LocalLlamaProvider::new("Z:/definitely/not/a/real/model.gguf");
    let err = provider.chat("hi", &ChatOptions::default()).unwrap_err();
    assert!(err.to_string().contains("model file not found"), "error was: {err}");
}
