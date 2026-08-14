// Minimal real HTTP/1.1 server for testing the updater against a real
// socket instead of a live update server (there isn't one for this
// project yet -- see native/docs/phase5-status.md).
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

pub struct MockServer {
    pub base_url: String,
}

impl MockServer {
    /// Serves `body` (with `content_type`) for every request accepted
    /// while the returned server is alive. Runs on a background thread
    /// for the lifetime of the test process -- fine for a handful of
    /// short-lived tests, not meant to be torn down early.
    pub fn start(content_type: &'static str, body: &'static [u8]) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
        let port = listener.local_addr().unwrap().port();

        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf);
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.write_all(body);
            }
        });

        Self { base_url: format!("http://127.0.0.1:{port}") }
    }
}
