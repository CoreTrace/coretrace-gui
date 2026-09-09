use crate::cloud::{Cloud, Session};
use crate::pack::{pack, Packed};
use reqwest::Method;
use serde::Serialize;
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

/// Where a cloud run has got to. The frontend polls this; the desktop pushes no
/// Tauri events anywhere and this is not the place to start.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "phase", rename_all = "lowercase")]
pub enum Phase {
    Idle,
    Packing { files: usize, bytes: u64 },
    Uploading { files: usize, total: u64 },
    Verifying,
    Quoting,
    Quoted { job: String, ctu: i64, deadline: String },
    Running { job: String },
    Done { job: String },
    Failed { reason: String },
    Cancelled { spent: bool },
}

/// One run at a time, its cancellation flag, and the archive it owns.
#[derive(Default, Debug)]
pub struct RunState {
    running: AtomicBool,
    cancel: AtomicBool,
    confirmed: AtomicBool,
    phase: Mutex<Option<Phase>>,
    archive: Mutex<Option<tempfile::TempDir>>,
    job: Mutex<Option<String>>,
}

/// Clears the run when it ends, however it ends: the flag, the cancellation,
/// and the temporary archive, which goes with the directory holding it.
#[derive(Debug)]
pub struct Running<'a>(&'a RunState);

impl Drop for Running<'_> {
    fn drop(&mut self) {
        self.0.running.store(false, Ordering::Release);
        self.0.cancel.store(false, Ordering::Release);
        *self.0.archive.lock().unwrap() = None;
    }
}

impl RunState {
    pub fn phase(&self) -> Phase {
        self.phase.lock().unwrap().clone().unwrap_or(Phase::Idle)
    }

    fn set(&self, phase: Phase) {
        *self.phase.lock().unwrap() = Some(phase);
    }

    /// Takes the run, or says why it cannot. The words match the ones a local
    /// analysis uses, because to the reader it is the same refusal.
    pub fn begin(&self) -> Result<Running<'_>, String> {
        self.running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "An analysis is already running".to_string())?;
        self.cancel.store(false, Ordering::Release);
        self.confirmed.store(false, Ordering::Release);
        *self.job.lock().unwrap() = None;
        Ok(Running(self))
    }

    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::Release);
    }

    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::Acquire)
    }

    /// True once the confirmation has been posted, which is the moment CTU can
    /// have moved.
    fn spent(&self) -> bool {
        self.confirmed.load(Ordering::Acquire)
    }

    pub fn job(&self) -> Option<String> {
        self.job.lock().unwrap().clone()
    }

    #[cfg(test)]
    fn archive_path(&self) -> Option<PathBuf> {
        self.archive
            .lock()
            .unwrap()
            .as_ref()
            .map(|d| d.path().join("workspace.tar.zst"))
    }
}

/// Authorises an upload, sends the archive to the presigned URL, and waits for
/// the platform to verify it. Returns the input a job can reference.
pub(crate) async fn upload(
    session: &mut Session,
    org: &str,
    packed: &Packed,
    state: Option<&RunState>,
) -> Result<String, String> {
    let authorised = session
        .request(
            Method::POST,
            "/uploads",
            Some(org),
            Some(json!({"declared_sha256": packed.sha256, "declared_size": packed.size})),
        )
        .await?;
    let upload_id = authorised["upload_id"]
        .as_str()
        .ok_or("The platform authorised no upload")?
        .to_owned();
    let put_url = authorised["put_url"]
        .as_str()
        .ok_or("The platform returned no upload address")?
        .to_owned();
    let max_bytes = authorised["max_bytes"].as_u64().unwrap_or(u64::MAX);
    if packed.size > max_bytes {
        // Refused here rather than after the whole archive has travelled.
        return Err(format!(
            "The archive is too large: {} bytes, and this plan allows {max_bytes}.",
            packed.size
        ));
    }

    let bytes = tokio::fs::read(&packed.path)
        .await
        .map_err(|e| format!("Cannot read the archive: {e}"))?;
    let response = session
        .http()
        .put(&put_url)
        .header("Content-Type", "application/zstd")
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("The upload did not complete: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "The upload was refused (HTTP {}).",
            response.status().as_u16()
        ));
    }

    session
        .request(
            Method::POST,
            &format!("/uploads/{upload_id}/complete"),
            Some(org),
            None,
        )
        .await?;

    // The bytes have gone; what follows is the platform checking them, and
    // saying "sending" through that reads as a stalled upload.
    if let Some(state) = state {
        state.set(Phase::Verifying);
    }
    for _ in 0..120 {
        let status = session
            .request(
                Method::GET,
                &format!("/uploads/{upload_id}"),
                Some(org),
                None,
            )
            .await?;
        // The platform's states are authorized, completed, verified, rejected
        // and expired; an input id appears once it is verified.
        match status["state"].as_str().unwrap_or_default() {
            "verified" | "consumed" => {
                return status["input_id"]
                    .as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| "The upload is verified but names no input.".into())
            }
            "expired" => return Err("The upload expired before it was verified.".into()),
            "rejected" => {
                // The platform's own words: it knows why, and rewording loses that.
                return Err(status["reject_reason"]
                    .as_str()
                    .unwrap_or("The upload was rejected.")
                    .to_owned());
            }
            _ => tokio::time::sleep(Duration::from_secs(1)).await,
        }
    }
    Err("The platform did not finish verifying the upload.".into())
}

