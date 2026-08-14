use std::fmt;

#[derive(Debug)]
pub enum CtraceError {
    WslUnavailable,
    InvalidPath,
    Io(std::io::Error),
    NoDiagnosticsJson,
}

impl fmt::Display for CtraceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CtraceError::WslUnavailable => write!(f, "WSL is not available on this machine"),
            CtraceError::InvalidPath => write!(f, "path is not a valid Windows drive path"),
            CtraceError::Io(e) => write!(f, "failed to run ctrace: {e}"),
            CtraceError::NoDiagnosticsJson => {
                write!(f, "ctrace produced no parseable diagnostics JSON")
            }
        }
    }
}

impl std::error::Error for CtraceError {}

impl From<std::io::Error> for CtraceError {
    fn from(e: std::io::Error) -> Self {
        CtraceError::Io(e)
    }
}
