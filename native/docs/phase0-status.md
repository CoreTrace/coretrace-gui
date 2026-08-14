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

## Not done yet (do not treat Phase 0 as closed until these land)

- Only one extension, and only the API surface it happens to touch, has
  been proven. No language-server-shaped extension, no extension that
  needs `vscode.languages.*`, `DiagnosticCollection`, or
  `vscode.window.createWebviewPanel` has been tried — the webview case in
  particular is the one flagged as a possible permanent product
  limitation in the plan, still unverified either way.
- Transport is TCP loopback for spike convenience; latency/overhead
  numbers have not been measured yet (the plan's exit criteria asks for
  concrete IPC round-trip latency and sidecar memory overhead numbers).
- Rust `llama.cpp` binding viability (the other Phase 0 spike item, for
  local-model LLM support) has not been investigated at all yet.
- Sidecar is started manually (`node src/index.js`); no process
  supervision/spawn-from-Rust/crash-recovery yet.
- `fakeEditorState` is a single global mutable document/editor, not a
  real per-file synced buffer — fine for this proof, not representative
  of Phase 3's actual document-sync design.

## Next concrete step

Try a second, differently-shaped real extension (something that needs
`vscode.languages.registerHoverProvider` or a `DiagnosticCollection`, not
just commands) to see how much the shim's surface has to grow, then take
the latency/memory measurements the plan's exit criteria actually asks
for.
