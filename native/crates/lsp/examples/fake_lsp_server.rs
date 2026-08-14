// A minimal, protocol-accurate LSP server used only to test LspClient
// against a real subprocess speaking the real wire framing -- clangd
// isn't installed on this dev machine (verified: not on PATH, not in
// WSL), so this is what "verified for real" means for this crate: the
// client's framing/dispatch/correlation logic, not clangd's own
// semantics. See native/docs/phase2-status.md for the honest account.
use std::io::{stdin, stdout, BufReader};

use serde_json::{json, Value};

fn main() {
    let mut reader = BufReader::new(stdin());
    let mut out = stdout();

    loop {
        let message = match read(&mut reader) {
            Ok(m) => m,
            Err(_) => break,
        };
        let method = message.get("method").and_then(Value::as_str).unwrap_or("");
        let id = message.get("id").cloned();

        match method {
            "initialize" => {
                reply(&mut out, id, json!({"capabilities": {}}));
            }
            "initialized" => {}
            "textDocument/didOpen" => {
                let uri = message["params"]["textDocument"]["uri"].clone();
                let diagnostic = json!({
                    "range": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 1}},
                    "severity": 1,
                    "message": "fake diagnostic from test server"
                });
                notify(&mut out, "textDocument/publishDiagnostics", json!({"uri": uri, "diagnostics": [diagnostic]}));
            }
            "textDocument/hover" => {
                reply(&mut out, id, json!({"contents": "fake hover text"}));
            }
            "textDocument/definition" => {
                reply(&mut out, id, json!([]));
            }
            "shutdown" => {
                reply(&mut out, id, Value::Null);
            }
            "exit" => break,
            _ => {}
        }
    }
}

fn read<R: std::io::BufRead>(reader: &mut R) -> std::io::Result<Value> {
    coretrace_lsp::framing::read_message(reader)
}

fn reply<W: std::io::Write>(out: &mut W, id: Option<Value>, result: Value) {
    let message = json!({"jsonrpc": "2.0", "id": id, "result": result});
    coretrace_lsp::framing::write_message(out, &message).ok();
}

fn notify<W: std::io::Write>(out: &mut W, method: &str, params: Value) {
    let message = json!({"jsonrpc": "2.0", "method": method, "params": params});
    coretrace_lsp::framing::write_message(out, &message).ok();
}
