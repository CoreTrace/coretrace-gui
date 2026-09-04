use std::path::Path;
use std::process::Command;

use crate::diagnostic::AnalysisResult;
use crate::error::CtraceError;
use crate::json_extract::extract_json_objects;
use crate::wsl::{to_wsl_path, wsl_available};

/// Runs `ctrace`'s one-shot static analysis (not the persistent HTTP-server
/// mode the old Electron app used) against a single file and returns the
/// stack analyzer's diagnostics. `ctrace_bin` and `file` are both Windows
/// paths; both get converted to `/mnt/c/...` form for the WSL invocation.
pub fn run_static_analysis(
    ctrace_bin: &Path,
    file: &Path,
) -> Result<AnalysisResult, CtraceError> {
    if !wsl_available() {
        return Err(CtraceError::WslUnavailable);
    }
    let bin_wsl = to_wsl_path(ctrace_bin).ok_or(CtraceError::InvalidPath)?;
    let file_wsl = to_wsl_path(file).ok_or(CtraceError::InvalidPath)?;

    // A login shell is still used so ctrace sees the user's WSL environment,
    // but both paths travel as positional parameters ($0 / $1) rather than
    // being spliced into the script text: a file name containing quotes or
    // `$(...)` is then just data, never shell syntax.
    const SCRIPT: &str = r#""$0" --input="$1" --static --sarif-format 2>&1"#;
    let output = Command::new("wsl.exe")
        .arg("-e")
        .arg("bash")
        .arg("-lc")
        .arg(SCRIPT)
        .arg(&bin_wsl)
        .arg(&file_wsl)
        .output()?;

    let text = String::from_utf8_lossy(&output.stdout);
    parse_stack_analyzer_result(&text).ok_or(CtraceError::NoDiagnosticsJson)
}

fn parse_stack_analyzer_result(text: &str) -> Option<AnalysisResult> {
    extract_json_objects(text)
        .into_iter()
        .filter_map(|span| serde_json::from_str::<AnalysisResult>(span).ok())
        .find(|result| result.meta.tool == "ctrace-stack-analyzer")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_real_ctrace_output_sample() {
        let sample = include_str!("../tests/fixtures/sample_output.txt");
        let result = parse_stack_analyzer_result(sample).expect("parse sample");
        assert_eq!(result.meta.tool, "ctrace-stack-analyzer");
        assert_eq!(result.diagnostics.len(), 1);
        assert_eq!(result.diagnostics[0].rule_id, "UninitializedLocalRead");
    }
}
