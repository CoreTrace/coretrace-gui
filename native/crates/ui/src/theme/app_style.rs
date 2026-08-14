use floem::style::{CursorStyle, Style};
use floem::views::{scroll, ButtonClass, PlaceholderTextClass, TextInputClass, TooltipClass};

use super::palette::*;

/// The app's dark theme, applied once at the root of the view tree.
///
/// This exists because Floem 0.2 ships a **light** default theme
/// (`floem::theme::default_theme`) whose rules are attached to style
/// *classes* -- `ButtonClass`, `TextInputClass`, and so on. Class rules
/// cascade to descendants, and they include state rules (`hover`,
/// `focus`, `active`) that a per-view `.style()` call does not replace.
///
/// That mismatch caused two real, user-visible bugs:
///
/// 1. Text inputs kept the default theme's near-white `hover`
///    background while our own styling set light text on them -- so
///    hovering the search box made its text invisible.
/// 2. The caret was invisible everywhere, because the framework's
///    default `CursorColor` is black at 30% alpha, which is what a
///    dark background renders as approximately nothing.
///
/// Overriding the same classes here fixes both at the source, for every
/// widget at once, instead of patching each call site and still losing
/// to the class-level state rules.
pub fn app_theme() -> Style {
    Style::new()
        .color(TEXT)
        .font_size(13.0)
        .class(ButtonClass, |s| {
            s.background(BG_ELEVATED)
                .color(TEXT)
                .border(1.0)
                .border_color(BORDER)
                .border_radius(5.0)
                .padding_horiz(9.0)
                .padding_vert(4.0)
                .hover(|s| s.background(ACTIVE).color(TEXT_BRIGHT))
                .active(|s| s.background(SELECTED).border_color(ACCENT))
                .focus(|s| s.border_color(ACCENT).hover(|s| s.background(ACTIVE)))
                .disabled(|s| s.background(BG_SIDEBAR).color(TEXT_MUTED).border_color(BORDER))
        })
        .class(TextInputClass, |s| {
            s.background(BG_EDITOR)
                .color(TEXT)
                .cursor_color(floem::peniko::Brush::Solid(INPUT_CARET))
                .border(1.0)
                .border_color(BORDER)
                .border_radius(5.0)
                .padding_horiz(7.0)
                .padding_vert(5.0)
                .cursor(CursorStyle::Text)
                // Every state keeps a dark background. The default
                // theme lightened these toward white on hover/focus,
                // which is what made light text disappear.
                .hover(|s| s.background(BG_ELEVATED).border_color(ACTIVE))
                .focus(|s| s.background(BG_ELEVATED).border_color(ACCENT).hover(|s| s.background(BG_ELEVATED)))
                .disabled(|s| s.background(BG_SIDEBAR).color(TEXT_MUTED))
        })
        // The default is ~12% alpha gray -- effectively invisible.
        .class(PlaceholderTextClass, |s| s.color(TEXT_MUTED).font_size(13.0))
        .class(scroll::Handle, |s| {
            s.background(BORDER)
                .border_radius(4.0)
                .hover(|s| s.background(ACTIVE))
                .active(|s| s.background(TEXT_MUTED))
        })
        .class(scroll::Track, |s| {
            s.background(floem::peniko::Color::TRANSPARENT)
                .hover(|s| s.background(floem::peniko::Color::rgba8(0xFF, 0xFF, 0xFF, 0x08)))
        })
        // The activity bar is icon-only, so its tooltips are how the
        // icons are discoverable at all -- worth styling properly
        // rather than leaving as the default light-on-light box.
        .class(TooltipClass, |s| {
            s.background(BG_ELEVATED)
                .color(TEXT_BRIGHT)
                .border(1.0)
                .border_color(BORDER)
                .border_radius(5.0)
                .padding_horiz(8.0)
                .padding_vert(4.0)
                .margin(6.0)
                .font_size(12.0)
        })
}
