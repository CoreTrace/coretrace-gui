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

## Not done yet (do not treat Phase 0 as closed until these land)

- **No real VSCode extension has been loaded.** The sidecar currently
  runs one hand-written stub command, not an actual unmodified `.vsix`
  extension. This is the actual Phase 0 exit bar per the plan — proving
  IPC plumbing works is a prerequisite, not the goal itself.
- No `vscode` API shim exists at all yet (no `vscode.commands`,
  `vscode.window`, etc.) — needed before any real extension's code can
  even load without throwing on `require('vscode')`.
- Transport is TCP loopback for spike convenience; latency/overhead
  numbers have not been measured yet (the plan's exit criteria asks for
  concrete IPC round-trip latency and sidecar memory overhead numbers).
- Rust `llama.cpp` binding viability (the other Phase 0 spike item, for
  local-model LLM support) has not been investigated at all yet.
- Sidecar is started manually (`node src/index.js`); no process
  supervision/spawn-from-Rust/crash-recovery yet.

## Next concrete step

Pick one small, real, unmodified VSCode extension (a formatter or
syntax-only extension, not something LSP-heavy) and get it to load inside
the Node sidecar against a minimal `vscode` shim — that is what actually
answers the Phase 0 go/no-go question.
