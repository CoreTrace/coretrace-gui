mod app;
mod diagnostics_state;
mod extensions_state;
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
