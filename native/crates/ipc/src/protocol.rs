use serde::{Deserialize, Serialize};

/// Message sent from the native core to the extension-host sidecar.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum HostRequest {
    Ping,
    InvokeCommand { command: String, args: Vec<serde_json::Value> },
}

/// Message sent from the extension-host sidecar back to the native core.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum HostResponse {
    Pong,
    CommandResult { command: String, result: serde_json::Value },
    Error { message: String },
}
