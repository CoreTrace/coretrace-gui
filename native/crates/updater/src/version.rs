use std::cmp::Ordering;
use std::fmt;

/// A minimal `major.minor.patch` version -- not full semver (no
/// pre-release/build-metadata handling), which is all this app's own
/// version strings and the manifest it checks against need.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Version {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl Version {
    pub fn parse(s: &str) -> Option<Self> {
        let mut parts = s.trim().splitn(3, '.');
        let major = parts.next()?.parse().ok()?;
        let minor = parts.next()?.parse().ok()?;
        let patch = parts.next().unwrap_or("0").parse().ok()?;
        Some(Self { major, minor, patch })
    }
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        (self.major, self.minor, self.patch).cmp(&(other.major, other.minor, other.patch))
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_major_minor_patch() {
        assert_eq!(Version::parse("1.2.3"), Some(Version { major: 1, minor: 2, patch: 3 }));
    }

    #[test]
    fn defaults_missing_patch_to_zero() {
        assert_eq!(Version::parse("1.2"), Some(Version { major: 1, minor: 2, patch: 0 }));
    }

    #[test]
    fn rejects_garbage() {
        assert_eq!(Version::parse("not-a-version"), None);
    }

    #[test]
    fn compares_numerically_not_lexically() {
        // Lexical comparison would get "10.0.0" < "9.0.0" wrong.
        assert!(Version::parse("10.0.0").unwrap() > Version::parse("9.0.0").unwrap());
    }
}
