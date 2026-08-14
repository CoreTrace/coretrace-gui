# Phase 2 status

Tracks progress against the Phase 2 scope in the relaunch plan
(`C:\Users\shookapic\.claude\plans\im-not-happy-with-linear-blanket.md`):
native WSL detect, ctrace process management, SARIF/CTrace-format
parsing, inline/gutter diagnostics, a visualizer panel equivalent, and
a clangd LSP client.

An earlier session explicitly said "skip phase 2, don't care about
WSL" -- superseded by the later, controlling instruction to finish
every remaining phase autonomously. Resolved by building real ctrace
execution (WSL and the real binary are actually available and
verifiable on this machine) while not spending effort on an elaborate
WSL-install-wizard onboarding flow (the specific thing "don't care
about WSL" was about).

## Done and verified

- **`coretrace-ctrace` crate** (new, `native/crates/ctrace`): pure
  logic, no UI dependency, same pattern as `coretrace-core`.
  - `wsl::wsl_available()` / `wsl::to_wsl_path()` -- Windows-path to
    `/mnt/c/...` conversion, unit tested.
  - `json_extract::extract_json_objects()` -- brace-balanced scan
    (respects string literals/escapes) over `ctrace`'s mixed
    log-lines + JSON stdout, ports the *behavior* of the old
    Electron app's `extractJsonFromText`, not its code. Unit tested,
    including the "braces inside a string" edge case.
  - `run::run_static_analysis()` -- spawns
    `wsl.exe -e bash -lc "'<bin>' --input='<file>' --static --sarif-format"`
    (the simpler one-shot CLI mode, not the old app's persistent
    HTTP-server mode), extracts every balanced JSON object from
    stdout, and picks the one whose `meta.tool` is
    `"ctrace-stack-analyzer"`.
  - `diagnostic::AnalysisResult` -- typed `{meta, functions,
    diagnostics}`, matching the real JSON shape observed from the
    real binary (not guessed from docs).
- **Real end-to-end verified against the actual binary**, not a
  fixture: `cargo run --example run_real` in the `ctrace` crate runs
  `bin/ctrace` via WSL against a real temp C file with an
  uninitialized-variable bug and prints the real parsed diagnostic
  (`UninitializedLocalRead`, CWE-457, line 1 col 26).
- **`--static` alone runs the full default tool suite** (ikos,
  flawfinder, tscancode, IKOS, plus the stack analyzer) -- no
  `--invoke` flag needed. Confirmed by direct experimentation, not
  assumed from the old app's argument-building code.
- **UI wiring** (`crates/ui`):
  - `DiagnosticsState` (`diagnostics_state.rs`): `running`,
    `last_run_file`, `result`, `error` signals; `run_on(file)` calls
    `run_static_analysis` synchronously (a UI-button-triggered,
    roughly one-second WSL round trip -- not a hot path, so no
    justification yet for wiring up an async executor); `diagnostics_for(file)`
    filters the result to one file, matched by file name (`ctrace`
    reports the WSL-side `/mnt/c/...` path, not the original Windows
    path, so a full-path comparison would never match).
  - New `SidebarMode::Diagnostics` + `diagnostics_panel` view: a "Run
    CTrace" button targeting the active tab, live running/target
    status, and a list of real diagnostics (severity, rule ID, CWE,
    location, message).
  - **Inline markers in the editor**: `TreeSitterStyling::with_diagnostics`
    converts each diagnostic's 1-based (line, column) to a byte span
    and colors it by severity (orange for warning, red for error),
    applied *after* the tree-sitter syntax spans so it visibly wins.
    This is the practical equivalent of a squiggly underline --
    `cosmic-text` 0.12 (the text-shaping crate this Floem version
    uses) has no underline field on `Attrs`, so "recolor the exact
    span" is the real option, not a corner cut.
  - Same tab-reopen pattern already established for the Commands
    panel (Phase 3): there's no supported way to patch an
    already-mounted `TextDocument`'s content or styling from outside
    its own view, so running an analysis closes and reopens the
    active tab to force a remount with the new diagnostics baked into
    its styling.

**Verified via real UI interaction, not just compiled**: launched the
app, opened a real file with a real bug, switched to the Diagnostics
panel, clicked Run CTrace, and confirmed both the panel (real
`UninitializedLocalRead`/CWE-457 finding, matching what the standalone
example printed) and the inline marker -- read back the exact pixel
color (`229,160,59`, i.e. `#E5A03B`, the warning color) at the
diagnostic's reported column in a screenshot, not just eyeballed it.

## A real bug found and fixed along the way

The sidebar's button row (`Open Folder`/`Files`/`Search`/`Extensions`/
`Commands`, now plus `Diagnostics`) is laid out in a fixed-width
320px sidebar. Floem's `h_stack` doesn't wrap, so six buttons
overflowed past the sidebar's width and rendered on top of the main
editor area with no clipping -- which also meant the overflowing
buttons became genuinely unclickable in practice, since the tab bar
(a later sibling, drawn after the sidebar) intercepted clicks at that
same screen position. Confirmed via UI automation: clicks at the
`Diagnostics` button's visible coordinates had no effect until this
was fixed. Fixed by splitting the button row into two explicit rows
(three buttons each) -- a functional overflow fix, not a design
change, so it doesn't cross the line into the visual-design work
deferred to Phase 5.

## Known simplifications, stated plainly

- `run_on` blocks the UI thread for the duration of the WSL round
  trip (roughly one second for a single small file). Acceptable for
  a button-triggered one-shot analysis; would need revisiting if
  large files make this noticeably slower.
- Diagnostics are matched to a file by file name only, not full path
  -- if a workspace ever has two same-named files in different
  directories, this would conflate them. Not a real risk for typical
  single-file-focus usage, but worth noting.
- Diagnostic column offsets are treated as character counts (ASCII
  assumption). `ctrace`'s own column numbers come from parsing C/C++
  source, which is overwhelmingly ASCII in practice, but a
  multi-byte-UTF8 identifier at the exact diagnostic column would
  compute a slightly wrong span.
- No SARIF-format parsing -- the stack analyzer's own JSON is richer
  (function-level stack info, CWE, confidence) than the SARIF blobs
  the other tools emit (which were empty in every real run observed),
  so it's the only source parsed. If a future tool run produces real
  SARIF results, that's unparsed today.
- No "visualizer panel" beyond the diagnostics list itself -- the old
  app's visualizer was a richer, separate view; this phase treats the
  diagnostics panel as the equivalent, scoped down.

## Not yet done

- **clangd LSP client**: not started. Substantial remaining work --
  spawn `clangd`, JSON-RPC over stdio, diagnostics-as-you-type,
  hover, go-to-definition, wired into the editor. Tracked as the next
  piece of Phase 2.
- WSL-not-installed UX (install prompts, distro checks) -- explicitly
  out of scope per the "don't care about WSL" instruction; WSL is
  simply assumed present, matching this dev machine's real state. If
  `wsl_available()` returns false, `run_static_analysis` returns
  `CtraceError::WslUnavailable`, surfaced as an error string in the
  panel -- no onboarding flow beyond that.
