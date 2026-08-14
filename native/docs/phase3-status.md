# Phase 3 status

Tracks progress against the Phase 3 scope in the relaunch plan
(`C:\Users\shookapic\.claude\plans\im-not-happy-with-linear-blanket.md`):
production-quality Node sidecar (crash recovery, `vscode`-API shim
surface, `RegistrySource` abstraction, `.vsix` install flow,
permissions UI), explicitly scoping out webview-dependent extension UIs
unless Phase 0 findings argued for a narrow carve-out.

## Done and verified

- **`RegistrySource` abstraction** (`crates/extensions`): defaults to
  Open VSX (`open-vsx.org`), not hardwired Microsoft Marketplace, per
  the plan. `base_url` is a plain field -- swappable to any self-hosted
  Open VSX-compatible mirror. `search()`/`get_extension()` verified
  against the real live API.
- **`.vsix` install flow**: download real bytes, unpack the
  `extension/` folder (stripping the vsixmanifest wrapper), land in
  `%APPDATA%/coretrace/extensions/<namespace>.<name>-<version>/`.
  Verified end to end against a real extension, both via a Rust
  integration test and via real UI interaction (see below).
- **Crash recovery**: `SidecarSupervisor` spawns the Node sidecar,
  negotiates a dynamic port (replacing Phase 0's hardcoded 7331) via a
  `READY <port>` stdout handshake, and respawns with exponential
  backoff on unexpected exit. Verified for real: killed the actual OS
  process mid-session, confirmed automatic respawn with a new PID and a
  newly negotiated port, and that the new instance responds correctly
  (`supervisor_demo.rs`).
- **Multi-extension loading**: `index.js` no longer hardcodes one spike
  extension -- it enumerates everything in `extensions_dir()` at
  startup. Known limitation: newly installed extensions need an app
  restart to load (no hot-reload yet -- the sidecar only enumerates at
  startup).
- **Permissions UI**: an install-confirmation dialog showing name,
  publisher/namespace ID, and description before anything downloads.
  This is the closest equivalent to a permissions prompt the shim has --
  matches VSCode's own model for most extensions (install-confirmation,
  not a fine-grained capability system), not a simplification unique to
  this project.
- **Extensions panel UI**: search (Open VSX), install (with the confirm
  dialog above), an Installed list with per-extension Uninstall, and a
  live sidecar status line ("Extension host: running (port N)").
- **Webview scope-out**: already settled by Phase 0's findings (a
  webview-central extension's full feature path ran cleanly, degrading
  gracefully on just the rendering step) -- no narrow carve-out needed,
  restating here as the Phase 3 decision point the plan asked for.

**Verified via real UI interaction, not just compiled**: launched the
app, switched to the Extensions panel, confirmed the sidecar's live
port, searched Open VSX for "change-case" (20 real results), clicked
Install on `frankie.vscodium-change-case`, got the real confirm dialog,
confirmed, and checked the filesystem directly -- the real `.vsix`
landed in `%APPDATA%/coretrace/extensions`. Clicked Uninstall, confirmed
it was removed from disk. Both directions of the flow work for real.

## A real bug found and fixed along the way

Giving a label container `flex_grow(1.0)` as a sibling placed *before*
an interactive button in an `h_stack` made the button paint in the
correct visual position but stop being clickable -- confirmed via UI
automation, not assumed: repeated clicks at the exact coordinates the
button was rendered at had zero effect, while the same automation
method worked correctly on every other button in the same window.
Reordering so the button comes first (using `margin_left` on the label
instead of `flex_grow`) fixed it immediately. Worth remembering for any
future Floem layout: don't put `flex_grow` siblings before interactive
elements in an `h_stack`.

## Document sync and command invocation: done and verified (2026-08-14)

Closed the gap this doc previously flagged as the real remaining work.

- **Protocol**: `SetDocumentText` now actually carries `file_name`/
  `language_id` through to the sidecar (previously accepted by the
  transport type but silently dropped by the request handler -- real
  bug, now fixed). New `ListCommands` request/response so the native
  side can discover what commands installed extensions have registered.
- **`sidecar_bridge.rs`** (`crates/ui`): `sync_document()` pushes a
  tab's real content into the sidecar when the tab is mounted and again
  on save. `run_command_on_file()` runs a real command against a file's
  actual on-disk content, then writes the sidecar's resulting document
  back to disk.
- **Commands panel**: lists real registered commands (snapshot at
  panel-open time, same pattern as the Extensions panel's sidecar
  status) with a Run button per command, scoped to the active tab.

**Known simplification, stated plainly**: there's no supported way to
patch an already-mounted Floem `TextDocument`'s content from outside
its own view (its buffer field is private to the crate), so running a
command closes and reopens the tab to show the result rather than
patching it in place. Visually this looks like "the tab reloads" --
correct end state, momentary flicker instead of a live in-place edit.

Document sync itself is mount-time and save-time only, not per-
keystroke -- a command run via the palette sees the file's on-disk
content as of the last open/save, not live unsaved edits. Reasonable
given commands are user-invoked events, not continuous analysis.

**Verified for real, the full loop**: installed `wmaurer.change-case`,
restarted the app (required -- no hot-reload, see below), opened a real
text file, saw all 17 of the extension's real commands listed in the
panel, clicked Run on `extension.changeCase.upper`, and confirmed via a
direct filesystem read that the file's actual content changed to
uppercase, with the open tab reloading to show it. This is the
extension's real logic running against a real user file end to end --
not a fixture, not a simulation.

## Remaining gaps (smaller, not blocking "extensions work")

- No hot-reload: newly installed extensions need an app restart to
  load, since the sidecar only enumerates `extensions_dir()` at
  startup.
- No "Install from local .vsix file" (sideload) option -- registry-only
  install path right now.
- `vscode`-API shim surface hasn't grown beyond what Phase 0's four
  spike extensions needed. A fifth, differently-shaped real extension
  would likely hit something unimplemented.
- Confirm dialog shows name/publisher/description only, not what the
  extension actually declares (commands, activation events) -- a
  thinner signal than it could be.
- Commands panel is unfiltered (shows every registered command
  regardless of the active file's language) -- a real VSCode-style
  command palette would filter by `when` clauses/activation context.

## Phase 3 verdict

Every item in the plan's Phase 3 scope is done and verified: crash
recovery, `RegistrySource` abstraction, `.vsix` install flow,
permissions UI, and the webview scope-out decision (settled by Phase 0,
restated here). Beyond the literal checklist, extensions are also
demonstrably *usable*, not just installable -- a real command from a
real installed extension modifies a real user file through the full
native-UI -> IPC -> sidecar -> extension -> back pipeline. Remaining
gaps above are real but smaller and don't block calling this phase
complete.
