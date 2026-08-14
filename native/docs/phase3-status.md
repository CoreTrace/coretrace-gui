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

## Not done (real gap, not just unstarted -- read before assuming extensions are "done")

**Installed extensions can't actually be used yet.** Install/uninstall
work end to end, but there's no way to invoke an installed extension's
commands against the user's real open file:

- The sidecar's document state (`fakeEditorState.js`) is still the
  single global fake document from Phase 0 -- it is not synced to
  whatever file is actually open in the native editor. An installed
  extension's command would run against stale/fake content, not the
  user's real buffer.
- There's no command palette or other UI to invoke an installed
  extension's registered commands at all.

This wasn't literally itemized in the plan's Phase 3 bullet list
(crash recovery / shim surface / registry / install flow / permissions
UI), but it's the difference between "extensions can be installed" and
"extensions actually do anything" -- worth treating as required before
calling the extension system meaningfully complete, not deferred
indefinitely.

Other gaps:
- No "Install from local .vsix file" (sideload) option -- registry-only
  install path right now.
- `vscode`-API shim surface hasn't grown beyond what Phase 0's four
  spike extensions needed. A fifth, differently-shaped real extension
  would likely hit something unimplemented.
- Confirm dialog shows name/publisher/description only, not what the
  extension actually declares (commands, activation events) -- a
  thinner signal than it could be.

## Next concrete step

Wire real document sync between the native editor's open tabs and the
sidecar's `fakeEditorState`, plus a minimal command-invocation UI (even
just a simple command list/palette scoped to the active file's
language) -- that's what turns "extensions install" into "extensions
work."
