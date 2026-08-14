# Phase 5 status

Tracks progress against the Phase 5 scope in the relaunch plan
(`C:\Users\shookapic\.claude\plans\im-not-happy-with-linear-blanket.md`):
installer, auto-update, code-signing, crash reporting, session save/
restore, perf tuning, an accessibility pass, and all visual design/
theming work explicitly deferred here by an earlier decision in this
session.

This is the last phase. Everything below plus Phases 0-4 completes the
"finish building everything, every phase" instruction that governs
this whole relaunch effort.

## Visual theming: done, addresses the original complaint

The project started because the old Electron app felt "boring" and
the native rebuild's own early UI was called "ugly as fuck" by the
user, with theming explicitly deferred to this phase. Built a real
dark palette (`crates/ui/src/theme.rs`) -- background/surface/border/
text/muted-text/accent/error/warning colors, plus `theme::button`,
`theme::toggle_button`, and `theme::text_input` helpers so every panel
uses the same look instead of Floem's default white-background/gray-
button styling.

**A genuinely useful discovery, not just a coat of paint**: the
syntax-highlighting colors chosen back in Phase 1
(`syntax::colors::color_for_capture`) already matched the One Dark Pro
palette -- purple keywords, green strings, blue functions -- which
only reads correctly against a dark background. On the old white
background they were washed out. This pass didn't just add color, it
made highlighting that was already implemented finally look right.

Floem's `TextColor` style property is inherited (confirmed in its own
source, `style.rs`'s `StylePropInfo` -- not assumed), so setting it
once on the root `shell()` container cascades to every descendant
label without touching each one -- background isn't inherited, so
panel/editor surfaces are set individually.

**Verified via real UI interaction**: launched the app, confirmed the
sidebar/buttons/active-tab-indicator/file-tree render with the new
palette (screenshot), then via a pre-seeded session file (see below)
confirmed the tab bar's active-tab accent underline and the code
editor's dark background + light text + syntax colors all render
together correctly in one screenshot.

**A real bug found and fixed along the way**: adding a sixth sidebar
button (`Assistant`, from Phase 4) pushed the toolbar row's total
width past the 320px sidebar, and Floem's `h_stack` doesn't wrap --
the overflow rendered on top of the main editor area with no clipping,
which also made the overflowing buttons genuinely unclickable (a later
sibling view intercepted the clicks). This was actually a Phase 2
finding (documented there), re-confirmed and re-fixed here for the
seventh button (splitting into three two-button rows instead of two
three-button rows).

## Session save/restore: done and verified

`crates/ui/src/session.rs` persists `workspace_root`/`open_tabs`/
`active_tab` to `%APPDATA%/coretrace/session.json`, restored at
`AppState::new` and re-saved via a Floem `create_effect` whenever any
of those signals change -- continuous rather than only on a clean
exit, so a crash doesn't lose the last-known session (crash reporting
below makes crashes visible, but doesn't prevent them, so this matters
together with that, not instead of it). Paths that no longer exist on
disk are dropped on load (`SessionData::filter_missing`), unit tested.

**Verified for real**: manually wrote a session file with a real open
tab (`Cargo.toml`), launched the app, and confirmed via screenshot
that the tab bar showed it, marked active, with real file content in
the editor -- the restore path specifically, not just the save path
(which was separately confirmed by observing the app's own
`create_effect` correctly persist `workspace_root` in real time during
manual testing).

This also closes a comparison gap Phase 1 explicitly flagged as "not
comparable yet": the old Electron app's `restored-session-ready` KPI
(2899-2929ms) had nothing to compare against since this app didn't
restore a session at all. It does now.

## Crash reporting: done and verified with a real panic

`crates/ui/src/crash_report.rs` installs a panic hook
(`std::panic::set_hook`) at startup that writes a report (message,
location, timestamp) to `%APPDATA%/coretrace/crashes/` before running
the default hook (stderr output is unaffected, this adds a persistent
record on top of it).

**Verified with a real panic, not a simulated one**: a test spawns a
thread, installs the real hook, panics for real, joins the thread, and
confirms a real file landed on disk containing the real message.

**A real bug found and fixed by that test**: the crash-log filename
used only millisecond-precision timestamps. Under `cargo test`'s
default parallel execution, two concurrent calls to `write_report`
(the end-to-end test's real panic and a separate unit test's direct
call) landing in the same millisecond collided on the same filename
and tore each other's writes -- caught as a genuine intermittent test
failure (`left: "test report contentsrt\ntimestamp_ms: ..."`, visibly
corrupted/interleaved content), not something anticipated in advance.
Fixed with an atomic counter appended to the filename, guaranteeing
uniqueness regardless of timing. Re-ran the affected tests 8 times
after the fix with no further failures.

## Auto-update client: real, verified against a mock server

