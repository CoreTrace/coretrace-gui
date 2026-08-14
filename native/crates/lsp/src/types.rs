use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

/// Subset of `textDocument/publishDiagnostics`'s `Diagnostic` -- just
/// what the editor needs to render a marker and a message.
#[derive(Debug, Clone, Deserialize)]
pub struct Diagnostic {
    pub range: Range,
    pub severity: Option<u8>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct PublishDiagnosticsParams {
    pub uri: String,
    pub diagnostics: Vec<Diagnostic>,
}
