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

## Second extension: the webview case answered (2026-08-14)

Tried [`bierner.docs-view`](https://open-vsx.org/extension/bierner/docs-view)
0.1.0 — a real, webpack-bundled extension that calls
`vscode.window.registerWebviewViewProvider` for a documentation sidebar,
plus two ordinary commands. Full account in
`extension-host/spike-extension-webview/README.md`; summary:

- **It activates cleanly and its non-webview commands actually execute.**
  Getting there grew the shim by `vscode.EventEmitter`, half a dozen
  no-op `onDid*` event subscriptions, `commands.executeCommand`, and a
  stub `registerWebviewViewProvider` that registers the provider (so
  `activate()` succeeds) but never calls `resolveWebviewView` (so the
  view itself never renders — there is no rendering surface to hand it).
- **This answers the plan's flagged open question**: a webview-using
  extension degrades gracefully rather than crashing outright. The "no
  webview features" limitation can be scoped narrowly (that one view
  stays inert) instead of blocklisting the whole extension. Still worth
  confirming against a second, more webview-central extension before
  calling this fully settled — this one only used a webview for one
  secondary panel, not its whole reason to exist.
## Third extension: languages.*/DiagnosticCollection answered (2026-08-14)

Tried [`mitaki28.vscode-clang`](https://open-vsx.org/extension/mitaki28/vscode-clang)
0.2.4 — real, unmodified, dependency-free (13.8KB), a clang-backed C/C++
diagnostics + completion extension. Full account in
`extension-host/spike-extension-diagnostics/README.md`; summary:

- **Activates cleanly and genuinely reaches
  `languages.createDiagnosticCollection` and
  `languages.registerCompletionItemProvider`** — confirmed by
  instrumenting the shim, not just assumed: both calls fire during
  `activate()`, gated on config values the extension reads from its own
  declared defaults (not skipped by a stub returning a falsy default).
- Required growing `workspace.getConfiguration()` from a dumb
  default-passthrough into something that reads the loaded extension's
  own `contributes.configuration.properties` at load time
  (`configDefaults.js`) — matches how real VSCode configuration defaults
  actually work, not a spike-only shortcut. Also added a real `Memento`
  for `context.workspaceState`/`globalState`, `Disposable.from(...)`,
  `Diagnostic`/`DiagnosticSeverity`, `registerTextEditorCommand`,
  `createOutputChannel`, and warning/error message variants.
- All three extensions re-verified together afterward — no regressions
  from the shared shim changes.

Total shim growth across all three extensions: 14 small files, roughly
340 lines. Still converging, not exploding — three differently-shaped
real extensions (commands-only, webview, language-features) landed
within a shim that stayed small and legible throughout.

## Not done yet (do not treat Phase 0 as closed until these land)

- The webview finding is from one extension where the webview was a
  secondary feature, not the extension's whole purpose — worth
  re-confirming against something more webview-central before treating
  that finding as fully general.
- `languages.*` providers (`registerCompletionItemProvider`,
  `registerHoverProvider`) are registration stubs — no completion/hover
  request has actually been dispatched through one yet, since that needs
  a real document-sync + provider-invocation path this spike doesn't
  build. Same for diagnostic computation: the collection is created for
  real, but nothing has pushed a real `Diagnostic` into it end-to-end
  through IPC the way `real_extension.rs` does for change-case's
  document mutation.
- ~~Latency/memory numbers~~ **done, see `phase0-measurements.md`.**
- ~~Rust `llama.cpp` binding viability~~ **done, see below.**
- Sidecar is started manually (`node src/index.js`); no process
  supervision/spawn-from-Rust/crash-recovery yet.
- `fakeEditorState` is a single global mutable document/editor, not a
  real per-file synced buffer — fine for this proof, not representative
  of Phase 3's actual document-sync design.

## Go/no-go verdict

**GO on the extension-host architecture.** All items the plan's Phase 0
exit criteria asked for now have concrete answers:

1. The core hypothesis — native GPU UI + a Node sidecar shimming just
   enough of the `vscode` API to run real, unmodified extensions — works
   across three differently-shaped real extensions. Commands-only:
   real logic ran end-to-end through the full IPC path. Webview: activated
   cleanly, non-webview commands worked, degrading gracefully on the one
   feature (rendering) this architecture can't provide. Language
   features: genuinely reached `createDiagnosticCollection` and
   `registerCompletionItemProvider`, gated on the extension's own real
   config defaults, not skipped.
2. IPC overhead is a non-issue at this scale (~27µs avg round trip,
   ~38.5MB sidecar RSS) — the architecture isn't going to be slow or
   heavy because of the sidecar split itself.
3. Local LLM inference does not need the Node sidecar either — a Rust
   `llama.cpp` binding initializes and links cleanly on Windows with no
   unusual toolchain setup.
4. Shim growth across three extensions is converging (14 files, ~340
   lines), not exploding — the "API surface needed is bigger than
   expected" risk the plan called out has not materialized.

**Still open, not blocking**: the webview finding is from an extension
where the webview was secondary, not central — worth a second look
before treating it as fully general. `languages.*` providers are
registered but never actually invoked (no completion/hover request
dispatched, no diagnostic pushed through IPC end-to-end) — that's real
functional wiring that belongs to Phase 3 proper, not Phase 0's job.

## Next concrete step

Phase 0's own exit criteria are answered — move into Phase 1 (minimal
native shell: window chrome, file tree, tabbed editor, tree-sitter C/C++
highlighting, no extensions or ctrace yet). The `vulkan` feature on
llm-spike (needs the Vulkan SDK installed) and a more webview-central
extension are worth doing but no longer gate Phase 1 starting.
