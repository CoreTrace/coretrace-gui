mod client;
mod protocol;
mod supervisor;
mod transport;

pub use client::ExtensionHostClient;
pub use protocol::{HostRequest, HostResponse};
pub use supervisor::SidecarSupervisor;
