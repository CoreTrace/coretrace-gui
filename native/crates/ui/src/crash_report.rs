use std::io;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Millisecond timestamps alone aren't unique enough for the crash log
/// filename -- two panics (or, as a real test failure caught, two
/// concurrent test-suite calls to `write_report`) landing in the same
/// millisecond would collide and tear each other's writes. This counter
/// guarantees uniqueness regardless of timing.
static REPORT_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Where crash logs land: `%APPDATA%/coretrace/crashes/`, same
/// convention as `extensions_dir()`/`session::session_path()`.
fn crashes_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".coretrace-appdata"));
    base.join("coretrace").join("crashes")
}

/// Installs a panic hook that writes a crash report to disk before
/// running the default hook (which still prints to stderr as normal --
/// this adds a persistent record, it doesn't replace the usual
/// diagnostic output). Call once, at startup, before anything else can
/// panic.
pub fn install() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = panic_message(info);
        let location = info.location().map(|l| l.to_string()).unwrap_or_else(|| "<unknown location>".to_string());
        let report = format_report(&message, &location, unix_millis_now());
        if let Err(e) = write_report(&report) {
            eprintln!("[crash_report] failed to write crash log: {e}");
        }
        default_hook(info);
    }));
}

fn panic_message(info: &std::panic::PanicHookInfo) -> String {
    if let Some(s) = info.payload().downcast_ref::<&str>() {
        s.to_string()
    } else if let Some(s) = info.payload().downcast_ref::<String>() {
        s.clone()
    } else {
        "<non-string panic payload>".to_string()
    }
}

fn unix_millis_now() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

fn format_report(message: &str, location: &str, timestamp_millis: u128) -> String {
    format!(
        "CoreTrace crash report\ntimestamp_ms: {timestamp_millis}\nlocation: {location}\nmessage: {message}\n"
    )
}

fn write_report(report: &str) -> io::Result<PathBuf> {
    let dir = crashes_dir();
    std::fs::create_dir_all(&dir)?;
    let counter = REPORT_COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = dir.join(format!("crash-{}-{counter}.log", unix_millis_now()));
    std::fs::write(&path, report)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_contains_message_and_location() {
        let report = format_report("boom", "src/foo.rs:12:5", 1_700_000_000_000);
        assert!(report.contains("boom"));
        assert!(report.contains("src/foo.rs:12:5"));
        assert!(report.contains("1700000000000"));
    }

    #[test]
    fn write_report_creates_a_real_file() {
        let path = write_report("test report contents").expect("write report");
        let contents = std::fs::read_to_string(&path).expect("read back");
        assert_eq!(contents, "test report contents");
        let _ = std::fs::remove_file(&path);
    }

    /// End-to-end: installs the real hook, triggers a real panic (on a
    /// spawned thread, so it doesn't abort the test process), and
    /// confirms a real crash log landed on disk with the real message
    /// -- not just that `format_report`/`write_report` work in
    /// isolation. Finds the written file by its unique message content
    /// rather than diffing directory listings before/after: this test
    /// binary runs its tests in parallel by default, and
    /// `write_report_creates_a_real_file` writes/deletes its own file
    /// in the same shared `crashes_dir()` concurrently -- an earlier
    /// version of this test used a before/after directory-listing diff
    /// and was genuinely flaky under `cargo test`'s default parallel
    /// execution because of that shared-directory race, caught by a
    /// real intermittent failure, not simulated.
    #[test]
    fn install_writes_a_crash_log_on_a_real_panic() {
        let marker = format!("crash_report end-to-end test panic {}", std::process::id());
        install();
        let panic_message = marker.clone();
        let _ = std::thread::spawn(move || {
            panic!("{panic_message}");
        })
        .join();

        let entries: Vec<_> =
            std::fs::read_dir(crashes_dir()).map(|d| d.filter_map(|e| e.ok().map(|e| e.path())).collect()).unwrap_or_default();
        let matching_file = entries
            .into_iter()
            .find(|p| std::fs::read_to_string(p).is_ok_and(|contents| contents.contains(&marker)))
            .expect("a crash log containing this test's unique marker should have been written");

        let _ = std::fs::remove_file(&matching_file);
    }
}