/// Packs the workspace, uploads it, and creates the job. Stops at the quote:
/// auto_confirm is never sent, so nothing is spent until the user approves.
pub(crate) async fn start(
    state: &RunState,
    session: &mut Session,
    root: PathBuf,
    org: &str,
    tools: Vec<String>,
) -> Result<(), String> {
    let outcome = run_until_quote(state, session, root, org, tools).await;
    if let Err(reason) = &outcome {
        if reason == "Cancelled" {
            state.set(Phase::Cancelled {
                spent: state.spent(),
            });
        } else {
            state.set(Phase::Failed {
                reason: reason.clone(),
            });
        }
    }
    outcome
}

async fn run_until_quote(
    state: &RunState,
    session: &mut Session,
    root: PathBuf,
    org: &str,
    tools: Vec<String>,
) -> Result<(), String> {
    state.set(Phase::Packing { files: 0, bytes: 0 });
    let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let archive = dir.path().join("workspace.tar.zst");
    *state.archive.lock().unwrap() = Some(dir);
    let packed = pack(&root, &archive, &state.cancel)?;

    if state.cancelled() {
        return Err("Cancelled".into());
    }
    state.set(Phase::Uploading {
        files: packed.files,
        total: packed.size,
    });
    let input = upload(session, org, &packed, Some(state)).await?;

    if state.cancelled() {
        return Err("Cancelled".into());
    }
    // The platform sees an upload, not a project. Naming the folder is the only
    // way a history of uploads can say what each one was.
    let label = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut body = json!({
        "input_id": input,
        "allow_partial": true,
        "idempotency_key": uuid::Uuid::new_v4().to_string(),
        "label": label,
    });
    if !tools.is_empty() {
        body["tools"] = json!(tools);
    }
    let job = session
        .request(Method::POST, "/jobs", Some(org), Some(body))
        .await?;
    let id = job["id"]
        .as_str()
        .ok_or("The platform created no job")?
        .to_owned();
    *state.job.lock().unwrap() = Some(id.clone());

    // The job is created before it is priced: the meter runs, then the job
    // parks at awaiting_confirmation carrying its quote. Reading the cost off
    // the creation answer showed zero and invited approval of a real charge.
    state.set(Phase::Quoting);
    for _ in 0..150 {
        if state.cancelled() {
            return Err("Cancelled".into());
        }
        let job = session
            .request(Method::GET, &format!("/jobs/{id}"), Some(org), None)
            .await?;
        match job["status"].as_str().unwrap_or_default() {
            "awaiting_confirmation" => {
                state.set(Phase::Quoted {
                    job: id,
                    ctu: job["reserved_ctu"].as_i64().unwrap_or(0),
                    deadline: job["confirm_deadline"]
                        .as_str()
                        .unwrap_or_default()
                        .to_owned(),
                });
                return Ok(());
            }
            "rejected" => {
                return Err(job["rejection_reason"]
                    .as_str()
                    .unwrap_or("The platform refused the analysis.")
                    .to_owned())
            }
            "completed" | "cancelled" => {
                state.set(Phase::Done { job: id });
                return Ok(());
            }
            _ => tokio::time::sleep(Duration::from_secs(2)).await,
        }
    }
    Err("The platform has not priced this analysis yet.".into())
}