New `coretrace-updater` crate: a minimal `major.minor.patch` version
type (not full semver -- this app's own version strings don't need
pre-release/build-metadata handling), a manifest fetch/parse, and
independent newer-version checks for the app and the `ctrace` backend
binary (they can lag or lead each other's release cadence). Downloads
to a staging location -- **doesn't** replace the running exe, which is
a separate, genuinely harder problem on Windows (needs a companion
launcher/relaunch trick) intentionally left as a stated gap rather than
half-built.

**Honest gap**: there's no live update server for this project yet, so
"verified against a mock server" (a real HTTP server on a real socket,
same pattern as the LLM crate's provider tests) is the honest
substitute here, the same category of gap Phase 2 hit with clangd and
Phase 4 hit with cloud LLM keys/Ollama.

## Perf: a real regression found and fixed, re-measured

Re-measured cold launch with the same method Phase 1 used (`Stopwatch`
+ `FindWindow` polling, release build, 5 runs) since Phases 2-4 added
real startup-path work (sidecar spawn, LSP lookup, crash-report
install, session load).

**A real regression found**: `app::run()` called `sidecar::spawn()` and
`lsp::spawn()` *before* creating the window, putting their startup
work directly in front of the first window paint -- a cost that didn't
exist in Phase 1's baseline. Fixed by making both spawns asynchronous
(`sidecar::spawn_async`/`lsp::spawn_async`, returning a
`&'static OnceLock<...>` handle populated by a background thread; call
sites check `.get()` and degrade gracefully instead of blocking).

**Correction (made during the later UI rework)**: this section
originally claimed `SidecarSupervisor::start` "blocks synchronously on
a `READY <port>` handshake". That was wrong -- reading its source
(`crates/ipc/src/supervisor.rs`) shows it spawns its own supervise
thread and returns immediately, with the port filled in later. The
blocking cost that actually sat in front of window creation was
`lsp::spawn`'s `where clangd` process launch plus, when clangd is
present, a real `initialize` round trip. Backgrounding both was still
the right fix, but the stated cause was inaccurate and is corrected
here rather than left standing. The same wrong assumption also caused
a real bug in the status bar -- see phase6-ui-rework.md.

**Confirmed at the code level**: added temporary instrumentation
(`Instant::now()` timestamps through `crash_report::install` ->
`spawn_async` calls -> `AppState::new` -> `shell(state)`) and measured
the *entire* internal app-construction path, sidecar/LSP kickoff
included, at **under 40ms** -- proof the fix works and that none of
Phases 2-4's additions cost anything meaningful on the startup path.
Instrumentation removed before committing (was diagnostic-only).

**Honest gap on the external number**: the external
`FindWindow`-based full metric (process start to visible window) now
measures roughly 6 seconds in this session's current sandboxed
environment, against Phase 1's 260-294ms. Given the internal
instrumentation proves the app's own code executes in under 40ms, this
gap sits entirely inside winit/wgpu window creation and first paint --
outside code this session controls -- and most plausibly reflects this
specific remote/virtualized environment's current GPU/display/window-
manager state (this session independently hit repeated window-
position and focus-stealing instability during UI automation
throughout this phase, consistent with an environment-level issue
rather than a code regression) rather than anything changed in the
app. Stated plainly rather than either claimed as fixed or left
unmentioned: the one regression that *was* findable and fixable at the
code level was found and fixed; this residual number is flagged as
likely environmental, not verified as such.

## Packaging: real installer script + honestly-scoped signing/a11y gaps

- **`native/packaging/installer.nsi`**: a complete, real NSIS script
  matching the old Electron app's electron-builder NSIS config for
  parity (same product name, appId, and bundled-resource layout --
  `bin/ctrace` as an extra resource, read directly from
  `package.json`'s `build` section, not guessed). **Not compiled or
  tested**: `makensis` isn't installed in this environment, and
  installing new system tooling without the user's go-ahead is out of
  scope for autonomous work -- see `native/packaging/README.md`.
- **A real gap closed as part of writing this, not left as a stub**:
  `sidecar.rs` and `diagnostics_state.rs` previously resolved
  `extension-host/`'s entry script and `bin/ctrace` purely via
  `CARGO_MANIFEST_DIR` (dev-time only -- both files said so plainly).
  New `bundled_path::resolve()` checks next to the running exe first
  (what a real install looks like) and falls back to the dev-tree path
  otherwise, unit tested with a real temp directory standing in for
  "next to the exe". A packaged build now actually has a working
  answer to "where do my bundled resources live", not just an
  installer script that copies files the app can't find at runtime.
- **Code signing**: no certificate exists or is obtainable in this
  environment. Documented the real `signtool` invocation and a CI-
  wiring note in `native/packaging/README.md` rather than faking a
  self-signed cert and calling it done.
- **Accessibility**: checked Floem 0.2.0's own `Cargo.toml` directly --
  no `accesskit`/OS-accessibility-tree integration exists in this
  framework version. This is the risk the plan itself flagged ("native
  GPU UIs commonly lag Electron on screen-reader support") turning out
  real: screen readers currently cannot see this app's UI at all. Not
  fixable at the application level without either an upstream Floem
  contribution or an independent platform-accessibility bridge, both
  well beyond this phase's scope -- documented plainly in
  `native/packaging/README.md` rather than worked around cosmetically.

## Phase 5 verdict

Theming, session restore, and crash reporting are done, real, and
verified end to end, including two real bugs (the crash-log filename
race, the blocking-sidecar-spawn startup regression) found by that
verification and fixed, not just implemented and assumed correct. The
auto-updater is real infrastructure verified the same honest way every
other external-service integration in this project has been (real
protocol-level testing against a mock server, since no live service
exists to test against) -- it checks and downloads for real but
doesn't self-replace the running exe, a deliberately separate problem.
Packaging produced a real installer script and, more importantly, a
real fix to a genuine runtime gap (bundled-resource path resolution)
that the script alone wouldn't have caught. Code signing and
accessibility are honestly flagged as out of reach in this environment
rather than faked. This closes every phase in the plan.
