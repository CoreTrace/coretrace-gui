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
- **GPU offload verified for real, on real hardware (2026-08-14)**:
  installed the Vulkan SDK (`winget install KhronosGroup.VulkanSDK`,
  user-approved since it's a system-wide install outside the repo), then
  did two *clean* rebuilds (`cargo clean -p llama-cpp-sys-4 -p
  llama-cpp-4 -p coretrace-llm-spike` between them, no cache ambiguity)
  for a real comparison:
  - **Default features (no `vulkan`)**: `n_devices=0`, every layer
    explicitly logged as `assigned to device CPU`.
  - **`--features llama-cpp-4/vulkan`**: `ggml_vulkan` enumerates 2 real
    physical devices on this machine -- `NVIDIA GeForce RTX 4070 Laptop
    GPU` and `AMD Radeon(TM) 610M` -- and with `with_n_gpu_layers(u32::MAX)`
    requested, all 5 of the test model's layers are logged `dev = Vulkan0`
    (KV cache and compute buffers both on Vulkan0, not CPU).
  - Both builds ran the *same* real tokenize -> decode -> greedy-sample ->
    detokenize loop (`crates/llm-spike/src/main.rs`, mirroring
    `llama-cpp-4`'s own `tests/test_integration.rs` pattern) against a
    real ~1.2MB GGUF (`stories260K.gguf`, llama.cpp's own tiny CI test
    model -- see `test-models/README.md`) and produced identical correct
    output: `"Once upon a time" -> ", there was a little girl named Lily.
    She loved to play"`.
  - This is not a CUDA-only story: Vulkan works across NVIDIA/AMD/Intel
    without a vendor-specific SDK for end users at *runtime* (only this
    build machine needed the SDK, to compile the backend in) -- the
    right GPU backend choice for a general Windows install target,
    confirming the earlier reasoning.
- **Conclusion for the plan's "hybrid, resolve in Phase 0" open item on
  local LLM support**: fully resolved. A Rust `llama.cpp` binding is
  viable with GPU offload comparable to `node-llama-cpp`, verified on
  real GPU hardware, not just claimed from Cargo feature flags existing.
  Recommend dropping the Node sidecar dependency for local-model
  inference entirely and using this crate natively.

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

## Fourth extension: the webview-CENTRAL case answered (2026-08-14)

Tried [`janisdd.vscode-edit-csv`](https://open-vsx.org/extension/janisdd/vscode-edit-csv)
0.11.9 — a real, 250K+ download extension whose entire purpose is a
Handsontable CSV table editor in a webview panel, no non-webview
fallback feature. Full account in
`extension-host/spike-extension-webview-central/README.md`; summary:

- **The whole core feature path runs to completion, not just
  `activate()`.** With a fake active `.csv` editor set, invoking the
  real `edit-csv.edit` command drives the extension through reading its
  full ~50-key config schema, calling the (stubbed) real
  `window.createWebviewPanel`, reading its own real HTML/CSS/JS assets
  from disk via `context.extensionPath`, and assigning a genuine
  **46.7KB** real HTML document to `panel.webview.html` — confirmed by
  instrumentation, not assumed.
- Required growing the shim with `vscode.Uri` (incl. `.with()`),
  `vscode.ViewColumn`, `vscode.RelativePattern`,
  `workspace.asRelativePath`, `workspace.createFileSystemWatcher` (stub),
  `window.createWebviewPanel` (stub panel with writable
  `webview.html`/`postMessage`/`onDidReceiveMessage`), and
  `context.extensionPath`/`extensionUri`.
- **This is the strongest version of the plan's flagged webview risk,
  and the architecture survives it cleanly**: nothing crashes past the
  point a missing rendering surface should cause. The only actually
  missing piece is *some* surface to hand the generated HTML to — a
  fully contained, precisely-scoped limitation, not a reason to reject
  webview-central extensions outright.
- All four extensions re-verified together afterward — no regressions
  from the shared shim changes (`Uri`/`document.fileName` additions
  didn't disturb change-case's Range/Selection-based editing).

Total shim growth across all four extensions: 19 small files, roughly
430 lines. Still converging, not exploding.

## Not done yet (small, non-blocking gaps — Phase 3's job, not Phase 0's)

- `languages.*` providers (`registerCompletionItemProvider`,
  `registerHoverProvider`) are registration stubs — no completion/hover
  request has actually been dispatched through one yet, since that needs
  a real document-sync + provider-invocation path this spike doesn't
  build. Same for diagnostic computation: the collection is created for
  real, but nothing has pushed a real `Diagnostic` into it end-to-end
  through IPC the way `real_extension.rs` does for change-case's
  document mutation.
- `window.createWebviewPanel`'s stub never actually renders anything —
  proven safe to leave inert (see above), but the product decision of
  *whether* to eventually add a narrow rendering surface for it is still
  open (plan's Key Risks section).
- ~~Latency/memory numbers~~ **done, see `phase0-measurements.md`.**
- ~~Rust `llama.cpp` binding viability, including GPU offload~~ **done, see above.**
- Sidecar is started manually (`node src/index.js`); no process
  supervision/spawn-from-Rust/crash-recovery yet.
- `fakeEditorState` is a single global mutable document/editor, not a
  real per-file synced buffer — fine for this proof, not representative
  of Phase 3's actual document-sync design.

## Go/no-go verdict — FINAL

**GO on the extension-host architecture.** Every item the plan's Phase 0
exit criteria asked for, plus every follow-up this status doc itself
raised, now has a concrete answer:

1. The core hypothesis — native GPU UI + a Node sidecar shimming just
   enough of the `vscode` API to run real, unmodified extensions — works
   across **four** differently-shaped real extensions: commands-only (ran
   real logic end-to-end through the full IPC path), webview-secondary
   (activated cleanly, non-webview features worked), language-features
   (genuinely reached `createDiagnosticCollection`/
   `registerCompletionItemProvider`, gated on real config), and
   **webview-central** (entire feature path ran to completion, including
   generating a real 46.7KB HTML document — the strongest version of the
   plan's flagged webview risk, survived cleanly).
2. IPC overhead is a non-issue at this scale (~27µs avg round trip,
   ~38.5MB sidecar RSS).
3. Local LLM inference does not need the Node sidecar — a Rust
   `llama.cpp` binding links cleanly on Windows, **and GPU offload is
   verified on real hardware**: a clean build with the `vulkan` feature
   put all layers of a real model on `Vulkan0`, correctly enumerating
   this machine's actual NVIDIA RTX 4070 and AMD Radeon 610M, and ran a
   real generate loop with output identical to the CPU build.
4. Shim growth across four extensions is converging (19 files, ~430
   lines), not exploding.

**No items remain open from either the plan's original exit criteria or
this status doc's own follow-up list that block starting Phase 1.**
Remaining gaps (`languages.*` providers never actually invoked with a
real request, no rendering surface for webviews) are real Phase 3 work,
correctly out of scope for a de-risking spike.

## Next concrete step

Phase 0 is complete. Start Phase 1: minimal native shell — window
chrome, file tree, tabbed native editor with tree-sitter C/C++
highlighting, open/save/create/delete/rename/search-in-files. No LSP, no
extensions, no ctrace yet. Exit criteria (per the plan): cold launch and
typing latency clearly beat the current Electron app's 2.9s/Monaco-tax
baseline on real Windows 11 hardware.