/// Approves the quote and follows the job to its conclusion. This is the call
/// that spends CTU; nothing before it does.
pub(crate) async fn confirm(
    state: &RunState,
    session: &mut Session,
    org: &str,
) -> Result<(), String> {
    let id = state.job().ok_or("No run is waiting for approval")?;
    session
        .request(
            Method::POST,
            &format!("/jobs/{id}/confirm"),
            Some(org),
            None,
        )
        .await?;
    state.confirmed.store(true, Ordering::Release);
    state.set(Phase::Running { job: id.clone() });

    for _ in 0..900 {
        if state.cancelled() {
            let _ = session
                .request(
                    Method::POST,
                    &format!("/jobs/{id}/cancel"),
                    Some(org),
                    None,
                )
                .await;
            state.set(Phase::Cancelled { spent: true });
            return Err("Cancelled".into());
        }
        let job = session
            .request(Method::GET, &format!("/jobs/{id}"), Some(org), None)
            .await?;
        // The statuses are preparing_input, quoting, awaiting_confirmation,
        // queued, running, finalizing, completed, rejected and cancelled.
        // "failed" is a conclusion, not a status, and "succeeded" is neither.
        match job["status"].as_str().unwrap_or_default() {
            "completed" | "rejected" | "cancelled" => {
                state.set(Phase::Done { job: id });
                return Ok(());
            }
            _ => tokio::time::sleep(Duration::from_secs(2)).await,
        }
    }
    Err("The analysis is taking longer than expected; it is still running in the cloud.".into())
}

#[tauri::command]
pub async fn cloud_run_start(
    cloud: tauri::State<'_, Cloud>,
    run: tauri::State<'_, RunState>,
    root: String,
    org: String,
    tools: Vec<String>,
) -> Result<(), String> {
    let _running = run.begin()?;
    let mut session = cloud.0.lock().await;
    start(&run, &mut session, PathBuf::from(root), &org, tools).await
}

#[tauri::command]
pub fn cloud_run_status(run: tauri::State<'_, RunState>) -> Phase {
    run.phase()
}

#[tauri::command]
pub async fn cloud_run_confirm(
    cloud: tauri::State<'_, Cloud>,
    run: tauri::State<'_, RunState>,
    org: String,
) -> Result<(), String> {
    let mut session = cloud.0.lock().await;
    let outcome = confirm(&run, &mut session, &org).await;
    if let Err(reason) = &outcome {
        if reason != "Cancelled" {
            run.set(Phase::Failed {
                reason: reason.clone(),
            });
        }
    }
    outcome
}

