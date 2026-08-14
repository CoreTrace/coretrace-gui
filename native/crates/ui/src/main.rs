mod app;
mod assistant_state;
mod diagnostics_state;
mod extensions_state;
mod llm_settings;
mod lsp;
mod lsp_bridge;
mod sidecar;
mod sidecar_bridge;
mod state;
mod syntax;
mod views;

fn main() {
    app::run();
}
