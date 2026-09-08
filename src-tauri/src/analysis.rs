use crate::workspace::{resolve, root, WorkspaceState};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri_plugin_dialog::DialogExt;
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
    sync::oneshot,
};

#[derive(Default)]
pub struct AnalysisState {
    executable: Mutex<Option<PathBuf>>,
    cancel: Mutex<Option<oneshot::Sender<()>>>,
    running: AtomicBool,
}
struct Running<'a>(&'a AnalysisState);
impl Drop for Running<'_> {
    fn drop(&mut self) {
        if let Ok(mut cancel) = self.0.cancel.lock() {
            *cancel = None;
        }
        self.0.running.store(false, Ordering::Release);
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultView {
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    report: Option<String>,
    cancelled: bool,
}

#[tauri::command]
pub async fn choose_analyser(
    app: tauri::AppHandle,
    state: tauri::State<'_, AnalysisState>,
) -> Result<Option<String>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .set_title("Select the installed ctrace executable")
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file
        .into_path()
        .map_err(|e| e.to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.is_file() {
        return Err("Choose an installed ctrace executable".into());
    }
    let display = path.display().to_string();
    *state.executable.lock().map_err(|e| e.to_string())? = Some(path);
    Ok(Some(display))
}
async fn capture(mut reader: impl AsyncRead + Unpin) -> String {
    let mut out = Vec::new();
    let mut chunk = [0; 8192];
    let mut truncated = false;
    while let Ok(count) = reader.read(&mut chunk).await {
        if count == 0 {
            break;
        }
        let remaining = (1024 * 1024_usize).saturating_sub(out.len());
        out.extend_from_slice(&chunk[..count.min(remaining)]);
        truncated |= count > remaining;
    }
    let mut text = String::from_utf8_lossy(&out).into_owned();
    if truncated {
        text.push_str("\n[Output truncated after 1 MiB]");
    }
    text
}
#[tauri::command]
pub async fn analyse_local(
    state: tauri::State<'_, AnalysisState>,
    workspace: tauri::State<'_, WorkspaceState>,
    workspace_id: String,
    path: String,
) -> Result<ResultView, String> {
    let root = root(&workspace, &workspace_id)?;
    let input = resolve(&root, &path)?;
    if !input.is_file() || input.to_string_lossy().contains(',') {
        return Err("Choose one source file without a comma in its path".into());
    }
    let executable = state
        .executable
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Choose the installed ctrace executable in Settings first")?;
    if state
        .running
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("An analysis is already running".into());
    }
    let _running = Running(&state);
    let (sender, receiver) = oneshot::channel();
    {
        let mut active = state.cancel.lock().map_err(|e| e.to_string())?;
        *active = Some(sender);
    }
    run_analysis(&executable, &root, &input, receiver).await
}

