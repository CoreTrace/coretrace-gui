/// `ctrace` prints a mix of plain log lines and raw JSON blobs on stdout
/// (one per tool it ran). This scans for balanced `{...}` spans, respecting
/// string literals and escapes, and returns each candidate span as a slice.
/// Ports the *behavior* of the old app's `extractJsonFromText`, not its code.
pub fn extract_json_objects(text: &str) -> Vec<&str> {
    let bytes = text.as_bytes();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'{' {
            if let Some(end) = balanced_end(bytes, i) {
                spans.push(&text[i..=end]);
                i = end + 1;
                continue;
            }
        }
        i += 1;
    }
    spans
}

fn balanced_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escaped = false;
    let mut i = start;
    while i < bytes.len() {
        let b = bytes[i];
        if in_string {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == b'"' {
                in_string = false;
            }
        } else {
            match b {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_single_object_amid_log_lines() {
        let text = "log line\n{\"a\": 1, \"b\": {\"c\": 2}}\nmore logs\n";
        let objs = extract_json_objects(text);
        assert_eq!(objs, vec!["{\"a\": 1, \"b\": {\"c\": 2}}"]);
    }

    #[test]
    fn ignores_braces_inside_strings() {
        let text = r#"{"msg": "unbalanced { in a string"}"#;
        let objs = extract_json_objects(text);
        assert_eq!(objs.len(), 1);
    }

    #[test]
    fn extracts_multiple_objects() {
        let text = "{\"x\":1} noise {\"y\":2}";
        let objs = extract_json_objects(text);
        assert_eq!(objs.len(), 2);
    }
}
