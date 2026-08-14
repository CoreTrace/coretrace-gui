// Phase 0 spike: is a Rust llama.cpp binding viable on Windows, with GPU
// offload comparable to today's node-llama-cpp (the plan's actual Phase 0
// exit criteria for local-model support -- see phase0-status.md)?
//
// Loads a real ~1MB GGUF (stories260K, llama.cpp's own tiny CI test
// model -- see test-models/README.md), lists the ggml backend devices
// llama.cpp sees, requests full GPU offload, and runs real
// tokenize -> decode -> greedy-sample -> detokenize, matching the API
// pattern in llama-cpp-4's own tests/test_integration.rs.
//
// Build with `--features vulkan` (requires the Vulkan SDK installed) to
// compare device enumeration against the default CPU-only build.
use std::num::NonZeroU32;
use std::path::Path;

use llama_cpp_4::llama_backend::LlamaBackend;
use llama_cpp_4::llama_batch::LlamaBatch;
use llama_cpp_4::model::params::LlamaModelParams;
use llama_cpp_4::model::{AddBos, LlamaModel};
use llama_cpp_4::token::LlamaToken;
use llama_cpp_4::LlamaContextParams;

fn main() {
    let backend = LlamaBackend::init().expect("initialize llama.cpp backend");
    println!("llama.cpp backend initialized: {backend:?}");

    let model_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("test-models/stories260K.gguf");
    if !model_path.is_file() {
        eprintln!(
            "no test model at {model_path:?} -- see test-models/README.md to fetch it, skipping load/generate"
        );
        return;
    }

    let params = LlamaModelParams::default().with_n_gpu_layers(u32::MAX);
    let params = std::pin::pin!(params);
    let model =
        LlamaModel::load_from_file(&backend, &model_path, &params).expect("load stories260K.gguf");

    println!(
        "model loaded: {} layers, {} embd, {} vocab, n_devices={}",
        model.n_layer(),
        model.n_embd(),
        model.n_vocab(),
        model.n_devices()
    );
    for device in model.devices() {
        let name = device.name().unwrap_or_else(|_| "<unnamed>".into());
        let (free, total) = device.memory();
        println!("  device: {name} ({free} free / {total} total bytes)");
    }

    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(128))
        .with_n_batch(128);
    let mut ctx = model.new_context(&backend, ctx_params).expect("create context");

    let prompt = "Once upon a time";
    let tokens = model
        .str_to_token(prompt, AddBos::Always)
        .expect("tokenize prompt");

    let mut batch = LlamaBatch::new(128, 1);
    for (i, &tok) in tokens.iter().enumerate() {
        batch.add(tok, i as i32, &[0], i == tokens.len() - 1).expect("batch add");
    }
    ctx.decode(&mut batch).expect("prefill decode");

    let eos = model.token_eos();
    let mut generated = Vec::new();
    let mut pos = tokens.len() as i32;
    let mut logit_idx = batch.n_tokens() - 1;

    for _ in 0..16 {
        let logits = ctx.get_logits_ith(logit_idx);
        let best = logits
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .map(|(i, _)| i)
            .expect("logits non-empty");
        let token = LlamaToken(best as i32);
        if token == eos {
            break;
        }
        generated.push(token);

        batch.clear();
        batch.add(token, pos, &[0], true).expect("batch add");
        ctx.decode(&mut batch).expect("decode step");
        pos += 1;
        logit_idx = 0;
    }

    let text = model.detokenize(&generated, false, false).unwrap_or_default();
    println!("prompt: {prompt:?}");
    println!("generated ({} tokens): {text:?}", generated.len());
    assert!(!generated.is_empty(), "expected at least one generated token");
    println!("OK: real tokenize -> decode -> sample -> detokenize round trip succeeded");
}
