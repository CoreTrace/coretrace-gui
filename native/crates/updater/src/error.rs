use std::fmt;

#[derive(Debug)]
pub enum UpdaterError {
    Request(String),
    InvalidManifest(String),
    InvalidVersion(String),
    Io(String),
}

impl fmt::Display for UpdaterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UpdaterError::Request(e) => write!(f, "update check failed: {e}"),
            UpdaterError::InvalidManifest(e) => write!(f, "invalid update manifest: {e}"),
            UpdaterError::InvalidVersion(v) => write!(f, "unparseable version: {v}"),
            UpdaterError::Io(e) => write!(f, "download failed: {e}"),
        }
    }
}

impl std::error::Error for UpdaterError {}
