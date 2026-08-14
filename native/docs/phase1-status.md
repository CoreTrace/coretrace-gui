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

## Not verified yet

- Tree-sitter syntax highlighting not implemented yet (`Styling` impl is
  still Floem's default `SimpleStyling`).
- No create/delete/rename UI yet (the `core` functions exist and are
  unit-tested, but nothing in the shell calls them).
- No search-in-files UI yet (same -- `core::search_in_files` exists,
  unwired).
- No cold-launch/typing-latency measurement yet -- the actual Phase 1
  exit criteria.

## Next concrete steps

1. Tree-sitter `Styling` impl for C/C++ (the other half of the plan's
   editor requirement).
2. Wire create/delete/rename into the file tree UI (context menu or
   similar) and search-in-files into a UI panel.
3. Cold-launch and typing-latency measurement against the current
   Electron app's 2.9s baseline -- the actual exit criteria, not yet
   attempted.
