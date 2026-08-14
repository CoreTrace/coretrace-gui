//! Loading skeletons with a shimmer that travels left to right.
//!
//! Floem's `Style` has no clip/overflow property, so the usual trick --
//! a bright strip sliding behind a clipping mask -- isn't available,
//! and gradient brushes don't interpolate between keyframes (only
//! solid colors do). Instead each bar is a row of adjacent cells that
//! share one animation, with each cell's bright moment offset along
//! the keyframe timeline. The highlight therefore sweeps across the
//! bar, using only solid-color interpolation.

use floem::peniko::Color;
use floem::prelude::*;
use floem::unit::DurationUnitExt;
use floem::views::Decorators;

const CELLS: usize = 14;
const SWEEP_MS: u64 = 1100;
/// How much of the timeline a single cell stays lit. Wider looks like a
/// soft gradient; narrower like a hard edge.
const HIGHLIGHT_SPREAD: f64 = 18.0;

fn base() -> Color {
    Color::rgb8(0x2A, 0x2F, 0x38)
}

fn highlight() -> Color {
    Color::rgb8(0x3D, 0x44, 0x51)
}

/// One shimmering bar, `width_pct` wide relative to its container.
pub fn shimmer_bar(width_pct: f64, height: f64) -> impl IntoView {
    let cells: Vec<usize> = (0..CELLS).collect();
    h_stack((dyn_stack(move || cells.clone(), |i: &usize| *i, move |i| cell(i, height).into_any())
        .style(move |s| s.flex_row().width_full().height(height)),))
    .style(move |s| {
        s.width_pct(width_pct)
            .height(height)
            .border_radius(3.0)
            .background(base())
    })
}

fn cell(index: usize, height: f64) -> impl IntoView {
    // Position of this cell's peak along the 0-100 keyframe timeline.
    let peak = (index as f64 / (CELLS - 1) as f64) * 100.0;
    let lead = (peak - HIGHLIGHT_SPREAD).max(0.0);
    let trail = (peak + HIGHLIGHT_SPREAD).min(100.0);

    empty()
        .style(move |s| s.flex_grow(1.0).height(height).background(base()))
        .animation(move |a| {
            a.duration(SWEEP_MS.millis())
                .repeat(true)
                .keyframe(0, |f| f.style(move |s| s.background(base())))
                .keyframe(lead as u16, |f| f.style(move |s| s.background(base())))
                .keyframe(peak as u16, |f| f.style(move |s| s.background(highlight())))
                .keyframe(trail as u16, |f| f.style(move |s| s.background(base())))
                .keyframe(100, |f| f.style(move |s| s.background(base())))
        })
}

/// A skeleton standing in for one diagnostic card.
pub fn skeleton_card() -> impl IntoView {
    v_stack((
        shimmer_bar(45.0, 10.0),
        shimmer_bar(92.0, 9.0),
        shimmer_bar(70.0, 9.0),
    ))
    .style(|s| {
        s.width_full()
            .flex_col()
            .row_gap(7.0)
            .padding_horiz(12.0)
            .padding_vert(10.0)
    })
}
