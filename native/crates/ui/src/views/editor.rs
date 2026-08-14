use std::path::PathBuf;

use floem::keyboard::{Key, Modifiers};
use floem::prelude::*;
use floem::views::editor::command::CommandExecuted;
use floem::views::editor::keypress::default_key_handler;
use floem::views::editor::keypress::key::KeyInput;
use floem::views::editor::keypress::press::KeyPress;
use floem::views::text_editor::text_editor_keys;
use floem::views::Decorators;

use coretrace_core::{read_file, write_file};

use crate::lsp_bridge::{file_uri, notify_open};
use crate::sidecar_bridge::sync_document;
use crate::state::{AppState, OpenTab};
use crate::syntax::TreeSitterStyling;
use crate::theme;

pub fn editor_area(state: AppState) -> impl IntoView {
    dyn_container(
        move || state.open_tabs.with(|tabs| tabs.is_empty()),
        move |is_empty| {
            if is_empty {
                label(|| "Select a file to start editing".to_string())
                    .style(|s| s.color(theme::TEXT_MUTED).font_size(13.0))
                    .container()
                    .style(|s| s.size_full().items_center().justify_center())
                    .into_any()
            } else {
                tabs_stack(state).into_any()
            }
        },
    )
    .style(|s| s.width_full().flex_grow(1.0).min_height(0.0).background(theme::BG_EDITOR))
}

fn tabs_stack(state: AppState) -> impl IntoView {
    dyn_stack(
        move || state.open_tabs.get(),
        |tab: &OpenTab| tab.path.clone(),
        move |tab| single_editor(tab.path, state).into_any(),
    )
    .style(|s| s.width_full().height_full())
}

fn is_save_shortcut(keypress: &KeyPress, modifiers: Modifiers) -> bool {
    modifiers.contains(Modifiers::CONTROL)
        && matches!(&keypress.key, KeyInput::Keyboard(Key::Character(c), _) if c.eq_ignore_ascii_case("s"))
}

fn single_editor(path: PathBuf, state: AppState) -> impl IntoView {
    let content = read_file(&path).unwrap_or_default();
    let diagnostics = state.diagnostics.diagnostics_for(&path);
    let lsp_client = state.lsp_client();
    if let Some(client) = lsp_client {
        notify_open(client, &path, &content);
    }
    let lsp_diagnostics = lsp_client.map(|c| c.diagnostics_for(&file_uri(&path))).unwrap_or_default();
    let styling = TreeSitterStyling::with_diagnostics(&path, &content, &diagnostics, &lsp_diagnostics);
    let save_path = path.clone();
    let visible_path = path.clone();

    // Mount-time sync only (see sidecar_bridge::sync_document's doc
    // comment) -- an extension command run via the palette sees this
    // tab's content as of when it was opened, not live unsaved edits.
    sync_document(state.extensions.sidecar, &path, &content);

    let editor = text_editor_keys(content, move |editor_sig, keypress, modifiers| {
        if is_save_shortcut(keypress, modifiers) {
            let text = editor_sig.get_untracked().doc().text().to_string();
            let _ = write_file(&save_path, &text);
            sync_document(state.extensions.sidecar, &save_path, &text);
            CommandExecuted::Yes
        } else {
            default_key_handler(editor_sig)(keypress, modifiers)
        }
    })
    .styling(styling)
    // Unlike `text_input` (which reads one shared prop for both), the
    // code editor exposes caret and selection separately -- so the
    // caret can be solid and obvious while the selection stays a
    // translucent tint that keeps the text under it readable.
    .editor_style(|s| {
        // Code editors don't soft-wrap by default -- wrapping breaks
        // the column alignment that makes indented code readable, and
        // Floem's default is `EditorWidth` (wrap at the viewport).
        s.wrap_method(floem::views::editor::text::WrapMethod::None)
            .cursor_color(theme::EDITOR_CARET)
            .selection_color(theme::EDITOR_SELECTION)
            .current_line_color(theme::EDITOR_CURRENT_LINE)
            .indent_guide_color(theme::EDITOR_INDENT_GUIDE)
            .indent_guide(true)
            .gutter_dim_color(theme::GUTTER_DIM)
            .gutter_accent_color(theme::GUTTER_ACTIVE_TEXT)
            .gutter_current_color(theme::GUTTER_CURRENT_BG)
            .gutter_left_padding(14.0)
            .gutter_right_padding(14.0)
    });

    editor.style(move |s| {
        s.width_full()
            .height_full()
            .background(theme::BG_EDITOR)
            .color(theme::TEXT)
            // Code needs a monospace face to line up; the UI font the
            // rest of the app inherits is proportional.
            .font_family("Cascadia Mono, Consolas, Courier New, monospace".to_string())
            .font_size(13.0)
            .apply_if(
                state.active_tab.get().as_deref() != Some(visible_path.as_path()),
                |s| s.hide(),
            )
    })
}
