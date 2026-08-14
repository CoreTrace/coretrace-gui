//! Small shared building blocks, so panels stay consistent instead of
//! each one inventing its own spacing, hover treatment, and header.

use floem::prelude::*;
use floem::views::{svg, Decorators};

use crate::theme;

/// A borderless icon action, for panel headers and row affordances.
/// Deliberately not a `button()` -- a full button chrome (border,
/// background, padding) is what made the old sidebar look like a form.
pub fn icon_button(icon: String, tip: &'static str, on_click: impl Fn() + 'static) -> impl IntoView {
    svg(icon)
        .style(|s| s.size(15.0, 15.0))
        .container()
        .on_click_stop(move |_| on_click())
        .style(|s| {
            s.size(24.0, 22.0)
                .items_center()
                .justify_center()
                .border_radius(4.0)
                .color(theme::TEXT_MUTED)
                .hover(|s| s.color(theme::TEXT_BRIGHT).background(theme::HOVER))
        })
        .tooltip(move || tip.to_string())
}

/// The header strip every sidebar panel starts with: a small uppercase
/// title on the left, optional icon actions on the right. This is where
/// panel-level commands ("Open Folder", "Run CTrace") now live, instead
/// of as large labelled buttons stacked in the panel body.
pub fn panel_header(title: &'static str, actions: impl IntoView + 'static) -> impl IntoView {
    h_stack((
        label(move || title.to_string()).style(|s| {
            s.color(theme::TEXT_MUTED)
                .font_size(11.0)
                .font_weight(floem::text::Weight::SEMIBOLD)
        }),
        empty().style(|s| s.flex_grow(1.0)),
        actions,
    ))
    .style(|s| {
        s.width_full()
            .height(35.0)
            .items_center()
            .padding_left(12.0)
            .padding_right(6.0)
            .column_gap(2.0)
    })
}

/// A section label inside a panel body (e.g. "INSTALLED"), lighter
/// weight than a panel header so the hierarchy stays readable.
pub fn section_label(text: impl Into<String>) -> impl IntoView {
    let text = text.into();
    label(move || text.clone()).style(|s| {
        s.color(theme::TEXT_MUTED)
            .font_size(11.0)
            .font_weight(floem::text::Weight::SEMIBOLD)
            .padding_horiz(12.0)
            .padding_top(10.0)
            .padding_bottom(4.0)
    })
}

/// Centered muted text for "nothing here yet" states.
pub fn empty_state(text: impl Into<String>) -> impl IntoView {
    let text = text.into();
    label(move || text.clone())
        .style(|s| s.color(theme::TEXT_MUTED).font_size(12.0).padding(12.0).width_full())
}