#[tauri::command]
pub fn cloud_run_cancel(run: tauri::State<'_, RunState>) {
    run.request_cancel();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::sync::mpsc;

    const UPLOAD_AUTHORISED: &str =
        r#"{"upload_id":"u1","put_url":"{BASE}/put","expires_at":"2030-01-01T00:00:00Z","max_bytes":1048576}"#;
    const UPLOAD_TINY_LIMIT: &str =
        r#"{"upload_id":"u1","put_url":"{BASE}/put","expires_at":"2030-01-01T00:00:00Z","max_bytes":10}"#;
    const VERIFYING: &str = r#"{"upload_id":"u1","state":"verifying"}"#;
    const READY: &str = r#"{"upload_id":"u1","state":"verified","input_id":"in-1"}"#;
    const REJECTED: &str = r#"{"upload_id":"u1","state":"rejected","reject_reason":"too many files"}"#;
    const CREATED_JOB: &str = r#"{"id":"job-1","status":"preparing_input","created_at":"2026-01-01T00:00:00Z","runs":[]}"#;
    const QUOTING_JOB: &str = r#"{"id":"job-1","status":"quoting","created_at":"2026-01-01T00:00:00Z","runs":[]}"#;
    const QUOTED_JOB: &str = r#"{"id":"job-1","status":"awaiting_confirmation","created_at":"2026-01-01T00:00:00Z","runs":[],"quote_id":"q1","reserved_ctu":4000,"confirm_deadline":"2030-01-01T00:00:00Z"}"#;

    /// A platform that answers a scripted list of replies in order and records
    /// the paths it was asked for.
    struct Stub {
        base: String,
        paths: mpsc::Receiver<String>,
    }

    fn stub_platform(replies: Vec<(u16, &'static str)>) -> Stub {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap().to_string();
        let base = format!("http://{address}");
        let (tx, paths) = mpsc::channel();
        let origin = base.clone();
        std::thread::spawn(move || {
            for (status, body) in replies {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut first = String::new();
                reader.read_line(&mut first).unwrap();
                let path = first.split_whitespace().nth(1).unwrap_or("").to_string();
                let _ = tx.send(path);
                let mut length = 0usize;
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).unwrap();
                    if line.to_lowercase().starts_with("content-length:") {
                        length = line.split(':').nth(1).unwrap().trim().parse().unwrap();
                    }
                    if line == "\r\n" {
                        break;
                    }
                }
                let mut body_in = vec![0u8; length];
                let _ = reader.read_exact(&mut body_in);
                let body = body.replace("{BASE}", &origin);
                let response = format!(
                    "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
        });
        Stub { base, paths }
    }

    impl Stub {
        fn session(&self) -> Session {
            Session::for_tests(format!("{}/v1", self.base))
        }
        fn seen(&self) -> Vec<String> {
            let mut out = Vec::new();
            while let Ok(path) = self.paths.try_recv() {
                out.push(path);
            }
            out
        }
    }

    fn workspace() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("work");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("a.c"), b"int a;").unwrap();
        (dir, root)
    }

    fn tiny_archive() -> (tempfile::TempDir, Packed) {
        let (dir, root) = workspace();
        let out = dir.path().join("archive.tar.zst");
        let packed = pack(&root, &out, &AtomicBool::new(false)).unwrap();
        (dir, packed)
    }

    #[tokio::test]
    async fn uploads_then_waits_for_the_input_id() {
        let stub = stub_platform(vec![
            (201, UPLOAD_AUTHORISED),
            (200, ""),
            (202, VERIFYING),
            (200, READY),
        ]);
        let (_dir, packed) = tiny_archive();
        let input = upload(&mut stub.session(), "alpha", &packed, None).await.unwrap();
        assert_eq!(input, "in-1");
        assert_eq!(
            stub.seen(),
            vec![
                "/v1/uploads",
                "/put",
                "/v1/uploads/u1/complete",
                "/v1/uploads/u1"
            ]
        );
    }

    #[tokio::test]
    async fn the_upload_is_finished_when_the_platform_says_verified() {
        // The states are authorized, completed, verified, rejected and expired.
        // Waiting for a "ready" that never comes cost two minutes and then
        // failed an upload the platform had accepted in three seconds.
        let stub = stub_platform(vec![
            (201, UPLOAD_AUTHORISED),
            (200, ""),
            (202, VERIFYING),
            (200, r#"{"upload_id":"u1","state":"completed"}"#),
            (200, r#"{"upload_id":"u1","state":"verified","input_id":"in-7"}"#),
        ]);
        let (_dir, packed) = tiny_archive();
        let input = upload(&mut stub.session(), "alpha", &packed, None)
            .await
            .unwrap();
        assert_eq!(input, "in-7");
    }

    #[tokio::test]
    async fn an_expired_upload_says_so_rather_than_waiting() {
        let stub = stub_platform(vec![
            (201, UPLOAD_AUTHORISED),
            (200, ""),
            (202, VERIFYING),
            (200, r#"{"upload_id":"u1","state":"expired"}"#),
        ]);
        let (_dir, packed) = tiny_archive();
        let err = upload(&mut stub.session(), "alpha", &packed, None)
            .await
            .unwrap_err();
        assert!(err.contains("expired"), "err = {err}");
    }

    #[tokio::test]
    async fn an_archive_over_the_authorised_size_is_refused_before_it_travels() {
        let stub = stub_platform(vec![(201, UPLOAD_TINY_LIMIT)]);
        let (_dir, packed) = tiny_archive();
        let err = upload(&mut stub.session(), "alpha", &packed, None)
            .await
            .unwrap_err();
        assert!(err.contains("too large"), "err = {err}");
        assert_eq!(stub.seen(), vec!["/v1/uploads"], "nothing was sent");
    }

    #[tokio::test]
    async fn a_rejected_upload_is_reported_in_the_platforms_words() {
        let stub = stub_platform(vec![
            (201, UPLOAD_AUTHORISED),
            (200, ""),
            (202, VERIFYING),
            (200, REJECTED),
        ]);
        let (_dir, packed) = tiny_archive();
        let err = upload(&mut stub.session(), "alpha", &packed, None)
            .await
            .unwrap_err();
        assert!(err.contains("too many files"), "err = {err}");
    }

    #[tokio::test]
    async fn the_run_parks_on_its_quote_and_spends_nothing_until_confirmed() {
        let stub = stub_platform(vec![
            (201, UPLOAD_AUTHORISED),
            (200, ""),
            (202, VERIFYING),
            (200, READY),
            (201, CREATED_JOB),
            (200, QUOTING_JOB),
            (200, QUOTED_JOB),
        ]);
        let state = RunState::default();
        let (_dir, root) = workspace();
        start(&state, &mut stub.session(), root, "alpha", vec![])
            .await
            .unwrap();

        match state.phase() {
            Phase::Quoted { ctu, ref job, .. } => {
                assert_eq!(ctu, 4000);
                assert_eq!(job, "job-1");
            }
            other => panic!("phase = {other:?}"),
        }
        assert!(
            !stub.seen().iter().any(|p| p.ends_with("/confirm")),
            "nothing was confirmed"
        );
    }

    #[tokio::test]
    async fn the_cost_is_read_after_the_platform_has_priced_the_job() {
        // A job is created before it is priced. Reading the cost off the
        // creation answer showed 0 CTU and invited approval of a real charge.
        let stub = stub_platform(vec![
            (201, UPLOAD_AUTHORISED),
            (200, ""),
            (202, VERIFYING),
            (200, READY),
            (201, CREATED_JOB),
            (200, QUOTING_JOB),
            (200, QUOTED_JOB),
        ]);
        let state = RunState::default();
        let (_dir, root) = workspace();
        start(&state, &mut stub.session(), root, "alpha", vec![])
            .await
            .unwrap();
        match state.phase() {
            Phase::Quoted { ctu, .. } => assert_eq!(ctu, 4000, "the priced total, not the empty one"),
            other => panic!("phase = {other:?}"),
        }
    }

    #[tokio::test]
    async fn a_refused_analysis_says_why_instead_of_quoting_nothing() {
        let stub = stub_platform(vec![
            (201, UPLOAD_AUTHORISED),
            (200, ""),
            (202, VERIFYING),
            (200, READY),
            (201, CREATED_JOB),
            (200, r#"{"id":"job-1","status":"rejected","rejection_reason":"insufficient CTU","created_at":"2026-01-01T00:00:00Z","runs":[]}"#),
        ]);
        let state = RunState::default();
        let (_dir, root) = workspace();
        let err = start(&state, &mut stub.session(), root, "alpha", vec![])
            .await
            .unwrap_err();
        assert!(err.contains("insufficient CTU"), "err = {err}");
    }

    #[tokio::test]
    async fn cancelling_before_the_quote_is_approved_confirms_nothing() {
        let stub = stub_platform(vec![]);
        let state = RunState::default();
        let (_dir, root) = workspace();
        state.request_cancel();
        let err = start(&state, &mut stub.session(), root, "alpha", vec![])
            .await
            .unwrap_err();
        assert_eq!(err, "Cancelled");
        assert_eq!(state.phase(), Phase::Cancelled { spent: false });
        assert!(stub.seen().is_empty(), "nothing reached the platform");
    }

    #[tokio::test]
    async fn the_run_finishes_when_the_platform_says_completed() {
        // Waiting for a "succeeded" the platform never sends would have polled
        // for half an hour after the user had already paid.
        let stub = stub_platform(vec![
            (200, r#"{"id":"job-1","status":"queued","created_at":"2026-01-01T00:00:00Z","runs":[]}"#),
            (200, r#"{"id":"job-1","status":"running","created_at":"2026-01-01T00:00:00Z","runs":[]}"#),
            (200, r#"{"id":"job-1","status":"completed","conclusion":"findings","created_at":"2026-01-01T00:00:00Z","runs":[]}"#),
        ]);
        let state = RunState::default();
        *state.job.lock().unwrap() = Some("job-1".into());
        confirm(&state, &mut stub.session(), "alpha").await.unwrap();
        assert_eq!(
            state.phase(),
            Phase::Done {
                job: "job-1".into()
            }
        );
    }

    #[tokio::test]
    async fn a_second_run_is_refused_while_one_is_going() {
        let state = RunState::default();
        let _guard = state.begin().unwrap();
        assert_eq!(
            state.begin().unwrap_err(),
            "An analysis is already running"
        );
    }

    #[tokio::test]
    async fn the_temporary_archive_is_gone_when_the_run_ends() {
        let stub = stub_platform(vec![(500, r#"{"title":"nope"}"#)]);
        let state = RunState::default();
        let (_dir, root) = workspace();
        {
            let _running = state.begin().unwrap();
            let _ = start(&state, &mut stub.session(), root, "alpha", vec![]).await;
            assert!(
                state.archive_path().is_some_and(|p| p.exists()),
                "the archive exists while the run does"
            );
        }
        assert!(
            state.archive_path().is_none(),
            "the archive goes when the run ends"
        );
    }

    #[tokio::test]
    async fn a_failed_run_says_what_the_platform_said() {
        let stub = stub_platform(vec![(500, r#"{"title":"Storage unavailable"}"#)]);
        let state = RunState::default();
        let (_dir, root) = workspace();
        let _ = start(&state, &mut stub.session(), root, "alpha", vec![]).await;
        match state.phase() {
            Phase::Failed { reason } => assert!(
                reason.contains("Storage unavailable"),
                "reason = {reason}"
            ),
            other => panic!("phase = {other:?}"),
        }
    }
}
