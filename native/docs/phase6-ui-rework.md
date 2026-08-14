# UI/UX rework

Not a phase from the original relaunch plan. This is a response to
direct user review of the finished Phase 5 build:

> "The interface UI / UX is terrible, it looks like a mess with buttons
> everywhere, it doesn't have the look of an IDE at all [...] the
> colors are not well chosen like the cursor on text is not visible
> (black blinking cursor on gray background kinda), in searchbox when
> the cursor is on it has like a white hover but the text is white so
> it's not visible, you really need to rework the entire interface
> layout and UI/UX"

with Zed's editor as the reference for what "looks like an IDE" means.

## Root cause of the color bugs: Floem ships a light theme

Both reported color bugs traced to one thing. Floem 0.2 applies a
**light** default theme (`floem::theme::default_theme`) whose rules are
attached to style *classes* -- `ButtonClass`, `TextInputClass`, and so
on. Class rules cascade to descendants and include state rules
(`hover`, `focus`, `active`) that a per-view `.style()` call does not
replace. The Phase 5 theming pass styled individual views, so it lost
to those class rules in exactly the states the user hit:

- **Invisible caret**: the framework default for `CursorColor` is
  `Color::BLACK.multiply_alpha(0.3)` -- black at 30% alpha, which on a
  dark background renders as approximately nothing. This was never
  overridden.
- **Invisible text on hover**: `TextInputClass`'s default `hover` rule
  sets a near-white background, while the app's own styling set light
  text -- so hovering the search box made its contents disappear.

Fixed at the source in `theme/app_style.rs`, which overrides those same
classes once at the root of the view tree. That restyles every button,
input, scrollbar, and tooltip in the app at once, rather than patching
call sites that would keep losing to the class-level state rules.

**Both fixes verified by pixel measurement, not by eye:**

- Hovered search input background measures `RGB(42,47,56)` -- exactly
  the intended `BG_ELEVATED`, not white.
- The editor caret required care to verify, because the caret color
  (`#61AFEF`) is *also* the syntax color for function names, so simply
  finding that color near the cursor proves nothing. Sampling across a
  full blink cycle and looking for columns where the color both appears
  and disappears isolated it: exactly **one** column blinks (the
  caret), while 25 columns hold the color constantly (the word
  `printf`).

The editor gets a solid caret and a separate translucent selection,
because `TextEditor` exposes those as distinct settings. Plain
`text_input` cannot: Floem reads a single `CursorColor` prop for both
its 1px caret and its selection rect, and paints the selection *over*
the text. That constraint is documented at `palette::INPUT_CARET` along
with the ~65% alpha compromise it forces.

## Layout: an actual IDE shell

The old sidebar stacked seven labelled pill buttons in three rows,
which is what made it read as a settings form. Replaced with the
standard arrangement:

```
[rail] [ sidebar panel ] [ tab bar        ]
       [               ] [ editor         ]
[----------- status bar --------------------]
```

- **Activity bar** (`views/activity_bar.rs`): a 48px icon rail with
  tooltips, an accent stripe marking the active view, and click-to-
  collapse on the active icon. Icons are inline SVG
  (`views/icons.rs`) tinted by the inherited text color, so hover
  states re-tint them for free with no per-state icon variants.
- **Panel headers** (`views/widgets.rs`): each panel now opens with a
  small uppercase title and icon actions on the right. This is where
  "Open Folder" and "Run CTrace" moved -- they were large labelled
  buttons occupying panel body space before.
- **Status bar** (`views/status_bar.rs`): ctrace run state, clangd
  availability, and extension-host port. All three were previously
  body text inside panels; they are ambient status, not panel content.
- **Panels** were rewritten for density: two-line search results
  instead of a single run-on line, diagnostics as severity-colored
  cards, the assistant's provider settings collapsed behind a toggle so
  the panel shows the conversation rather than a form.

Editor: monospace font, no soft wrap (Floem defaults to wrapping at
the viewport, which breaks code alignment), plus proper gutter,
current-line, selection, and indent-guide colors.

## Real bugs found and fixed during the rework

1. **Activity bar rendered as an empty strip.** The icons drew nothing
   because SVG's default `stroke` is `none` -- the paths set
   `stroke-width` but never a stroke color. Also needed explicit
   `width`/`height` on the root `<svg>`.
2. **The rail was being squeezed to a few pixels.** Flex children
   shrink by default, and the editor's content can demand more width
   than the window has. Fixed with `flex_shrink(0.0)` and `min_width`
   on the rail and sidebar.
3. **Gutter line numbers replaced by a solid light block.**
   `gutter_current_color` is the *background* of the current line in
   the gutter, not its text color (`gutter_accent_color` is that).
   Passing a light gray painted over the number.
4. **Status bar stuck on "Extensions starting" forever.**
   `SidecarSupervisor::start` returns immediately and fills its port in
   later from its own supervise thread, so reading `port()` once right
   after `start()` always saw `None` and the readiness message was
   never sent. Now polls until the port appears. This also disproved a
   claim in `phase5-status.md`, which has been corrected.
5. **Window opened too small for the layout**, leaving the editor
   narrower than the sidebar. Given a default size and a real title
   ("CoreTrace" rather than "Floem window"). The size is *logical*, so
   it is multiplied by display scaling -- 1100x700 is 1650x1050 at
   150%, about the largest that still fits a 1080p screen.

