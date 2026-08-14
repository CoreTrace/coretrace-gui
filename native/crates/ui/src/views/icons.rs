//! Inline monochrome SVG icons.
//!
//! Floem's `svg` view tints whatever it renders with the inherited
//! `color` style prop (see its `SvgStyle`/`TextColor` handling), so
//! these are stroke-only shapes with no baked-in color -- an icon
//! inside a hovered row re-tints with that row's text color for free,
//! no per-state icon variants needed.
//!
//! Kept inline as `&str` rather than loaded from asset files so there's
//! nothing extra to bundle at install time (see native/packaging/).

// `width`/`height` and an explicit `stroke` are both load-bearing.
// SVG's default stroke is `none`, so paths with only `stroke-width` set
// draw nothing at all -- the first version of these icons rendered as
// an empty strip in the activity bar for exactly that reason. The
// concrete stroke color here is just a placeholder that Floem's svg
// view re-tints with the inherited text color at paint time.
// (`r##"..."##`: the color literal contains `"#`, which would close a
// single-hash raw string.)
const HEAD: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">"##;

fn icon(body: &str) -> String {
    format!("{HEAD}{body}</svg>")
}

pub fn files() -> String {
    icon(r#"<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>"#)
}

pub fn search() -> String {
    icon(r#"<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.35-4.35"/>"#)
}

pub fn extensions() -> String {
    icon(r#"<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/>"#)
}

pub fn commands() -> String {
    icon(r#"<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>"#)
}

pub fn diagnostics() -> String {
    icon(r#"<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>"#)
}

pub fn assistant() -> String {
    icon(r#"<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>"#)
}

pub fn folder_open() -> String {
    icon(r#"<path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1"/><path d="M3 9h18l-2 9a2 2 0 0 1-2 1.6H5A2 2 0 0 1 3 18z"/>"#)
}

pub fn play() -> String {
    icon(r#"<path d="M6 4l14 8-14 8z"/>"#)
}

pub fn close() -> String {
    icon(r#"<path d="M6 6l12 12M18 6L6 18"/>"#)
}

pub fn chevron_right() -> String {
    icon(r#"<path d="M9 5l7 7-7 7"/>"#)
}

pub fn chevron_down() -> String {
    icon(r#"<path d="M5 9l7 7 7-7"/>"#)
}

pub fn file_generic() -> String {
    icon(r#"<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>"#)
}
