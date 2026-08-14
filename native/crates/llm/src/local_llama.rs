use std::cell::RefCell;
use std::num::NonZeroU32;
use std::path::PathBuf;

use llama_cpp_4::llama_backend::LlamaBackend;
use llama_cpp_4::llama_batch::LlamaBatch;
use llama_cpp_4::model::params::LlamaModelParams;
use llama_cpp_4::model::{AddBos, LlamaModel};
use llama_cpp_4::token::LlamaToken;
use llama_cpp_4::{LlamaContext, LlamaContextParams};

use crate::provider::LlmProvider;
use crate::types::{ChatOptions, LlmError};

const CONTEXT_SIZE: u32 = 2048;

/// Production wrapping of the Phase 0 spike (`llm-spike`'s greedy
/// tokenize/decode/sample/detokenize loop, proven viable with GPU
/// offload there): loads once, keeps the backend/model/context alive
/// across calls instead of reloading per message. Uses interior
/// mutability (`RefCell`, not `Mutex`) because `LlmProvider::chat`
/// takes `&self` and this is only ever driven from the UI's single
/// thread -- no real concurrent access to guard against.
///
/// Sampling is greedy (always the top logit), not the temperature/top-p
/// sampling a chat model would normally want -- deliberately kept
/// simple and deterministic rather than added speculatively: there's no
/// real instruction-tuned GGUF model on this dev machine to judge
/// output quality against (see native/docs/phase4-status.md), so a
/// fancier sampler couldn't actually be verified as an improvement.
pub struct LocalLlamaProvider {
    model_path: PathBuf,
    state: RefCell<Option<LoadedModel>>,
}

struct LoadedModel {
    model: &'static LlamaModel,
    context: LlamaContext<'static>,
}

impl LocalLlamaProvider {
    pub fn new(model_path: &str) -> Self {
        Self { model_path: PathBuf::from(model_path), state: RefCell::new(None) }
    }

    fn ensure_loaded(&self) -> Result<(), LlmError> {
        if self.state.borrow().is_some() {
            return Ok(());
        }
        if !self.model_path.is_file() {
            return Err(LlmError::Request(format!("model file not found: {}", self.model_path.display())));
        }

        // Leaked deliberately, same reasoning as sidecar::spawn() in the
        // UI crate: one process-lifetime local model per app session,
        // never unloaded early. Leaking to 'static sidesteps the
        // self-referential-struct problem (LlamaContext borrows from
        // LlamaModel/LlamaBackend) without unsafe code.
        let backend: &'static LlamaBackend =
            Box::leak(Box::new(LlamaBackend::init().map_err(|e| LlmError::Request(e.to_string()))?));
        let params = LlamaModelParams::default().with_n_gpu_layers(u32::MAX);
        let params = std::pin::pin!(params);
        let model: &'static LlamaModel = Box::leak(Box::new(
            LlamaModel::load_from_file(backend, &self.model_path, &params)
                .map_err(|e| LlmError::Request(format!("failed to load model: {e}")))?,
        ));

        let ctx_params = LlamaContextParams::default().with_n_ctx(NonZeroU32::new(CONTEXT_SIZE)).with_n_batch(CONTEXT_SIZE);
        let context = model
            .new_context(backend, ctx_params)
            .map_err(|e| LlmError::Request(format!("failed to create context: {e}")))?;

        *self.state.borrow_mut() = Some(LoadedModel { model, context });
        Ok(())
    }
}

impl LlmProvider for LocalLlamaProvider {
    fn name(&self) -> &str {
        "Local (llama.cpp)"
    }

    fn chat(&self, message: &str, options: &ChatOptions) -> Result<String, LlmError> {
        self.ensure_loaded()?;
        let mut state = self.state.borrow_mut();
        let loaded = state.as_mut().expect("just ensured loaded");

        let prompt = format_prompt(&options.system_prompt, &options.history, message);
        generate(&loaded.model, &mut loaded.context, &prompt, options.max_tokens)
    }
}

fn format_prompt(system_prompt: &str, history: &[crate::types::ChatMessage], message: &str) -> String {
    let mut prompt = format!("System: {system_prompt}\n");
    for turn in history {
        prompt.push_str(&format!("{}: {}\n", turn.role.as_str(), turn.content));
    }
    prompt.push_str(&format!("user: {message}\nassistant:"));
    prompt
}

fn generate(model: &LlamaModel, ctx: &mut LlamaContext, prompt: &str, max_tokens: u32) -> Result<String, LlmError> {
    let tokens = model
        .str_to_token(prompt, AddBos::Always)
        .map_err(|e| LlmError::Request(format!("tokenize failed: {e}")))?;

    // Each chat() call sends the whole conversation as a fresh prompt
    // (format_prompt re-renders the full history every time, there's no
    // incremental turn-by-turn decoding), so the KV cache from any
    // previous call must be dropped first -- otherwise the new prefill's
    // token positions (starting at 0) collide with whatever positions
    // are already occupied from the last call. Found for real: the
    // second call in local_llama_real.rs's test failed with a "sequence
    // positions remain consecutive" decode error before this was added.
    ctx.clear_kv_cache();

    let batch_size = CONTEXT_SIZE.max(tokens.len() as u32 + max_tokens) as usize;
    let mut batch = LlamaBatch::new(batch_size, 1);
    for (i, &tok) in tokens.iter().enumerate() {
        batch.add(tok, i as i32, &[0], i == tokens.len() - 1).map_err(|e| LlmError::Request(e.to_string()))?;
    }
    ctx.decode(&mut batch).map_err(|e| LlmError::Request(format!("prefill decode failed: {e}")))?;

    let eos = model.token_eos();
    let mut generated = Vec::new();
    let mut pos = tokens.len() as i32;
    let mut logit_idx = batch.n_tokens() - 1;

    for _ in 0..max_tokens {
        let logits = ctx.get_logits_ith(logit_idx);
        let best = logits
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .map(|(i, _)| i)
            .ok_or_else(|| LlmError::Request("no logits produced".to_string()))?;
        let token = LlamaToken(best as i32);
        if token == eos {
            break;
        }
        generated.push(token);

        batch.clear();
        batch.add(token, pos, &[0], true).map_err(|e| LlmError::Request(e.to_string()))?;
        ctx.decode(&mut batch).map_err(|e| LlmError::Request(format!("decode step failed: {e}")))?;
        pos += 1;
        logit_idx = 0;
    }

    Ok(model.detokenize(&generated, false, false).unwrap_or_default())
}