## Verified

Every panel was opened and screenshotted in the running app: Explorer
(with real files and expand chevrons), Search (a real 237-result query,
with the previously-broken hover state), Diagnostics (a real CTrace run
against a real C file producing two real findings), Extensions,
Commands, and Assistant. The status bar was confirmed to flip from
"starting" to a green dot with the real negotiated port. The active-item
accent stripe was confirmed by pixel probe.

## Second review pass

A follow-up review raised more specific issues. All addressed:

- **Scrollbars too thick.** Floem's default handle is 16px; now 8px and
  rounded, set via `ScrollCustomStyle` in the app theme.
- **Search panel confusing.** Rebuilt as a VSCode-style grouped tree:
  collapsible file headers with the parent folder and a match-count
  badge, matching lines indented beneath with their line numbers.
  Clicking a match jumps to that line rather than opening at the top.
- **Extensions: no description, and Install needed scrolling.** The
  confirm dialog used to be appended *below* the results and the
  installed list, so reaching it meant scrolling past everything.
  Clicking a result now opens a full-panel detail view with
  description, id and version, and the Install action at the top.
- **No feedback when running CTrace.** The real cause was that
  `run_on` ran the WSL round trip *on the UI thread*, so `running` was
  set and cleared within one frame and the UI never repainted in
  between. Moved to a background thread reporting through a channel,
  with a skeleton placeholder while in flight. Extension search and
  install had the identical defect and got the same treatment.
- **Clicking a diagnostic didn't move the cursor.** Editors now
  register themselves by path in `AppState::editors`, and a
  `pending_goto` signal carries jump requests -- routed through a
  signal because the target file may not be open yet. The editor's own
  `ensure_visible` tracks the cursor, so scrolling follows for free.
- **No indicator in the text.** Diagnostic markers are now bold and
  widened: to the enclosing identifier when the reported column lands
  in one, otherwise to the line's trimmed content (ctrace often reports
  column 1, i.e. the indentation, where there is no token to mark).
  `marker_span` is unit tested for both paths.
- **No command palette.** Added, on Ctrl+Shift+P, over files, view
  actions and extension commands, with subsequence fuzzy matching
  (`fuzzy_score`, unit tested) and arrow/Enter navigation.

### Real bugs found in this pass

1. **Stack overflow that killed the process.** Remounting the analyzed
   tab when results arrive was done in an effect that called
   `close_tab`/`open_file` -- which *read* `open_tabs` as well as
   writing it. A tracked read inside an effect that writes the same
   signal makes the effect retrigger itself forever. Caught by the app
   dying silently (a stack overflow aborts without running the panic
   hook, so no crash log). Fixed by wrapping the body in `untrack`.
2. **Markers never appeared after a run.** An editor computes its
   styling once at mount. With analysis now asynchronous, results
   arrive after mount, so the old "close and reopen the tab" trick
   (which ran immediately after kicking off the run) rebuilt the editor
   *before* there was anything to show. The remount now happens when
   results land.
3. **Any code-less extension crashed the loader.** `loadExtension`
   treated `main` as mandatory, so themes, TextMate grammars, snippets
   and extension packs failed with an opaque `paths[1] must be of type
   string` from `path.resolve`. They now load as inactive with a stated
   reason. Found because a real installed extension
   (`KylinIdeTeam.kylin-cpp-pack`) hit it.
4. **Palette opened without focus.** Keystrokes still went to the
   editor, so typing filtered nothing and silently edited the file
   behind the overlay. Fixed with `request_focus`. (No file was
   damaged -- the editor only writes on Ctrl+S.)
5. **The palette shortcut never fired.** The editor consumes key events
   before they reach the shell, so the shortcut is now also recognized
   in the editor's own key handler.

### Are syntax-highlighting extensions compatible?

**No, and they can't be without new work.** VSCode syntax extensions
ship TextMate grammars as declarative data under
`contributes.grammars`. This host only reads
`contributes.configuration` (verified in `extension-host/src/`), and
the editor highlights with tree-sitter, which cannot consume a
TextMate grammar. So installing one of those succeeds and it now loads
cleanly as "inactive", but it contributes no highlighting.

Supporting them means adding a TextMate engine (e.g. the `syntect`
crate) alongside tree-sitter, reading `contributes.grammars` from
installed extensions, and choosing between the two per language. That
is a real feature, not a fix -- flagged here rather than silently
half-done.

Extension *packs* are also unhandled: `extensionPack` lists other
extensions to pull in, and nothing expands it, so installing a pack
installs only the pack itself.

## Known gaps

- No horizontal scrollbar affordance in the editor now that wrapping is
  off -- content scrolls, but the framework's scroll view is doing the
  work and this wasn't explicitly styled or tested for long lines.
- The activity bar's tooltips are the only labelling; there's no
  keyboard shortcut hint in them yet.
- Panel widths are fixed (260px); no drag-to-resize splitter.
- The assistant's provider picker cycles on click rather than opening a
  dropdown, because Floem's dropdown renders its own light-themed popup
  list that would need separate class-level restyling.
- Accessibility is unchanged and still absent -- see
  `native/packaging/README.md`. None of this rework improves screen
  reader support, because Floem 0.2 has no accessibility tree at all.
