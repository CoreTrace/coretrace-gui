// Minimal real HTTP/1.1 server for testing provider clients without
// real API keys or network access -- accepts exactly one request on a
// real TCP socket, captures its raw text (for asserting on
// headers/body), and replies with a canned JSON body. This proves the
// client's own request-building and response-parsing for real, over a
// real socket, which is the honest substitute here for a live provider
// (see native/docs/phase4-status.md for why no live provider could be
// used).
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread::{self, JoinHandle};

pub struct MockServer {
    pub base_url: String,
    handle: JoinHandle<String>,
}

impl MockServer {
    pub fn start(response_body: &'static str) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
        let port = listener.local_addr().unwrap().port();

        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept connection");
            let request = read_request(&mut stream);

            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).expect("write response");
            request
        });

        Self { base_url: format!("http://127.0.0.1:{port}"), handle }
    }

    /// Consumes the server and returns the raw request text it captured.
    pub fn into_request_text(self) -> String {
        self.handle.join().expect("mock server thread")
    }
}

fn read_request(stream: &mut std::net::TcpStream) -> String {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        let n = stream.read(&mut chunk).expect("read request");
        buf.extend_from_slice(&chunk[..n]);
        let text = String::from_utf8_lossy(&buf);
        if let Some(header_end) = text.find("\r\n\r\n") {
            let headers = &text[..header_end];
            let content_length: usize = headers
                .lines()
                .find_map(|l| l.strip_prefix("Content-Length:"))
                .and_then(|v| v.trim().parse().ok())
                .unwrap_or(0);
            let body_so_far = buf.len() - (header_end + 4);
            if body_so_far >= content_length {
                break;
            }
        }
        if n == 0 {
            break;
        }
    }
    String::from_utf8_lossy(&buf).into_owned()
}
