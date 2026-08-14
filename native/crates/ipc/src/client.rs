use crate::protocol::{HostRequest, HostResponse};
use crate::transport::Transport;

/// Thin client the native UI uses to talk to the extension-host sidecar.
pub struct ExtensionHostClient {
    transport: Transport,
}

impl ExtensionHostClient {
    pub fn connect(port: u16) -> std::io::Result<Self> {
        Ok(Self { transport: Transport::connect(port)? })
    }

    pub fn ping(&mut self) -> std::io::Result<HostResponse> {
        self.transport.send(&HostRequest::Ping)?;
        self.transport.recv()
    }

    pub fn invoke_command(
        &mut self,
        command: &str,
        args: Vec<serde_json::Value>,
    ) -> std::io::Result<HostResponse> {
        self.transport.send(&HostRequest::InvokeCommand {
            command: command.to_string(),
            args,
        })?;
        self.transport.recv()
    }

    pub fn set_document_text(&mut self, text: &str) -> std::io::Result<HostResponse> {
        self.transport.send(&HostRequest::SetDocumentText { text: text.to_string() })?;
        self.transport.recv()
    }

    pub fn get_document_text(&mut self) -> std::io::Result<HostResponse> {
        self.transport.send(&HostRequest::GetDocumentText)?;
        self.transport.recv()
    }
}
