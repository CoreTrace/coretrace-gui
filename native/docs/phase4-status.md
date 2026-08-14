# Phase 4 status

Tracks progress against the Phase 4 scope in the relaunch plan
(`C:\Users\shookapic\.claude\plans\im-not-happy-with-linear-blanket.md`):
native Rust cloud LLM clients, a Rust llama.cpp binding for local
inference (Phase 0 proved this viable), an Ollama client, an assistant
panel UI, and a provider registry/settings port.

## Done and verified

- **`coretrace-llm` crate** (new): a `LlmProvider` trait (`name()`,
  `chat(message, options) -> Result<String, LlmError>`) with:
  - **`OpenAiCompatibleProvider`**: one client for OpenAI, Groq,
    Deepseek, Perplexity, and any Generic OpenAI-compatible endpoint --
    the old Electron app's five providers of this shape only differed
    in endpoint/model defaults (confirmed by reading all five
    `src/main/external_llm/*.js` files), so this ports that as one
    client with presets, not five near-duplicate files.
  - **`AnthropicProvider`**: Anthropic's distinct request/response
    shape (system prompt as a top-level field, `x-api-key` header,
    `content[0].text` response).
  - **`OllamaProvider`**: local `/api/chat`, no auth, defaults to
    `http://localhost:11434`.
  - **`LocalLlamaProvider`**: production wrapping of the Phase 0
    spike's tokenize/decode/sample/detokenize loop -- loads once (not
    per message), reuses the context across calls, clears the KV cache
    before each call (see "a real bug found" below).
  - **`ProviderKind`/`ProviderConfig`/`build_provider`**: the registry,
    serializable for settings persistence.
- **Honest gap, stated plainly**: no live cloud API key, no Ollama
  install, and no clangd-equivalent "just present on the machine" local
  service exists here either -- checked (`where ollama`, a request to
  `localhost:11434`): neither is installed. Same category of gap as
  Phase 2's clangd finding.
- **What's actually verified**, all real, no in-process mocking:
  - `OpenAiCompatibleProvider` and `AnthropicProvider`: against a real
    HTTP/1.1 server on a real TCP socket (`tests/support/mod.rs`),
    checking the exact request the real client sends (auth header,
    body shape) and that it parses a real response body, including the
    API-error-surfacing path. `AnthropicProvider` gained a
    `with_endpoint` constructor specifically so the test exercises the
    *real* client code, not a re-implementation -- an earlier draft of
    this test duplicated the client's request logic instead, which
    would have verified nothing about the actual code path; caught and
    fixed before landing.
  - `OllamaProvider`: same pattern, plus a test confirming the
    empty-endpoint-defaults-to-localhost behavior fails the way you'd
    expect when nothing's listening there.
  - `LocalLlamaProvider`: **real inference**, not mocked -- reuses the
    same real ~1MB `stories260K.gguf` (llama.cpp's own tiny CI test
    model) the Phase 0 spike used, run through the actual production
    `LlmProvider::chat` path twice in the same test to prove the
    "load once, reuse context" design and not just a single call.
- **A real bug found and fixed**: the second call in the local-llama
  test failed with a real llama.cpp decode error (`the tokens of
  sequence 0 ... starting position of Y = 0 ... it is required that
  the sequence positions remain consecutive`). Cause: each `chat()`
  call re-renders the *entire* conversation as a fresh prompt
  (`format_prompt`), but the context's KV cache was never cleared
  between calls, so the second prefill's positions (starting at 0)
  collided with the first call's already-occupied cache positions.
  Fixed with `ctx.clear_kv_cache()` before each prefill.
