// Contract fixture: never runs a real analysis or sends source code anywhere.
fn main() {
    let args: Vec<String> = std::env::args().collect();
    assert!(args.iter().any(|arg| arg == "--static"));
    assert!(args.iter().any(|arg| arg == "--sarif-format"));
    let value = |key: &str| &args[args.iter().position(|arg| arg == key).unwrap() + 1];
    if std::fs::read_to_string(value("--input")).unwrap() == "wait" {
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
    std::fs::write(value("--report-file"), r#"{"version":"2.1.0","runs":[{"results":[]}]}"#).unwrap();
    println!("analysis complete");
    eprintln!("fixture diagnostic");
    std::process::exit(1);
}
