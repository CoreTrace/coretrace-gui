//! Reports of a tool that failed on this machine: what to attach, how much of
//! the log to keep, and the call that sends it.

use crate::cloud::Cloud;
use crate::workspace::{resolve, root, WorkspaceState};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Build files worth sending with a report, by name. Shown in this order.
const BUILD_FILES: [&str; 7] = [
    "CMakeLists.txt",
    "Makefile",
    "compile_commands.json",
    "configure.ac",
    "conanfile.txt",
    "meson.build",
    "vcpkg.json",
];
const LOG_LIMIT: usize = 512 * 1024;
const FILE_LIMIT: u64 = 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub name: String,
    pub bytes: u64,
}

/// The files at the folder's root a build is configured by.
pub fn build_files(root: &Path) -> Vec<Candidate> {
    let mut found: Vec<Candidate> = BUILD_FILES
        .iter()
        .filter_map(|name| {
            let meta = std::fs::metadata(root.join(name)).ok()?;
            meta.is_file().then(|| Candidate {
                name: (*name).into(),
                bytes: meta.len(),
            })
        })
        .collect();
    found.sort_by(|a, b| a.name.cmp(&b.name));
    found
}

/// Keeps a log within the limit by keeping its start and its end: the start
/// says what was run, the end says how it ended.
pub fn truncate_log(log: &str) -> String {
    if log.len() <= LOG_LIMIT {
        return log.to_owned();
    }
    let half = LOG_LIMIT / 2;
    let mut head_end = half;
    while !log.is_char_boundary(head_end) {
        head_end -= 1;
    }
    let mut tail_start = log.len() - half;
    while !log.is_char_boundary(tail_start) {
        tail_start += 1;
    }
    format!(
        "{}\n[… journal tronqué : {} octets omis …]\n{}",
        &log[..head_end],
        tail_start - head_end,
        &log[tail_start..]
    )
}

/// The tools ctrace said did not complete, from its own summary lines.
pub fn failed_tools(output: &str) -> Vec<String> {
    const MARK: &str = "== CoreTrace == [WARN] (";
    let mut tools: Vec<String> = Vec::new();
    for line in output.lines() {
        let Some(start) = line.find(MARK) else {
            continue;
        };
        let rest = &line[start + MARK.len()..];
        let Some(end) = rest.find(')') else {
            continue;
        };
        let name = &rest[..end];
        if !tools.iter().any(|t| t == name) {
            tools.push(name.to_owned());
        }
    }
    if tools.is_empty() {
        tools.push("ctrace".into());
    }
    tools
}

/// The first line that reads like the reason, for telling one failure from
/// another. At most 200 characters.
pub fn signature(output: &str) -> String {
    let line = output
        .lines()
        .map(str::trim)
        .find(|l| {
            let l = l.to_lowercase();
            l.contains("error")
                || l.contains("failed")
                || l.contains("not found")
                || l.contains("cannot")
        })
        .unwrap_or("");
    line.chars().take(200).collect()
}

pub fn os_description() -> String {
    format!("{} {}", std::env::consts::OS, std::env::consts::ARCH)
}

#[tauri::command]
pub fn support_candidates(
    state: tauri::State<'_, WorkspaceState>,
    workspace_id: String,
) -> Result<Vec<Candidate>, String> {
    Ok(build_files(&root(&state, &workspace_id)?))
}

