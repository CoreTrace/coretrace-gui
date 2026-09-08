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
    options: Mutex<AnalysisOptions>,
    cancel: Mutex<Option<oneshot::Sender<()>>>,
    running: AtomicBool,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisOptions {
    config: Option<PathBuf>,
    compile_commands: Option<PathBuf>,
}

// Keep canonical paths for filesystem authorization; normalize only at the CLI boundary.
fn tool_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let value = path.to_string_lossy();
        let value = if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            format!("//{unc}")
        } else {
            value.strip_prefix(r"\\?\").unwrap_or(&value).to_owned()
        };
        PathBuf::from(value.replace('\\', "/"))
    }
    #[cfg(not(windows))]
    path.to_owned()
}

fn database_contains(database: &Path, input: &Path) -> bool {
    let Ok(metadata) = database.metadata() else {
        return false;
    };
    if metadata.len() > 10 * 1024 * 1024 {
        return false;
    }
    let Ok(bytes) = std::fs::read(database) else {
        return false;
    };
    let Ok(rows) = serde_json::from_slice::<Vec<serde_json::Value>>(&bytes) else {
        return false;
    };
    rows.iter().any(|row| {
        let Some(file) = row["file"].as_str() else {
            return false;
        };
        let path = PathBuf::from(file);
        let candidate = if path.is_absolute() {
            path
        } else if let Some(directory) = row["directory"].as_str() {
            PathBuf::from(directory).join(path)
        } else {
            return false;
        };
        candidate.canonicalize().is_ok_and(|path| path == input)
    })
}

fn discover_database(root: &Path, input: &Path) -> Option<PathBuf> {
    let mut folders = vec![(root.to_owned(), 0_u8)];
    let mut databases = Vec::new();
    while let Some((folder, depth)) = folders.pop() {
        let Ok(entries) = std::fs::read_dir(folder) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && entry.file_name() == "compile_commands.json" {
                databases.push(path);
            } else if depth < 3
                && path.is_dir()
                && entry.file_name() != ".git"
                && entry.file_name() != "node_modules"
            {
                folders.push((path, depth + 1));
            }
        }
    }
    databases.sort();
    databases
        .into_iter()
        .find(|path| database_contains(path, input))
}

fn generated_database(root: &Path, input: &Path, destination: &Path) -> Result<PathBuf, String> {
    let compiler = if input
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("c"))
    {
        "clang"
    } else {
        "clang++"
    };
    let mut arguments = vec![
        compiler.into(),
        "-c".into(),
        tool_path(input).display().to_string(),
    ];
    let include = root.join("include");
    if include.is_dir() {
        arguments.insert(1, format!("-I{}", tool_path(&include).display()));
    }
    let database = destination.join("compile_commands.json");
    let rows = serde_json::json!([{
        "directory": tool_path(input.parent().unwrap_or(root)).display().to_string(),
        "file": tool_path(input).display().to_string(),
        "arguments": arguments,
    }]);
    std::fs::write(
        &database,
        serde_json::to_vec(&rows).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(database)
}

