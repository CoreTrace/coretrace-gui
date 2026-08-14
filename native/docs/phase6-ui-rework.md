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
