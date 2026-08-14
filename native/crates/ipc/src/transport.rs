use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;

/// Newline-delimited JSON transport over a local TCP loopback connection.
///
/// Phase 0 spike only: a named-pipe / Unix-domain-socket transport should
/// replace this before Phase 3, TCP loopback is just the fastest thing to
/// prove the round-trip on both Windows and Unix during the spike.
pub struct Transport {
    reader: BufReader<TcpStream>,
    writer: TcpStream,
}

impl Transport {
    pub fn connect(port: u16) -> std::io::Result<Self> {
        let stream = TcpStream::connect(("127.0.0.1", port))?;
        let reader = BufReader::new(stream.try_clone()?);
        Ok(Self { reader, writer: stream })
    }

    pub fn send<T: serde::Serialize>(&mut self, message: &T) -> std::io::Result<()> {
        let mut line = serde_json::to_string(message)?;
        line.push('\n');
        self.writer.write_all(line.as_bytes())
    }

    pub fn recv<T: serde::de::DeserializeOwned>(&mut self) -> std::io::Result<T> {
        let mut line = String::new();
        self.reader.read_line(&mut line)?;
        serde_json::from_str(line.trim_end()).map_err(std::io::Error::from)
    }
}
