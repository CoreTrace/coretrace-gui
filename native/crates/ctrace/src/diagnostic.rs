use serde::Deserialize;

/// Shape of the JSON blob `ctrace`'s stack analyzer prints on stdout, e.g.
/// `{"meta": {...}, "functions": [...], "diagnostics": [...]}`.
#[derive(Debug, Clone, Deserialize)]
pub struct AnalysisResult {
    pub meta: Meta,
    #[serde(default)]
    pub functions: Vec<FunctionInfo>,
    #[serde(default)]
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Meta {
    pub tool: String,
    #[serde(rename = "inputFile")]
    pub input_file: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FunctionInfo {
    pub file: String,
    pub name: String,
    #[serde(rename = "maxStack")]
    pub max_stack: i64,
    #[serde(rename = "exceedsLimit")]
    pub exceeds_limit: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Diagnostic {
    pub id: String,
    pub severity: String,
    #[serde(rename = "ruleId")]
    pub rule_id: String,
    pub cwe: Option<String>,
    pub location: Location,
    pub details: Details,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Location {
    pub file: String,
    pub function: Option<String>,
    #[serde(rename = "startLine")]
    pub start_line: u32,
    #[serde(rename = "startColumn")]
    pub start_column: u32,
    #[serde(rename = "endLine")]
    pub end_line: u32,
    #[serde(rename = "endColumn")]
    pub end_column: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Details {
    pub message: String,
}
