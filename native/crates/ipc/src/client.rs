use crate::protocol::{HostRequest, HostResponse};
use crate::transport::Transport;

/// Thin client the native UI uses to talk to the extension-host sidecar.
pub struct ExtensionHostClient {
    transport: Transport,
}

impl ExtensionHostClient {
    pub fn connect(port: u16, token: &str) -> std::io::Result<Self> {
        Ok(Self { transport: Transport::connect(port, token)? })
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

    pub fn set_document_text(
        &mut self,
        text: &str,
        file_name: Option<&str>,
        language_id: Option<&str>,
    ) -> std::io::Result<HostResponse> {
        self.transport.send(&HostRequest::SetDocumentText {
            text: text.to_string(),
            file_name: file_name.map(str::to_string),
            language_id: language_id.map(str::to_string),
        })?;
        self.transport.recv()
    }

    pub fn get_document_text(&mut self) -> std::io::Result<HostResponse> {
        self.transport.send(&HostRequest::GetDocumentText)?;
        self.transport.recv()
    }

    pub fn list_commands(&mut self) -> std::io::Result<HostResponse> {
        self.transport.send(&HostRequest::ListCommands)?;
        self.transport.recv()
    }
}