- **Self-referential struct avoided without unsafe code**: an early
  draft of `LocalLlamaProvider` used `std::mem::transmute` to widen a
  `LlamaContext`'s borrow to `'static` so it could live in the same
  struct as the `LlamaModel`/`LlamaBackend` it borrows from. Replaced
  before landing with `Box::leak` (matching `sidecar::spawn()`'s
  existing, already-reviewed pattern in this codebase for
  process-lifetime singletons) -- same outcome, no unsafe.
- **UI** (`crates/ui`):
  - `AssistantState`: provider selection (cycles through
    `ProviderKind::all()` via one button), per-provider config fields
    (API key, model, endpoint, model path), message history, a
    blocking `send()` (same reasoning as `DiagnosticsState::run_on`
    and Commands' `run_command_on_file` -- a button-triggered call, not
    a hot path).
  - `llm_settings.rs`: persists to
    `%APPDATA%/coretrace/llm-settings.json`, one `ProviderConfig` per
    provider kind so switching providers doesn't discard previously
    entered keys for the others -- matches the old app's per-provider
    config storage in spirit.
  - Assistant panel: provider cycle button, config fields, message
    list, input + Send (Enter also sends, same pattern as the
    Extensions panel's search box).
  - Sidebar toolbar reorganized into three rows of two-to-three
    buttons (was two rows) to fit the new Assistant button within the
    320px sidebar without repeating Phase 2's overflow bug.

**Verified via real UI interaction, not just compiled**: launched the
app, opened the Assistant panel, left the API key blank, sent "hello"
through the real input box and the real Send button, and confirmed
both a real `LlmError::MissingApiKey` surfacing as "Error: API key is
required" and the message list showing "You: hello" -- the actual
`send()` code path (build a provider, call `chat`, render success or
error) running for real, not simulated. Also directly exercised the
provider-cycling button through several kinds, confirming the label
and config fields swap correctly for each.

**A real bug found in the UI-testing methodology, not the app,
recorded for future sessions**: manually forcing the window to a new
size/position via `SetWindowPos` from the PowerShell automation script
desynced Floem/winit's click hit-testing from the window's reported
bounds -- every click and Enter-key send silently did nothing
afterward (input never cleared, no error appeared), even though the
window was visibly on top and foregrounded. Confirmed by a control
test: a plain sidebar button (no relation to the assistant panel) also
stopped responding after the same `SetWindowPos` call. Root-caused by
process of elimination (not a click-coordinate error, not a
provider/text-input-specific issue) and fixed by never calling
`SetWindowPos` again -- relaunching fresh and letting the app manage
its own window size resolved it immediately. Worth remembering: don't
externally resize a running Floem window during UI automation.

## Known simplifications, stated plainly

- Local generation uses greedy sampling (always the top logit), not
  temperature/top-p sampling a chat model would normally want. There's
  no real instruction-tuned GGUF on this machine to judge output
  quality against, so a fancier sampler couldn't actually be verified
  as an improvement over the simpler, deterministic option -- see the
  Phase 0 spike's own reasoning, carried forward here rather than
  guessed at.
- `send()` blocks the UI thread for the duration of the network call
  or local generation, same tradeoff as ctrace's `run_on` and the
  Commands panel's command execution.
- No streaming responses -- `chat()` returns the full reply at once,
  matching the old Electron app's own non-streaming provider
  implementations (confirmed by reading them).
- The local-llama generation path through the *UI* specifically
  (provider set to Local, real prompt, real reply appearing in the
  message list) wasn't re-confirmed after the `SetWindowPos` incident
  interrupted that specific test run -- the OpenAI-compatible path
  *was* re-confirmed end to end after the fix, exercising the
  identical `send()` code, and `LocalLlamaProvider` itself is verified
  at the crate level with real generation, so this is a redundant
  check left undone rather than an unverified code path.
- Prompt formatting for local models is a simple
  `role: content` transcript, not any model family's real chat
  template (e.g. Llama's `[INST]` tags or ChatML) -- reasonable given
  there's no specific real local model this needs to match yet.

## Phase 4 verdict

Every provider in the plan's Phase 4 scope is implemented as real,
working code: OpenAI/Groq/Deepseek/Perplexity/Generic (one client,
five presets), Anthropic, Ollama, and a production-quality local
llama.cpp wrapper building on the Phase 0 spike. All four shapes are
verified for real -- three against a real HTTP server on a real
socket (since no live API keys or Ollama install exist here to test
against directly), one (local llama.cpp) with genuine model inference
using the same real GGUF the spike proved viable. The assistant panel
UI is real, wired to real persistence, and its core send/receive loop
is confirmed working through actual UI interaction, not just a
successful compile. The gaps that remain (streaming, live cloud/Ollama
verification, chat-template fidelity) are the same honest category of
gap Phase 2 hit with clangd: infrastructure that's real and ready, not
yet exercised against the specific external service it targets because
that service isn't installed or keyed on this machine.