/// Reads a file the user chose to attach. Text only, and small: a report is
/// for reading, not for archiving a repository.
#[tauri::command]
pub fn support_read_file(
    state: tauri::State<'_, WorkspaceState>,
    workspace_id: String,
    relative: String,
) -> Result<String, String> {
    let path = resolve(&root(&state, &workspace_id)?, &relative)?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > FILE_LIMIT {
        return Err("Choose a text file smaller than 1 MiB".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.contains(&0) {
        return Err("Binary files cannot be attached".into());
    }
    String::from_utf8(bytes).map_err(|_| "The file is not UTF-8 text".into())
}

#[derive(Deserialize, Serialize)]
pub struct ReportFile {
    pub name: String,
    pub content: String,
}

#[derive(Deserialize, Serialize)]
pub struct ReportBody {
    pub tools: Vec<String>,
    pub signature: String,
    pub ctrace_version: String,
    pub desktop_version: String,
    pub os: String,
    pub libraries: String,
    pub log: String,
    pub files: Vec<ReportFile>,
}

/// Sends the report. The platform's refusals are sentences the dialog shows.
#[tauri::command]
pub async fn support_send(
    cloud: tauri::State<'_, Cloud>,
    mut report: ReportBody,
) -> Result<String, String> {
    // Whatever the caller left out, the log itself can say.
    if report.tools.is_empty() {
        report.tools = failed_tools(&report.log);
    }
    if report.signature.is_empty() {
        report.signature = signature(&report.log);
    }
    if report.os.is_empty() {
        report.os = os_description();
    }
    if report.desktop_version.is_empty() {
        report.desktop_version = env!("CARGO_PKG_VERSION").into();
    }
    report.log = truncate_log(&report.log);
    let body = serde_json::to_value(&report).map_err(|e| e.to_string())?;
    let mut s = cloud.0.lock().await;
    let (status, value) = s
        .request_status(Method::POST, "/support/reports", None, Some(body))
        .await?;
    match status {
        201 => value["id"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| "The platform stored the report but named no id".into()),
        429 => Err(value["detail"]["sentence"]
            .as_str()
            .unwrap_or("Vous avez atteint la limite de rapports. Réessayez plus tard.")
            .to_owned()),
        413 => Err("Le rapport dépasse 2 Mio. Retirez une pièce jointe.".into()),
        401 => Err("Sign in to CoreTrace first".into()),
        _ => Err(format!(
            "{} (HTTP {status})",
            value["title"].as_str().unwrap_or("Report refused")
        )),
    }
}

#[tauri::command]
pub fn support_mark_reported(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    workspace_id: String,
    run_id: String,
) -> Result<(), String> {
    crate::settings::remember_reported(&app, &root(&state, &workspace_id)?, &run_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_build_files_and_nothing_else() {
        let dir = tempfile::tempdir().unwrap();
        for name in [
            "Makefile",
            "CMakeLists.txt",
            "vcpkg.json",
            "README.md",
            "main.c",
        ] {
            std::fs::write(dir.path().join(name), "x").unwrap();
        }
        let names: Vec<String> = build_files(dir.path())
            .into_iter()
            .map(|c| c.name)
            .collect();
        assert_eq!(names, vec!["CMakeLists.txt", "Makefile", "vcpkg.json"]);
    }

    #[test]
    fn a_long_log_keeps_its_head_and_tail() {
        let log = "a".repeat(300 * 1024) + "MIDDLE" + &"z".repeat(300 * 1024);
        let cut = truncate_log(&log);
        assert!(cut.len() < 520 * 1024);
        assert!(cut.starts_with("aaaa"));
        assert!(cut.ends_with("zzzz"));
        assert!(cut.contains("[… journal tronqué :"));
        assert!(!cut.contains("MIDDLE"));
        assert_eq!(truncate_log("short"), "short");
    }

    #[test]
    fn names_the_tools_that_did_not_complete() {
        let out = "|1| == CoreTrace == [WARN] (tscancode) Could not be started, so this file is unanalysed by it.\n\
                   |1| == CoreTrace == [INFO] (cppcheck) Completed; its findings are in the report.\n\
                   |1| == CoreTrace == [WARN] (flawfinder) Failed, so this file is unanalysed by it.\n\
                   |1| == CoreTrace == [INFO] (ctrace_stack_analyzer) Diagnostics summary: info=0, warning=0, error=0\n";
        assert_eq!(failed_tools(out), vec!["tscancode", "flawfinder"]);
        assert_eq!(failed_tools("nothing here"), vec!["ctrace"]);
        assert_eq!(
            signature("ok\nError: Failed to create process\nmore"),
            "Error: Failed to create process"
        );
    }
}
