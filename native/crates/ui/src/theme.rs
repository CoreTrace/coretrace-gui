use floem::peniko::Color;
use floem::prelude::*;
use floem::views::Decorators;

/// Dark palette, chosen deliberately over the framework's white-background
/// default: `syntax::colors` already used One Dark Pro-style hues
/// (purple keywords, green strings, blue functions) that only read
/// correctly against a dark surface -- on the previous default white
/// background they looked washed out, which was part of the "boring/
/// ugly" feedback this pass addresses. Deferred here from Phase 1/3 by
/// explicit earlier decision (see native/docs/phase1-status.md).
pub const BG: Color = Color::rgb8(0x14, 0x16, 0x1B);
pub const BG_ELEVATED: Color = Color::rgb8(0x1B, 0x1E, 0x26);
pub const BG_SURFACE: Color = Color::rgb8(0x21, 0x24, 0x2F);
pub const BORDER: Color = Color::rgb8(0x2A, 0x2E, 0x3A);
pub const TEXT: Color = Color::rgb8(0xE4, 0xE6, 0xEB);
pub const TEXT_MUTED: Color = Color::rgb8(0x8B, 0x92, 0xA5);
/// The one distinguishing accent color -- used sparingly (active
/// selection, focus rings) so it stays a signal, not wallpaper.
pub const ACCENT: Color = Color::rgb8(0x22, 0xD3, 0xEE);
pub const ERROR: Color = Color::rgb8(0xE0, 0x6C, 0x75);
pub const WARNING: Color = Color::rgb8(0xE5, 0xA0, 0x3B);

/// Same severity->color mapping as `syntax::colors::color_for_severity`
/// (kept in sync deliberately, not shared, since one is UI chrome and
/// the other is an editor-internal styling concern) -- for coloring a
/// diagnostic's summary line in the Diagnostics panel.
pub fn color_for_severity(severity: &str) -> Color {
    match severity.to_ascii_uppercase().as_str() {
        "ERROR" => ERROR,
        "WARNING" => WARNING,
        _ => ACCENT,
    }
}

pub const BUTTON_BG: Color = Color::rgb8(0x23, 0x27, 0x33);
pub const BUTTON_BG_HOVER: Color = Color::rgb8(0x2E, 0x33, 0x41);
pub const BUTTON_BG_ACTIVE: Color = Color::rgba8(0x22, 0xD3, 0xEE, 0x33);

/// A `button()` styled with the app's palette instead of Floem's
/// default gray-on-white -- use this everywhere a themed button is
/// wanted rather than repeating the same `.style()` block per call
/// site.
pub fn button(label: impl Into<String>) -> floem::views::Button {
    let text = label.into();
    button_view(floem::views::label(move || text.clone()))
}

/// Same styling as `button`, for call sites that need a custom child
/// view (e.g. a reactive label) instead of a plain string.
pub fn button_view(child: impl IntoView + 'static) -> floem::views::Button {
    floem::views::button(child).style(|s| {
        s.background(BUTTON_BG)
            .color(TEXT)
            .border(1.0)
            .border_color(BORDER)
            .border_radius(6.0)
            .padding_horiz(10.0)
            .padding_vert(5.0)
            .hover(|s| s.background(BUTTON_BG_HOVER))
    })
}

/// A `text_input()` styled to match the dark palette instead of the
/// framework's default white field.
pub fn text_input(value: RwSignal<String>) -> floem::views::TextInput {
    floem::views::text_input(value).style(|s| {
        s.background(BG_SURFACE)
            .color(TEXT)
            .border(1.0)
            .border_color(BORDER)
            .border_radius(4.0)
            .padding(6.0)
            .focus(|s| s.border_color(ACCENT))
    })
}

/// Same as `button`, plus an accent highlight while `active` is true --
/// for toggle-style buttons like the sidebar's mode switcher.
pub fn toggle_button(label: impl Into<String>, active: impl Fn() -> bool + 'static) -> floem::views::Button {
    let text = label.into();
    floem::views::button(floem::views::label(move || text.clone())).style(move |s| {
        s.background(if active() { BUTTON_BG_ACTIVE } else { BUTTON_BG })
            .color(TEXT)
            .border(1.0)
            .border_color(if active() { ACCENT } else { BORDER })
            .border_radius(6.0)
            .padding_horiz(10.0)
            .padding_vert(5.0)
            .hover(|s| s.background(BUTTON_BG_HOVER))
    })
}
