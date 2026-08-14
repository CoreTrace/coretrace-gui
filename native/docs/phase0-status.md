# Phase 0 status

Tracks progress against the Phase 0 exit criteria in the relaunch plan
(`docs/phase0-status.md` is the running log; the plan file itself is at
`C:\Users\shookapic\.claude\plans\im-not-happy-with-linear-blanket.md`).

## Done

- Cargo workspace scaffolded: `crates/ui` (Floem native window) and
  `crates/ipc` (protocol + transport + client shared between the native
  core and, eventually, tooling/tests).
- Extension-host sidecar scaffolded as a plain Node.js process
  (`extension-host/`), no build step, ESM, newline-delimited JSON over a
  TCP loopback socket (port 7331).
- **Round-trip proven**: `cargo run --example ping -p coretrace-ipc`
  against a running `node extension-host/src/index.js` — native process
  connects, pings, and invokes a command that a "fake extension" in the
  sidecar registered, gets a correct structured response back. Confirms
  the core IPC shape works on Windows before any UI polish.
- Floem window (`crates/ui`) wires the same client to a button + label so
  the round-trip is reachable interactively, not just from the example.

## Real extension loaded (2026-08-14)

**A real, unmodified VSCode extension now runs inside the sidecar and its
effect round-trips back to the native side over IPC.**

- Extension: [`wmaurer.change-case`](https://open-vsx.org/extension/wmaurer/change-case)
  1.0.0, fetched unmodified from Open VSX (see
  `extension-host/spike-extension/README.md` for the fetch steps — not
  vendored into the repo). Plain CommonJS, ships its own `node_modules`.
- `extension-host/src/vscode-shim/` implements just the slice of the
  `vscode` API this extension touches: `Position`/`Range`/`Selection`,
  `commands.registerCommand` (backed by the same `CommandRegistry` the
  IPC server dispatches through), `window.activeTextEditor` /
  `showQuickPick` / `showInformationMessage`, `workspace.getConfiguration`.
  A fake in-memory `TextDocument`/`TextEditor`
  (`extension-host/src/fakeEditorState.js`) stands in for a real synced
  buffer until Phase 3.
- `extension-host/src/extensionLoader.js` patches `Module._load` (the
  same technique real VSCode itself uses) so the extension's own
  `require('vscode')` resolves to the shim, then calls its real
  `activate(context)` — all 17 of its commands register successfully,
  unmodified.
- **Proof**: `cargo run --example real_extension -p coretrace-ipc` sends
  `set_document_text("hello world")`, invokes the real
  `extension.changeCase.camel` command (no stub involved — this is the
  extension's actual `runCommand` calling the real `change-case` npm
  library it ships), reads the document back, and gets `"helloWorld"`.
  This is the extension's real logic running, not a simulation of it.

## Rust llama.cpp binding: viable on Windows (2026-08-14)

`crates/llm-spike` depends on [`llama-cpp-4`](https://crates.io/crates/llama-cpp-4)
0.5.1 (safe bindings over `llama-cpp-sys-4`, which vendors and compiles
llama.cpp from source at build time via `cmake`).

- **Builds clean with default (CPU) features** on this machine: `cmake`
  was present, and the MSVC compiler was auto-discovered by the `cc`
  crate's `find-msvc-tools` helper even though `cl.exe` wasn't on this
  shell's `PATH` -- no manual `vcvarsall.bat` dance needed.
- **Runtime-verified, not just compile-verified**: `cargo run -p
  coretrace-llm-spike` calls `LlamaBackend::init()`, which calls straight
  into the compiled native `ggml`/`llama.cpp` code. It returns cleanly --
  real linkage against the built native library, not just a successful
  `cargo build`.
- GPU backends are real Cargo features on this crate: `cuda`, `vulkan`,
  `hip`, `metal`, `opencl`, `webgpu`. **Not exercised here** -- this
  machine has neither a CUDA toolkit nor the Vulkan SDK installed
  (`CUDA_PATH`/`VULKAN_SDK` both unset). Vulkan is the more relevant one
  to verify next: it works across NVIDIA/AMD/Intel without requiring
  users to install a vendor-specific SDK, which fits a general Windows
  install target better than a CUDA-only story.
- Conclusion for the plan's "hybrid, resolve in Phase 0" open item on
  local LLM support (`node-llama-cpp` vs a Rust binding): **a Rust
  binding is viable**, at least for CPU inference. Recommend dropping the
  Node sidecar dependency for local-model inference and using this
  crate natively, pending: (a) enabling and testing the `vulkan` feature
  on a machine with the SDK installed, (b) an actual model-load +
  generate smoke test with a small GGUF file (not done here -- no model
  file was downloaded, this only proves the backend initializes).

## Not done yet (do not treat Phase 0 as closed until these land)

- Only one extension, and only the API surface it happens to touch, has
  been proven. No language-server-shaped extension, no extension that
  needs `vscode.languages.*`, `DiagnosticCollection`, or
  `vscode.window.createWebviewPanel` has been tried — the webview case in
  particular is the one flagged as a possible permanent product
  limitation in the plan, still unverified either way.
- ~~Latency/memory numbers~~ **done, see `phase0-measurements.md`.**
- ~~Rust `llama.cpp` binding viability~~ **done, see below.**
- Sidecar is started manually (`node src/index.js`); no process
  supervision/spawn-from-Rust/crash-recovery yet.
- `fakeEditorState` is a single global mutable document/editor, not a
  real per-file synced buffer — fine for this proof, not representative
  of Phase 3's actual document-sync design.

## Go/no-go verdict (preliminary)

**GO on the extension-host architecture**, with two follow-ups before
calling Phase 0 fully closed (see "not done yet" above):

1. The core hypothesis — native GPU UI + a Node sidecar shimming just
   enough of the `vscode` API to run real, unmodified extensions — works.
   One real extension's `activate()` ran unchanged and its command
   produced a correct result through the full IPC path, with a shim under
   200 lines across 8 small files.
2. IPC overhead is a non-issue at this scale (~27µs avg round trip,
   ~38.5MB sidecar RSS) — the architecture isn't going to be slow or
   heavy because of the sidecar split itself.
3. Local LLM inference does not need the Node sidecar either — a Rust
   `llama.cpp` binding initializes and links cleanly on Windows with no
   unusual toolchain setup.

**Caveat that keeps this "preliminary" and not final**: only one
extension, exercising only a `commands`-shaped API surface, has been
tried. The plan explicitly flagged `vscode.window.createWebviewPanel`
(and other browser-surface-assuming APIs) as the likely permanent
limitation of a no-webview architecture — that's still untested in
either direction. Don't scope Phase 3 in detail (per the plan's own
instruction) until a language-feature/diagnostics-shaped extension has
been tried and the webview question has an explicit answer, even if
that answer is "unsupported by design."

## Next concrete step

Try a second, differently-shaped real extension (something that needs
`vscode.languages.registerHoverProvider` or a `DiagnosticCollection`, not
just commands) to see how much the shim's surface has to grow. Latency
and memory numbers are now in `phase0-measurements.md`. On the llm-spike
side: get the `vulkan` feature building (needs the Vulkan SDK installed
first) and try an actual small-GGUF load+generate, not just backend init.
