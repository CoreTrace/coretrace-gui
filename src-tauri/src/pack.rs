use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// What packing produced. The platform is told the digest and the size before
/// the bytes are sent, so both must describe exactly the file on disk.
pub struct Packed {
    pub path: PathBuf,
    pub sha256: String,
    pub size: u64,
    pub files: usize,
}

/// Directories an analysis never reads. Sending them costs upload time and CTU
/// for nothing, and node_modules alone routinely dwarfs the sources.
pub fn excluded(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "target"
            | "build"
            | "dist"
            | ".next"
            | ".venv"
            | "__pycache__"
            | ".idea"
            | ".vscode"
    )
}

/// Counts and hashes every byte on its way to the file, so the digest and the
/// size come out of the same pass that writes the archive.
struct HashingWriter<W: Write> {
    inner: W,
    hasher: Sha256,
    written: u64,
}

impl<W: Write> Write for HashingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let n = self.inner.write(buf)?;
        self.hasher.update(&buf[..n]);
        self.written += n as u64;
        Ok(n)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

/// Writes the workspace to `into` as tar wrapped in zstd, which is the only
/// shape the platform's extractor reads.
///
/// The walk is iterative rather than recursive: a deep tree is a property of
/// the user's project, not something to trust the call stack with.
pub fn pack(
    root: &Path,
    into: &Path,
    cancel: &AtomicBool,
    progress: &dyn Fn(usize, u64),
) -> Result<Packed, String> {
    let file = std::fs::File::create(into).map_err(|e| format!("Cannot write the archive: {e}"))?;
    let writer = HashingWriter {
        inner: file,
        hasher: Sha256::new(),
        written: 0,
    };
    let encoder = zstd::Encoder::new(writer, 3).map_err(|e| e.to_string())?;
    let mut builder = tar::Builder::new(encoder);
    let mut files = 0usize;
    let mut bytes = 0u64;
    let mut folders = vec![root.to_path_buf()];

    let outcome = (|| -> Result<(), String> {
        while let Some(folder) = folders.pop() {
            let entries = match std::fs::read_dir(&folder) {
                Ok(entries) => entries,
                // An unreadable folder is not a reason to abandon the archive.
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                if cancel.load(Ordering::Relaxed) {
                    return Err("Cancelled".into());
                }
                let path = entry.path();
                let Ok(kind) = entry.file_type() else { continue };
                // Symbolic links are not followed: a link out of the workspace
                // would send files the user never opened.
                if kind.is_symlink() {
                    continue;
                }
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if kind.is_dir() {
                    if !excluded(&name) {
                        folders.push(path);
                    }
                    continue;
                }
                let Ok(relative) = path.strip_prefix(root) else {
                    continue;
                };
                let added = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                builder
                    .append_path_with_name(&path, relative)
                    .map_err(|e| format!("Cannot add {}: {e}", relative.display()))?;
                files += 1;
                bytes += added;
                // Reporting every file would be noise on a large tree; every
                // twentieth is often enough for the count to look alive.
                if files.is_multiple_of(20) {
                    progress(files, bytes);
                }
            }
        }
        Ok(())
    })();

    if let Err(reason) = outcome {
        drop(builder);
        let _ = std::fs::remove_file(into);
        return Err(reason);
    }

    let encoder = builder.into_inner().map_err(|e| e.to_string())?;
    let writer = encoder.finish().map_err(|e| e.to_string())?;
    let HashingWriter {
        inner,
        hasher,
        written,
    } = writer;
    drop(inner);
    Ok(Packed {
        path: into.to_path_buf(),
        sha256: hasher.finalize().iter().map(|b| format!("{b:02x}")).collect(),
        size: written,
        files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry_names(archive: &Path) -> Vec<String> {
        let file = std::fs::File::open(archive).unwrap();
        let decoder = zstd::Decoder::new(file).unwrap();
        let mut tar = tar::Archive::new(decoder);
        tar.entries()
            .unwrap()
            .map(|e| e.unwrap().path().unwrap().display().to_string())
            .collect()
    }

    fn sha256_hex(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn packs_the_tree_and_skips_what_an_analysis_never_reads() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("work");
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/main.c"), b"int main(void) { return 0; }").unwrap();
        std::fs::create_dir_all(root.join("node_modules/x")).unwrap();
        std::fs::write(root.join("node_modules/x/huge.js"), b"noise").unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(root.join(".git/config"), b"noise").unwrap();

        let out = dir.path().join("archive.tar.zst");
        let packed = pack(&root, &out, &AtomicBool::new(false), &|_, _| {}).unwrap();

        assert_eq!(packed.files, 1, "only the source file belongs in the archive");
        assert_eq!(packed.size, std::fs::metadata(&out).unwrap().len());
        assert_eq!(packed.sha256.len(), 64);

        let names = entry_names(&out);
        assert!(names.iter().any(|n| n.ends_with("main.c")), "names = {names:?}");
        assert!(!names.iter().any(|n| n.contains("node_modules")));
        assert!(!names.iter().any(|n| n.contains(".git")));
    }

    #[test]
    fn the_digest_matches_the_bytes_the_platform_will_receive() {
        // /uploads is told the hash and size before the bytes are sent; if they
        // disagree the upload is rejected after the whole archive has travelled.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("work");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("a.c"), b"int a;").unwrap();

        let out = dir.path().join("archive.tar.zst");
        let packed = pack(&root, &out, &AtomicBool::new(false), &|_, _| {}).unwrap();

        let bytes = std::fs::read(&out).unwrap();
        assert_eq!(packed.sha256, sha256_hex(&bytes));
        assert_eq!(packed.size, bytes.len() as u64);
    }

    #[test]
    fn cancelling_stops_the_walk_and_leaves_no_archive() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("work");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("a.c"), b"int a;").unwrap();

        let out = dir.path().join("archive.tar.zst");
        assert!(pack(&root, &out, &AtomicBool::new(true), &|_, _| {}).is_err());
        assert!(!out.exists(), "a cancelled pack must not leave a partial archive");
    }
}
