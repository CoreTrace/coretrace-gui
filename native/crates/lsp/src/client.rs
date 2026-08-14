use std::collections::HashMap;
use std::io::{BufReader, BufWriter};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};

use crate::framing::{read_message, write_message};
use crate::types::{Diagnostic, PublishDiagnosticsParams};

type PendingReplies = Arc<Mutex<HashMap<i64, Sender<Value>>>>;
type DiagnosticsStore = Arc<Mutex<HashMap<String, Vec<Diagnostic>>>>;

/// A general LSP client speaking the standard JSON-RPC-over-stdio wire
/// protocol -- not clangd-specific. Works against any conforming LSP
/// server; which binary to spawn is the caller's decision.
pub struct LspClient {
    child: Child,
    stdin: Mutex<BufWriter<std::process::ChildStdin>>,
    next_id: AtomicI64,
    pending: PendingReplies,
    diagnostics: DiagnosticsStore,
}

impl LspClient {
    /// Spawns `binary` with `args` and starts a background thread that
    /// demultiplexes the server's stdout into request replies (matched
    /// by JSON-RPC id) and `textDocument/publishDiagnostics`
    /// notifications (collected by URI, readable via `diagnostics_for`).
    pub fn spawn(binary: &Path, args: &[&str]) -> std::io::Result<Self> {
        let mut child = Command::new(binary)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;

        let stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");

        let pending: PendingReplies = Arc::new(Mutex::new(HashMap::new()));
        let diagnostics: DiagnosticsStore = Arc::new(Mutex::new(HashMap::new()));

        let reader_pending = pending.clone();
        let reader_diagnostics = diagnostics.clone();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            while let Ok(message) = read_message(&mut reader) {
                dispatch(&message, &reader_pending, &reader_diagnostics);
            }
        });

        Ok(Self {
            child,
            stdin: Mutex::new(BufWriter::new(stdin)),
            next_id: AtomicI64::new(1),
            pending,
            diagnostics,
        })
    }

    /// Sends a JSON-RPC request and blocks (with a timeout) for the
    /// matching reply. `timeout` should be generous -- clangd's own
    /// `initialize` response can take a while on a large project.
    pub fn request(&self, method: &str, params: Value, timeout: Duration) -> std::io::Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = channel();
        self.pending.lock().unwrap().insert(id, tx);

        let message = json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params});
        write_message(&mut *self.stdin.lock().unwrap(), &message)?;

        rx.recv_timeout(timeout).map_err(|_| {
            self.pending.lock().unwrap().remove(&id);
            std::io::Error::new(std::io::ErrorKind::TimedOut, format!("no reply to {method}"))
        })
    }

    pub fn notify(&self, method: &str, params: Value) -> std::io::Result<()> {
        let message = json!({"jsonrpc": "2.0", "method": method, "params": params});
        write_message(&mut *self.stdin.lock().unwrap(), &message)
    }

    pub fn initialize(&self, root_uri: &str) -> std::io::Result<Value> {
        let result = self.request(
            "initialize",
            json!({"processId": std::process::id(), "rootUri": root_uri, "capabilities": {}}),
            Duration::from_secs(10),
        )?;
        self.notify("initialized", json!({}))?;
        Ok(result)
    }

    pub fn did_open(&self, uri: &str, language_id: &str, text: &str) -> std::io::Result<()> {
        self.notify(
            "textDocument/didOpen",
            json!({"textDocument": {"uri": uri, "languageId": language_id, "version": 1, "text": text}}),
        )
    }

    pub fn did_change(&self, uri: &str, version: i64, text: &str) -> std::io::Result<()> {
        self.notify(
            "textDocument/didChange",
            json!({"textDocument": {"uri": uri, "version": version}, "contentChanges": [{"text": text}]}),
        )
    }

    pub fn hover(&self, uri: &str, line: u32, character: u32) -> std::io::Result<Value> {
        self.request(
            "textDocument/hover",
            json!({"textDocument": {"uri": uri}, "position": {"line": line, "character": character}}),
            Duration::from_secs(5),
        )
    }

    pub fn definition(&self, uri: &str, line: u32, character: u32) -> std::io::Result<Value> {
        self.request(
            "textDocument/definition",
            json!({"textDocument": {"uri": uri}, "position": {"line": line, "character": character}}),
            Duration::from_secs(5),
        )
    }

    /// Diagnostics most recently published for `uri`, or empty if none
    /// have arrived yet.
    pub fn diagnostics_for(&self, uri: &str) -> Vec<Diagnostic> {
        self.diagnostics.lock().unwrap().get(uri).cloned().unwrap_or_default()
    }

    pub fn shutdown(&mut self) {
        let _ = self.request("shutdown", Value::Null, Duration::from_secs(2));
        let _ = self.notify("exit", Value::Null);
        let _ = self.child.kill();
    }
}

impl Drop for LspClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

fn dispatch(message: &Value, pending: &PendingReplies, diagnostics: &DiagnosticsStore) {
    if let Some(id) = message.get("id").and_then(Value::as_i64) {
        if let Some(tx) = pending.lock().unwrap().remove(&id) {
            let result = message.get("result").cloned().unwrap_or(Value::Null);
            let _ = tx.send(result);
            return;
        }
    }
    if message.get("method").and_then(Value::as_str) == Some("textDocument/publishDiagnostics") {
        if let Some(params) = message.get("params") {
            if let Ok(parsed) = serde_json::from_value::<PublishDiagnosticsParams>(params.clone()) {
                diagnostics.lock().unwrap().insert(parsed.uri, parsed.diagnostics);
            }
        }
    }
}
