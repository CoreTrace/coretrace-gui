use std::fmt;

#[derive(Debug)]
pub enum RegistryError {
    Http(reqwest::Error),
    Json(serde_json::Error),
    Io(std::io::Error),
    Zip(String),
}

impl fmt::Display for RegistryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Http(e) => write!(f, "registry request failed: {e}"),
            Self::Json(e) => write!(f, "registry response was not valid JSON: {e}"),
            Self::Io(e) => write!(f, "local filesystem error: {e}"),
            Self::Zip(e) => write!(f, "failed to unpack .vsix: {e}"),
        }
    }
}

impl std::error::Error for RegistryError {}

impl From<reqwest::Error> for RegistryError {
    fn from(e: reqwest::Error) -> Self {
        Self::Http(e)
    }
}

impl From<serde_json::Error> for RegistryError {
    fn from(e: serde_json::Error) -> Self {
        Self::Json(e)
    }
}

impl From<std::io::Error> for RegistryError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<zip::result::ZipError> for RegistryError {
    fn from(e: zip::result::ZipError) -> Self {
        Self::Zip(e.to_string())
    }
}
