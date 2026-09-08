use crate::workspace::{resolve, root, WorkspaceState};
use serde::Serialize;
use std::{path::PathBuf, sync::Mutex, time::Duration};
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
    let (sender, mut receiver) = oneshot::channel();
    {
        let mut active = state.cancel.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("An analysis is already running".into());
        }
        *active = Some(sender);
    }
    let result = async {
        let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
        let report_path = temp.path().join("report.sarif");
        let mut command = Command::new(executable);
        command.arg("--input").arg(input).args(["--static", "--sarif-format", "--report-file"]).arg(&report_path)
            .arg("--output-file").arg(temp.path().join("ctrace.out"))
            .current_dir(&root).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped()).kill_on_drop(true);
        #[cfg(windows)] command.creation_flags(0x08000000);
        let mut child = command.spawn().map_err(|e| format!("Cannot start ctrace: {e}"))?;
        let stdout = tokio::spawn(capture(child.stdout.take().ok_or("Missing stdout")?));
        let stderr = tokio::spawn(capture(child.stderr.take().ok_or("Missing stderr")?));
        let (status, cancelled) = tokio::select! {
            status = child.wait() => (status.map_err(|e| e.to_string())?, false),
            _ = &mut receiver => { child.kill().await.map_err(|e| e.to_string())?; (child.wait().await.map_err(|e| e.to_string())?, true) },
            _ = tokio::time::sleep(Duration::from_secs(900)) => { let _ = child.kill().await; stdout.abort(); stderr.abort(); return Err("Analysis exceeded 15 minutes and was stopped".into()); }
        };
        let read_output = async { (stdout.await.unwrap_or_default(), stderr.await.unwrap_or_default()) };
        let (stdout, stderr) = tokio::time::timeout(Duration::from_secs(5), read_output).await.unwrap_or_else(|_| (String::new(), "Output pipe did not close".into()));
        let report = std::fs::metadata(&report_path).ok().filter(|m| m.len() <= 10 * 1024 * 1024).and_then(|_| std::fs::read_to_string(report_path).ok());
        Ok(ResultView { exit_code: status.code(), stdout, stderr, report, cancelled })
    }.await;
    *state.cancel.lock().map_err(|e| e.to_string())? = None;
    result
}
#[tauri::command]
pub fn cancel_local(state: tauri::State<'_, AnalysisState>) -> Result<(), String> {
    if let Some(sender) = state.cancel.lock().map_err(|e| e.to_string())?.take() {
        let _ = sender.send(());
    }
    Ok(())
}
