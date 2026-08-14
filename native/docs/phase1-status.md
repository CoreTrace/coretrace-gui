# Phase 1 status

Tracks progress against the Phase 1 exit criteria in the relaunch plan
(`C:\Users\shookapic\.claude\plans\im-not-happy-with-linear-blanket.md`):
window chrome, file tree, tabbed native editor with tree-sitter C/C++
highlighting, open/save/create/delete/rename/search-in-files, no LSP/
extensions/ctrace yet. Exit criteria: cold launch and typing latency
clearly beat the current Electron app's 2.9s/Monaco-tax baseline.

## Architecture note: Floem ships more than the plan assumed

The plan (written before this crate was inspected closely) assumed
"Floem doesn't ship a full code-editor widget out of the box... cursor/
selection, IME, large-file scroll perf all need real engineering." That
was overly pessimistic. Floem actually bundles a real editor stack --
`floem-editor-core` (rope buffer, cursor, selection, movement, indent)
and `floem::views::editor`/`text_editor` (gutter, keypress handling,
a `Styling` trait for per-line attribute styling) -- because Floem is
built by the Lapce team and this *is* Lapce's own editor core, extracted
into a reusable crate. Phase 1's editor work is implementing a
tree-sitter-backed `Styling` impl and wiring open/save, not building a
text-editing widget from zero.

## Done

- **`crates/core`**: pure-logic crate (no UI dependency) for
  `scan_directory` (lazy, non-recursive, dirs-first-then-alphabetical),
  file ops (`read_file`/`write_file`/`create_file`/`create_dir`/
  `delete_path`/`rename_path`), and `search_in_files` (depth- and
  result-capped, skips `.git`/`node_modules`/`target`/etc). Unit tested.
- **Real window shell** (`crates/ui`): sidebar with an "Open Folder"
  button (native dialog via `rfd`) and a real, clickable, lazily-expanding
  file tree backed by `scan_directory`; a tab bar; an editor area.
  Reactive state (`AppState`, all `RwSignal`-based, `Copy`) tracks
  workspace root, expanded directories, open tabs, and the active tab.
- **Tabbed editor**: each opened file gets its own `floem::text_editor`
  instance, mounted once via a keyed `dyn_stack` (not torn down and
  rebuilt on tab switch, so in-progress edits survive switching tabs)
  and shown/hidden via reactive `.style()` based on the active-tab
  signal -- not naive dyn_container swapping, which would have silently
  discarded unsaved edits every time you switched away from a tab.
- **Save**: `Ctrl+S` intercepted via `text_editor_keys`'s custom key
  handler (falls through to Floem's `default_key_handler` for everything
  else), writes the buffer to disk via `core::write_file`.
- Builds clean, zero warnings.

## Verified, and how

- **Compiles clean** against the real Floem 0.2.0 API (verified by
  reading the crate's own source for `dyn_container`/`dyn_stack`/
  `Styling`/`text_editor_keys` signatures before writing code against
  them, not guessed) -- first successful build, no iteration needed.
- **Renders correctly with real data**: launched the built exe, took an
  actual screenshot. The file tree genuinely reflects the real `native/`
  directory contents (`crates`, `docs`, `extension-host`, `target`,
  `.gitignore`, `Cargo.lock`, `Cargo.toml`), correctly sorted
  directories-first-then-alphabetical, with expand-triangle vs bullet
  icons distinguishing dirs from files. The editor area correctly shows
  the empty-state placeholder with no tabs open.
- **Stays alive, no panic**: ran for several seconds under automated
  screenshot/interaction attempts with a clean log (no crash output).

## Click interactivity: verified (2026-08-14, after fixing the test harness)

Confirmed the DPI theory above: the real display is 2560x1440, but the
first `powershell.exe` test process wasn't per-monitor-DPI-aware, so
`Screen.Bounds` reported a virtualized `1707x960` (matches 1920x1080
scaled ~1.5x) -- coordinates read off that screenshot didn't correspond
to the physical pixels `SendInput` operates in. Fixed by calling
`SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)`
before touching any screen coordinates, confirmed `Screen.Bounds` then
correctly reported `2560x1440`, and re-tested:

- Clicking the "crates" row in the file tree expanded it and showed its
  real subdirectories (`core`, `ipc`, `llm-spike`, `ui`) -- confirms
  click handling, the `expanded_dirs` reactive signal, and the lazy
  re-scan-on-expand all work end-to-end.
- Clicking `Cargo.toml` opened a real tab (title + close button in the
  tab bar) and the editor pane rendered the actual file content with a
  working line-number gutter and word wrap -- confirms the full
  file-tree-click -> `open_file()` -> tab creation -> `text_editor`
  render path works, not just that the window paints.

This was a test-harness bug (DPI awareness), not an app defect --
recorded here so the debugging path is available if the same class of
issue resurfaces.

## Tree-sitter C/C++ highlighting: done and verified (2026-08-14)

`crates/ui/src/syntax/` implements `Styling` (`highlighter.rs`) backed by
`tree-sitter`/`tree-sitter-c`/`tree-sitter-cpp`. Language picked by file
extension (`language.rs`); each grammar's own bundled `HIGHLIGHT_QUERY`
(the standard `queries/highlights.scm` every tree-sitter grammar ships)
is run via `tree_sitter::Query`/`QueryCursor`, and capture names
(`keyword`, `string`, `comment`, `function`, `number`, etc.) map to
colors (`colors.rs`). Parsed once against the document's initial content
at editor-open time -- **known limitation, not a bug**: highlighting
does not live-update as you type, since there's no incremental reparse
yet (that's LSP/Phase-2-adjacent territory, out of Phase 1's scope).