#[tauri::command]
pub fn analysis_options(state: tauri::State<'_, AnalysisState>) -> Result<AnalysisOptions, String> {
    Ok(state.options.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub async fn choose_analysis_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, AnalysisState>,
    kind: String,
    clear: bool,
) -> Result<AnalysisOptions, String> {
    let title = match kind.as_str() {
        "config" => "Select the ctrace tool configuration",
        "compileCommands" => "Select compile_commands.json for this project",
        _ => return Err("Unknown analysis setting".into()),
    };
    let path = if clear {
        None
    } else {
        let Some(file) = app
            .dialog()
            .file()
            .set_title(title)
            .add_filter("JSON", &["json"])
            .blocking_pick_file()
        else {
            return analysis_options(state);
        };
        let path = file
            .into_path()
            .map_err(|e| e.to_string())?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if !path.is_file() {
            return Err("Choose a JSON file".into());
        }
        Some(path)
    };
    let mut options = state.options.lock().map_err(|e| e.to_string())?;
    match kind.as_str() {
        "config" => options.config = path,
        _ => options.compile_commands = path,
    }
    Ok(options.clone())
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
    warnings: Vec<String>,
}

fn execution_warnings(stdout: &str, stderr: &str, has_report: bool) -> Vec<String> {
    let output = format!("{stdout}\n{stderr}").to_lowercase();
    let mut warnings = Vec::new();
    if [
        "failed to create process",
        "can't open file",
        "could not find or open any of the paths",
        "failed to analyze:",
        "compilation failed:",
        "model load error:",
        "model ignored:",
    ]
    .iter()
    .any(|message| output.contains(message))
    {
        warnings.push("Un ou plusieurs outils n’ont pas pu terminer l’analyse. Vérifiez leur installation, la configuration et les chemins d’inclusion dans la sortie de ctrace.".into());
    }
    if !has_report {
        warnings.push("Aucun rapport structuré n’a été produit. L’absence de diagnostics ne confirme pas la réussite de l’analyse.".into());
    }
    warnings
}

// Some ctrace tools emit SARIF to their captured output instead of --report-file.
fn sarif_from_output(stdout: &str, stderr: &str) -> Option<String> {
    let mut runs = Vec::new();
    for mut remaining in [stdout, stderr] {
        while !remaining.is_empty() {
            let line_end = remaining.find('\n').map_or(remaining.len(), |i| i + 1);
            let candidate = remaining.trim_start();
            if candidate.starts_with('{') {
                let mut stream =
                    serde_json::Deserializer::from_str(candidate).into_iter::<serde_json::Value>();
                if let Some(Ok(value)) = stream.next() {
                    if value["version"] == "2.1.0" {
                        if let Some(report_runs) = value["runs"].as_array() {
                            runs.extend(report_runs.iter().cloned());
                        }
                    }
                    remaining = &candidate[stream.byte_offset()..];
                    continue;
                }
            }
            remaining = &remaining[line_end..];
        }
    }
    (!runs.is_empty()).then(|| serde_json::json!({"version":"2.1.0", "runs":runs}).to_string())
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
    let display = tool_path(&path).display().to_string();
    *state.executable.lock().map_err(|e| e.to_string())? = Some(path);
    let mut options = state.options.lock().map_err(|e| e.to_string())?;
    if options.config.is_none() {
        let selected = PathBuf::from(&display);
        let candidates = [
            selected
                .parent()
                .map(|parent| parent.join("config/tool-config.json")),
            selected
                .parent()
                .and_then(Path::parent)
                .map(|parent| parent.join("config/tool-config.json")),
        ];
        options.config = candidates
            .into_iter()
            .flatten()
            .find_map(|candidate| candidate.canonicalize().ok());
    }
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
    let options = state.options.lock().map_err(|e| e.to_string())?.clone();
    run_analysis(&executable, &root, &input, &options, receiver).await
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
    options: &AnalysisOptions,
    mut receiver: oneshot::Receiver<()>,
) -> Result<ResultView, String> {
    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
    let report_path = temp.path().join("report.sarif");
    let database = if let Some(database) = &options.compile_commands {
        database.to_owned()
    } else if let Some(database) = discover_database(root, input) {
        database
    } else {
        generated_database(root, input, temp.path())?
    };
    let mut command = Command::new(executable);
    if let Some(config) = &options.config {
        command.arg("--config").arg(tool_path(config));
    } else {
        command.arg("--static");
    }
    command.arg("--compile-commands").arg(tool_path(&database));
    command
        .arg("--input")
        .arg(tool_path(input))
        .args(["--sarif-format", "--report-file"])
        .arg(tool_path(&report_path))
        .arg("--output-file")
        .arg(tool_path(&temp.path().join("ctrace.out")))
        .current_dir(tool_path(
            options
                .config
                .as_deref()
                .and_then(Path::parent)
                .unwrap_or(root),
        ))
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
        .and_then(|_| std::fs::read_to_string(report_path).ok())
        .filter(|text| !text.trim().is_empty())
        .or_else(|| sarif_from_output(&stdout_text, &stderr_text));
    let warnings = execution_warnings(&stdout_text, &stderr_text, report.is_some());
    Ok(ResultView {
        exit_code: status.code(),
        stdout: stdout_text,
        stderr: stderr_text,
        report,
        cancelled,
        warnings,
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
    #[test]
    fn discovers_only_a_database_that_contains_the_active_file() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("src/main.cpp");
        std::fs::create_dir_all(input.parent().unwrap()).unwrap();
        std::fs::write(&input, "int main() {}").unwrap();
        let input = input.canonicalize().unwrap();
        let wrong = dir.path().join("a/compile_commands.json");
        let right = dir.path().join("build/compile_commands.json");
        std::fs::create_dir_all(wrong.parent().unwrap()).unwrap();
        std::fs::create_dir_all(right.parent().unwrap()).unwrap();
        std::fs::write(
            &wrong,
            r#"[{"directory":"C:/elsewhere","file":"other.cpp","arguments":["clang++"]}]"#,
        )
        .unwrap();
        std::fs::write(&right, serde_json::json!([{"directory": input.parent().unwrap(), "file": input, "arguments": ["clang++"]}]).to_string()).unwrap();
        assert_eq!(discover_database(dir.path(), &input).unwrap(), right);
    }
    #[test]
    fn generates_a_minimal_database_with_the_workspace_include_directory() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("include")).unwrap();
        let input = dir.path().join("main.cpp");
        std::fs::write(&input, "int main() {}").unwrap();
        let database = generated_database(dir.path(), &input, dir.path()).unwrap();
        let text = std::fs::read_to_string(database).unwrap();
        assert!(text.contains("clang++"));
        assert!(text.contains("-I"));
        assert!(text.contains("main.cpp"));
    }
    #[test]
    fn collects_complete_sarif_documents_from_tool_output() {
        let stdout = "Running cppcheck\n{\n\"version\":\"2.1.0\",\"runs\":[{\"results\":[]}]\n}\nDiagnostics summary\n";
        let report: serde_json::Value =
            serde_json::from_str(&sarif_from_output(stdout, stdout).unwrap()).unwrap();
        assert_eq!(report["runs"].as_array().unwrap().len(), 2);
        assert!(sarif_from_output("{broken\n{\"ok\":true}\n", "").is_none());
        assert!(sarif_from_output("{\"version\":\"2.1.0\",\"runs\":[", "").is_none());
    }
    #[test]
    fn tool_failures_are_not_confused_with_a_clean_report() {
        for failure in [
            "Error: Failed to create process",
            "python: can't open file 'flawfinder.py'",
            "Failed to analyze: file.cpp",
            "Compilation failed: file.cpp",
        ] {
            assert!(!execution_warnings(failure, "", true).is_empty());
        }
        assert!(!execution_warnings("", "", false).is_empty());
        assert!(execution_warnings(
            "Diagnostics summary: error=1",
            "file.c: error: buffer overflow",
            true
        )
        .is_empty());
    }
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
        let input = input.canonicalize().unwrap();
        let config = dir.path().join("tool config.json");
        let database = dir.path().join("compile_commands.json");
        std::fs::write(&config, "{}").unwrap();
        std::fs::write(&database, "[]").unwrap();
        let options = AnalysisOptions {
            config: Some(config.canonicalize().unwrap()),
            compile_commands: Some(database.canonicalize().unwrap()),
        };
        let result = run_analysis(&executable, dir.path(), &input, &options, receiver)
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
            run_analysis(
                &executable,
                dir.path(),
                &input,
                &AnalysisOptions::default(),
                receiver,
            ),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(result.cancelled);
    }
    #[cfg(windows)]
    #[test]
    fn external_tools_receive_compatible_disk_and_unc_paths() {
        assert_eq!(
            tool_path(Path::new(r"\\?\C:\work folder\file.cpp")),
            PathBuf::from("C:/work folder/file.cpp")
        );
        assert_eq!(
            tool_path(Path::new(r"\\?\UNC\server\share\file.cpp")),
            PathBuf::from("//server/share/file.cpp")
        );
        assert_eq!(
            tool_path(Path::new(r"C:\work\file.cpp")),
            PathBuf::from("C:/work/file.cpp")
        );
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
