use std::io::{self, BufRead, Write};

use serde_json::Value;

/// Reads one `Content-Length: N\r\n\r\n<N bytes of JSON>` message -- the
/// wire framing every LSP server (clangd included) uses over stdio.
pub fn read_message<R: BufRead>(reader: &mut R) -> io::Result<Value> {
    let mut content_length: Option<usize> = None;
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "LSP stream closed"));
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some(value) = line.strip_prefix("Content-Length:") {
            content_length = value.trim().parse().ok();
        }
    }
    let len = content_length
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing Content-Length header"))?;
    let mut body = vec![0u8; len];
    reader.read_exact(&mut body)?;
    serde_json::from_slice(&body).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

/// Writes a JSON-RPC value with the same `Content-Length` framing.
pub fn write_message<W: Write>(writer: &mut W, value: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(value)?;
    write!(writer, "Content-Length: {}\r\n\r\n", body.len())?;
    writer.write_all(&body)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn round_trips_a_message() {
        let mut buf = Vec::new();
        let msg = serde_json::json!({"jsonrpc": "2.0", "id": 1, "method": "test"});
        write_message(&mut buf, &msg).unwrap();

        let mut cursor = Cursor::new(buf);
        let parsed = read_message(&mut cursor).unwrap();
        assert_eq!(parsed, msg);
    }

    #[test]
    fn errors_on_missing_header() {
        let mut cursor = Cursor::new(b"\r\n{}".to_vec());
        assert!(read_message(&mut cursor).is_err());
    }
}
