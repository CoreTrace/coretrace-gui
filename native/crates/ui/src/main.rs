mod app;
mod assistant_state;
mod bundled_path;
mod crash_report;
mod diagnostics_state;
mod extensions_state;
mod llm_settings;
mod lsp;
mod lsp_bridge;
mod palette_state;
mod sidecar;
mod sidecar_bridge;
mod session;
mod state;
mod syntax;
mod theme;
mod views;

fn main() {
    app::run();
}
