// Contract fixture: never runs a real analysis or sends source code anywhere.
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let configured = args.iter().any(|arg| arg == "--config");
    assert_eq!(args.iter().any(|arg| arg == "--static"), !configured);
    assert!(args.iter().any(|arg| arg == "--sarif-format"));
    let value = |key: &str| &args[args.iter().position(|arg| arg == key).unwrap() + 1];
    if cfg!(windows) {
        for arg in args.iter().skip(1) { assert!(!arg.contains('\\'), "CLI path was not normalized: {arg}"); }
    }
    if configured {
        assert_eq!(std::fs::read_to_string(value("--config")).unwrap(), "{}");
        assert_eq!(std::fs::read_to_string(value("--compile-commands")).unwrap(), "[]");
    }
    if std::fs::read_to_string(value("--input")).unwrap() == "wait" {
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
    std::fs::write(value("--report-file"), r#"{"version":"2.1.0","runs":[{"results":[]}]}"#).unwrap();
    println!("analysis complete");
    eprintln!("fixture diagnostic");
    std::process::exit(1);
}
