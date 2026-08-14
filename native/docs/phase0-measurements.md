# Phase 0 measurements

Concrete numbers the plan's Phase 0 exit criteria asks for. Taken
2026-08-14 on the dev machine this was built on (Windows 11), debug
builds of everything, sidecar had `wmaurer.change-case` loaded (see
`phase0-status.md`). Not a benchmark-grade methodology -- single machine,
single run, debug (unoptimized) Rust binaries -- but good enough to sanity
check the architecture isn't fundamentally too slow or heavy before
investing further.

## IPC round-trip latency

`cargo run --example bench -p coretrace-ipc`, 500 pings over the TCP
loopback transport after a 20-iteration warmup:

| stat | value |
|---|---|
| min | 21.3µs |
| avg | 27.4µs |
| p50 | 23.7µs |
| p99 | 90.3µs |
| max | 287.5µs |

Sub-30µs average, comfortably under a millisecond even at p99. Not a
concern for interactive extension commands (typing-latency budgets are
usually tens of milliseconds). This is a debug build measuring `ping`
specifically (no command dispatch or document mutation in the hot path);
`invoke_command` against `extension.changeCase.camel` will cost more
(real JS execution, document mutation) but that cost is inherent to
running the extension's own logic, not the transport.

## Sidecar memory footprint

`tasklist` working-set for `node.exe` after the sidecar loaded the real
extension and served 500+ requests: **~38.5 MB**. Idle-state ballpark
for a bare Node process running one small extension -- expect this to
grow once a real `vscode` API surface (diagnostics, language features)
and more/larger extensions are loaded; worth re-measuring once a
second, heavier extension is tried.

## Caveats / not measured yet

- Debug builds throughout -- release numbers will be different (likely
  better for Rust, similar for the interpreted Node side).
- TCP loopback only, per-message JSON parse/serialize included in the
  numbers -- the plan calls for eventually moving to a named pipe /
  Unix-domain-socket transport before Phase 3; expect this to shift
  numbers slightly, not fundamentally.
- Single extension loaded. No numbers yet for many extensions active
  simultaneously, or for an extension exercising a heavier API surface
  (language features, diagnostics).
- No cold-start timing taken for the sidecar itself (`node src/index.js`
  process spawn + extension `activate()` time) -- relevant for the "does
  extension loading add to app startup" question the current Electron
  app's `startup-performance-report.md` cares about.
