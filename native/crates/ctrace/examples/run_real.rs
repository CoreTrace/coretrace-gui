// Manual verification: runs the real `bin/ctrace` binary via WSL against a
// real temp C file and prints the parsed diagnostics.
use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.join("../../..");
    let ctrace_bin = repo_root.join("bin/ctrace");
    let test_file = repo_root.join("native/crates/ctrace/examples/fixture.c");

    std::fs::write(&test_file, "int main(){int x; return x;}\n").expect("write fixture");

    match coretrace_ctrace::run_static_analysis(&ctrace_bin, &test_file) {
        Ok(result) => {
            println!("tool: {}", result.meta.tool);
            println!("functions: {}", result.functions.len());
            for d in &result.diagnostics {
                println!(
                    "[{}] {} ({}:{}) {}",
                    d.severity, d.rule_id, d.location.start_line, d.location.start_column, d.details.message
                );
            }
        }
        Err(e) => eprintln!("error: {e}"),
    }

    let _ = std::fs::remove_file(&test_file);
}