**Verified with a real screenshot**, not assumed: wrote a real `.c` file
with an include, a comment, a function, string literals, and calls,
opened it in the running app. Correctly colored: `#include`/keywords in
purple, the comment in gray, `add`/`main`/`printf` function names in
blue, string literals in green, numbers in tan -- a real, correct parse
and highlight, not a placeholder.

## Create/delete/rename: done and verified (2026-08-14)

Right-click any file tree row for a native OS context menu (`.context_menu()`
+ `floem::menu::Menu`): New File / New Folder (inside a directory row, or
alongside a file row) / Rename / Delete. New/Rename show an inline
`text_input` in place of the row (confirm via Enter, Escape, or ✓/✕
buttons), calling straight into `coretrace_core`'s already-unit-tested
`create_file`/`create_dir`/`rename_path`/`delete_path`. A `tree_version`
counter signal (bumped after every mutation) is what makes the tree
re-scan and show the change -- `dyn_stack`'s scan closure otherwise has
no reactive dependency on the filesystem itself.

**Verified for real, not assumed**: right-clicked `docs`, New File,
typed `test-created.txt`, confirmed -- `Get-ChildItem` on the real
`native/docs/` directory showed the file actually created on disk, and
the tree UI showed it immediately. Right-clicked it, Delete -- gone from
disk and from the tree. Rename shares the identical `edit_row`/`confirm`
code path already proven by create, not separately click-tested.

## Cold launch: measured, beats baseline decisively (2026-08-14)

Built `--release` (debug numbers wouldn't be a fair comparison to
Electron's packaged-build baseline). Measured process-start-to-window-
created time with a native C# `Stopwatch` + `FindWindow` polling loop
(no PowerShell-interpreter-loop overhead, which the first attempt at
this fell into and produced worthless numbers) over 5 runs:

| run | ms |
|---|---|
| 1 | 293.8 |
| 2 | 260.6 |
| 3 | 261.8 |
| 4 | 268.2 |
| 5 | 264.9 |

**~270ms average, ~260-294ms range.**

This is directly comparable to specific milestones in the Electron
app's own `docs/startup-performance-report.md`, not an apples-to-oranges
number invented for this comparison:

| milestone | Electron (optimized) | CoreTrace native |
|---|---|---|
| `BrowserWindow created` | 371-397ms | **~270ms avg (beats it even here)** |
| `ready-to-show` (window visible to user) | 2637-2645ms | **~270ms avg -- ~10x faster** |
| `restored-session-ready` (full KPI) | 2899-2929ms | not comparable -- no session restore exists yet (Phase 2+) |

The fair, honest claim: **time-to-visible-window is roughly 10x faster
than Electron's own `ready-to-show` milestone**, and beats even
Electron's earliest `BrowserWindow created` milestone before Electron
has loaded any renderer content. The `restored-session-ready` headline
number (2.9s) isn't a fair comparison yet since this app doesn't restore
a session at all -- that requires Phase 2+ work.

## Typing latency: NOT measured -- a real, documented gap

Attempted to measure this by creating a file, opening it, and
programmatically typing into the editor via Win32 `SendInput`, timing
the round trip. **The synthetic keystrokes never reached the editor**,
across three different injection methods tried in order:

1. `SendKeys.SendWait` -- known-unreliable for non-owned foreground
   windows, ruled out first.
2. `SendInput` with `KEYEVENTF_UNICODE` (bypasses keyboard layout,
   sends characters directly).
3. `SendInput` with real VK-codes (0x41/0x42/0x43 for A/B/C) -- the most
   standard, hardware-indistinguishable method.

All three failed silently: no characters appeared, no error. Confirmed
the window genuinely held OS foreground focus throughout
(`GetForegroundWindow()` returned the exact `coretrace-ui` window
handle). The same exact click-then-inject methodology worked perfectly
for every *other* interactive element tested this session: buttons,
file tree rows, context menu items, and -- critically -- the simpler
`floem::views::text_input` widget used for inline rename/create (real
typed text landed there and was confirmed via `Get-ChildItem`, see
above). Only the main code editor (`floem::views::text_editor`, backed
by Lapce's `Editor`/`editor_container_view`) didn't receive synthetic
keyboard input.

**This points at something specific to how the editor widget acquires
internal logical focus** (distinct from OS window focus, which was
confirmed present) -- possibly requiring an event sequence or IME
initialization step that a mouse click alone doesn't trigger, that only
genuine hardware input naturally provides. This was not resolved this
session. **Do not treat typing as verified working** on the strength of
"it compiles and the click handlers are wired" -- it needs either manual
verification by a human at a real keyboard, or further investigation
into `floem::views::editor`'s focus-acquisition path (possibly an
explicit `request_focus()` call needed on click, since `text_editor()`'s
`editor_container_view` may not do this automatically the way it does in
Lapce's own app shell, which has additional focus-coordination code
around it).

## Not verified yet

- No search-in-files UI yet (`core::search_in_files` exists, unit-tested,
  unwired to any UI panel).
- Typing latency (see above -- blocked on the focus issue, not just
  "not yet attempted").

## Next concrete steps

1. **Resolve the editor keyboard-focus issue** -- this blocks calling
   Phase 1 done, since "typing latency clearly beats baseline" is the
   plan's literal exit criteria and typing hasn't been confirmed to work
   via automation at all (manual human keyboard testing would sidestep
   this, but hasn't happened either, since this session has been
   automation-only).
2. Search-in-files UI panel.
3. Once typing is confirmed working, get a real typing-latency number
   (needs either resolving the automation gap above, or a different
   measurement approach that doesn't depend on synthetic input reaching
   the editor).