async fn stop_process(child: &mut tokio::process::Child) -> Result<(), String> {
    if child.try_wait().map_err(|e| e.to_string())?.is_some() {
        return Ok(());
    }
    if let Some(pid) = child.id() {
        #[cfg(windows)]
        {
            let system_root =
                std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
            let mut kill = Command::new(PathBuf::from(system_root).join("System32/taskkill.exe"));
            kill.args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(0x08000000);
            if let Ok(result) = kill.output().await {
                if result.status.success() {
                    let _ = child.wait().await;
                    return Ok(());
                }
            }
        }
        #[cfg(unix)]
        {
            let _ = Command::new("kill")
                .args(["-KILL", "--", &format!("-{pid}")])
                .output()
                .await;
        }
    }
    child.kill().await.map_err(|e| e.to_string())
}
async fn run_analysis(
    executable: &Path,
    root: &Path,
    input: &Path,
    mut receiver: oneshot::Receiver<()>,
) -> Result<ResultView, String> {
    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
    let report_path = temp.path().join("report.sarif");
    let mut command = Command::new(executable);
    command
        .arg("--input")
        .arg(input)
        .args(["--static", "--sarif-format", "--report-file"])
        .arg(&report_path)
        .arg("--output-file")
        .arg(temp.path().join("ctrace.out"))
        .current_dir(root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Cannot start ctrace: {e}"))?;
    let mut stdout = tokio::spawn(capture(child.stdout.take().ok_or("Missing stdout")?));
    let mut stderr = tokio::spawn(capture(child.stderr.take().ok_or("Missing stderr")?));
    let (status, cancelled) = tokio::select! {
        status = child.wait() => (status.map_err(|e| e.to_string())?, false),
        _ = &mut receiver => { stop_process(&mut child).await?; (child.wait().await.map_err(|e| e.to_string())?, true) },
        _ = tokio::time::sleep(Duration::from_secs(900)) => { let _ = stop_process(&mut child).await; stdout.abort(); stderr.abort(); return Err("Analysis exceeded 15 minutes and was stopped".into()); }
    };
    let read_output = async {
        (
            (&mut stdout).await.unwrap_or_default(),
            (&mut stderr).await.unwrap_or_default(),
        )
    };
    let (stdout_text, stderr_text) =
        match tokio::time::timeout(Duration::from_secs(5), read_output).await {
            Ok(output) => output,
            Err(_) => {
                stdout.abort();
                stderr.abort();
                (String::new(), "Output pipe did not close".into())
            }
        };
    let report = std::fs::metadata(&report_path)
        .ok()
        .filter(|m| m.len() <= 10 * 1024 * 1024)
        .and_then(|_| std::fs::read_to_string(report_path).ok());
    Ok(ResultView {
        exit_code: status.code(),
        stdout: stdout_text,
        stderr: stderr_text,
        report,
        cancelled,
    })
}
#[tauri::command]
pub async fn cancel_local(state: tauri::State<'_, AnalysisState>) -> Result<(), String> {
    if let Some(sender) = state.cancel.lock().map_err(|e| e.to_string())?.take() {
        let _ = sender.send(());
    }
    tokio::time::timeout(Duration::from_secs(10), async {
        while state.running.load(Ordering::Acquire) {
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    })
    .await
    .map_err(|_| "Analysis has not stopped yet; keep the window open and try again")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn native_process_returns_reports_and_can_be_cancelled() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("fixture.rs");
        std::fs::write(&source, include_str!("../tests/fixtures/ctrace.rs")).unwrap();
        let executable = dir.path().join(if cfg!(windows) {
            "ctrace.exe"
        } else {
            "ctrace"
        });
        let compile = std::process::Command::new("rustc")
            .arg(&source)
            .arg("-o")
            .arg(&executable)
            .output()
            .unwrap();
        assert!(
            compile.status.success(),
            "{}",
            String::from_utf8_lossy(&compile.stderr)
        );
        let input = dir.path().join("file with spaces.c");
        std::fs::write(&input, "int main() {}").unwrap();
        let (_sender, receiver) = oneshot::channel();
        let result = run_analysis(&executable, dir.path(), &input, receiver)
            .await
            .unwrap();
        assert_eq!(result.exit_code, Some(1));
        assert!(result.stdout.contains("analysis complete"));
        assert!(result.stderr.contains("fixture diagnostic"));
        assert!(result.report.unwrap().contains("2.1.0"));
        assert!(!result.cancelled);
        std::fs::write(&input, "wait").unwrap();
        let (sender, receiver) = oneshot::channel();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(250)).await;
            let _ = sender.send(());
        });
        let result = tokio::time::timeout(
            Duration::from_secs(10),
            run_analysis(&executable, dir.path(), &input, receiver),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(result.cancelled);
    }
    #[tokio::test]
    async fn output_is_bounded_without_blocking_the_child() {
        let bytes = vec![b'x'; 2 * 1024 * 1024];
        let output = capture(bytes.as_slice()).await;
        assert!(output.len() < 1024 * 1024 + 100);
        assert!(output.ends_with("[Output truncated after 1 MiB]"));
    }
    #[test]
    fn cancellation_keeps_the_run_locked_until_cleanup() {
        let state = AnalysisState::default();
        state.running.store(true, Ordering::Release);
        let running = Running(&state);
        let (sender, _receiver) = oneshot::channel();
        *state.cancel.lock().unwrap() = Some(sender);
        state
            .cancel
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(())
            .unwrap();
        assert!(state.running.load(Ordering::Acquire));
        drop(running);
        assert!(!state.running.load(Ordering::Acquire));
    }
}
