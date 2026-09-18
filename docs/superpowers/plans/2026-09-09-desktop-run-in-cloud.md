# Run in Cloud (Desktop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a folder opened in CoreTrace Desktop be analysed in the cloud — packed, uploaded, priced, confirmed and reported — instead of only locally.

**Architecture:** A new `src-tauri/src/cloud_run.rs` owns the pipeline, reusing the authenticated session `cloud.rs` already holds. The workspace is streamed into a tar+zstd archive while being hashed, uploaded to the presigned URL the platform returns, and turned into a job that parks on its quote until the user approves it. Progress is polled by the frontend, matching how the desktop already reports local analyses, and cancellation reuses the `oneshot` plus `AtomicBool` idiom in `analysis.rs`.

**Tech Stack:** Rust with tokio, reqwest, sha2, tempfile (all present) plus `tar` and `zstd`; React 19 for the panel; Go 1.27 and oapi-codegen v2.8.0 for the one control-plane change.

**Design:** `docs/superpowers/specs/2026-09-09-desktop-run-in-cloud-design.md`

## Global Constraints

- The archive format is **tar wrapped in zstd**. `pkg/archive/extract.go` in the control plane reads tar through `zstd`; nothing else is accepted.
- `POST /uploads` requires `declared_sha256` and `declared_size` **before** the bytes are sent, so the archive is written to a temporary file and hashed as it is written, never buffered in memory.
- **`auto_confirm` is never sent.** No CTU moves until `POST /jobs/{id}/confirm`, and that call happens only after the user clicks.
- The temporary archive is deleted when the run ends — success, failure or cancellation.
- One cloud run at a time, refused with the exact words `analysis.rs:333` uses: `An analysis is already running`.
- Progress is **polled**, never pushed. The desktop emits no Tauri events anywhere; do not introduce them for this.
- Control-plane route or schema changes go in `openapi/openapi.yaml` first, then regenerate with the pinned **v2.8.0**: `go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.0 -config oapi-codegen.yaml openapi.yaml` from `openapi/`, then `gofmt -w internal/httpapi/gen`. Other versions rewrite hundreds of unrelated lines.
- Control tests need Docker (testcontainers). Where it is unavailable, `go test -short ./...` skips them and CI is the first real run.
- Commit per task, on a branch, Conventional Commits, no AI attribution trailer.

## File Structure

**coretrace-control**

| File | Responsibility |
|---|---|
| `openapi/openapi.yaml` (modify) | `reserved_ctu` on the `Job` schema. |
| `internal/jobs/view.go` (modify) | `View.ReservedCTU`, summed from `quote_items`. |
| `internal/httpapi/job_handlers.go` (modify) | Carries it into the generated `gen.Job`. |

**coretrace-gui**

| File | Responsibility |
|---|---|
| `src-tauri/src/pack.rs` (create) | Walking the workspace and writing the tar+zstd archive, hashing as it goes. Nothing about HTTP. |
| `src-tauri/src/cloud_run.rs` (create) | The pipeline: authorise, upload, complete, wait, create job, confirm, follow. Nothing about files. |
| `src-tauri/src/cloud.rs` (modify) | Exposes `request` to `cloud_run` and gains nothing else; it is already 600 lines. |
| `src-tauri/src/lib.rs` (modify) | Registers the commands and the run state. |
| `desktop/bridge.ts` (modify) | `startCloudRun`, `cloudRunStatus`, `confirmCloudRun`, `cancelCloudRun`. |
| `desktop/features/CloudRun.tsx` (create) | The panel: phase, quote, confirm, cancel. |
| `desktop/features/Analyses.tsx` (modify) | Renders the panel and tags cloud findings by origin. |

---

### Task 1: The quoted cost, readable from the job

**Files:**
- Modify: `openapi/openapi.yaml` (the `Job` schema), `internal/jobs/view.go:48-70`, `internal/httpapi/job_handlers.go:207`
- Test: `internal/jobs/view_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `jobs.View.ReservedCTU int64`, and `reserved_ctu` (integer, int64, optional) on the `Job` schema — the total the desktop shows before spending.

- [ ] **Step 1: Write the failing test**

```go
func TestViewCarriesTheQuotedTotal(t *testing.T) {
	// The desktop must show what a run will cost before the user approves it,
	// and the amount is otherwise published only as a job.quoted SSE event.
	env := testutil.Env(t)
	f := newJobsFixture(t, env)
	job := f.jobAwaitingConfirmation(t, 1500, 2500)
	v, err := Get(context.Background(), env.Worker, f.org, job)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if v.ReservedCTU != 4000 {
		t.Errorf("reserved = %d, want the sum of the quote's items", v.ReservedCTU)
	}
}
```

Build the fixture from whatever the existing tests in `internal/jobs` already use; if they insert quotes inline, extract a helper `jobAwaitingConfirmation(t, itemCTU ...int64)` that inserts a `quotes` row, one `quote_items` row per amount, and a `jobs` row referencing it.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/jobs/ -run TestViewCarriesTheQuotedTotal -v`
Expected: FAIL — `v.ReservedCTU` undefined.

- [ ] **Step 3: Write minimal implementation**

In `internal/jobs/view.go`, add the field beside `QuoteID`:

```go
	QuoteID string `json:"quote_id,omitempty"`
	// ReservedCTU is what the quote reserves in total. A cost the user must
	// approve belongs on the resource, not only on the event stream.
	ReservedCTU int64 `json:"reserved_ctu,omitempty"`
```

and in `Get`, read it in the same round trip:

```go
	err := q.QueryRow(ctx, `SELECT j.id, j.status::text, j.conclusion::text, j.rejection_reason, j.quote_id, j.confirm_deadline, j.created_at,
		COALESCE((SELECT sum(qi.reserved_ctu) FROM quote_items qi WHERE qi.org_id = j.org_id AND qi.quote_id = j.quote_id), 0)
		FROM jobs j WHERE j.org_id = $1 AND j.id = $2`, org, jobID).
		Scan(&v.ID, &v.Status, &conclusion, &v.RejectionReason, &quoteID, &v.ConfirmDeadline, &v.CreatedAt, &v.ReservedCTU)
```

In `openapi/openapi.yaml`, under the `Job` schema's properties, beside `quote_id`:

```yaml
        reserved_ctu:
          type: integer
          format: int64
          description: What the quote reserves in total, so a client can show the cost before confirming.
```

Regenerate with the pinned command from Global Constraints. In `internal/httpapi/job_handlers.go`, inside `toGenJob`:

```go
	if v.ReservedCTU > 0 {
		reserved := v.ReservedCTU
		out.ReservedCtu = &reserved
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./... -count=1` (or `go test -short ./...` without Docker), then `go test ./internal/httpapi -run TestContractCoversEveryRoute`
Expected: PASS, and `git diff internal/httpapi/gen/api.gen.go` touches only the new field.

- [ ] **Step 5: Commit**

```bash
git add openapi/openapi.yaml internal/jobs internal/httpapi
git commit -m "feat(api): say what a quoted job will cost"
```

---

### Task 2: Packing the workspace

**Files:**
- Create: `src-tauri/src/pack.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` (add `mod pack;`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pub struct Packed { pub path: std::path::PathBuf, pub sha256: String, pub size: u64, pub files: usize }`
  - `pub fn pack(root: &Path, into: &Path, cancel: &AtomicBool) -> Result<Packed, String>` — writes `into`, returns the digest and byte count of what it wrote.
  - `pub fn excluded(name: &str) -> bool` — directory names an analysis never reads.

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn packs_the_tree_and_skips_what_an_analysis_never_reads() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/main.c"), b"int main(void) { return 0; }").unwrap();
    std::fs::create_dir_all(root.join("node_modules/x")).unwrap();
    std::fs::write(root.join("node_modules/x/huge.js"), b"noise").unwrap();
    std::fs::create_dir_all(root.join(".git")).unwrap();
    std::fs::write(root.join(".git/config"), b"noise").unwrap();

    let out = dir.path().join("archive.tar.zst");
    let packed = pack(root, &out, &AtomicBool::new(false)).unwrap();

    assert_eq!(packed.files, 1, "only the source file belongs in the archive");
    assert_eq!(packed.size, std::fs::metadata(&out).unwrap().len());
    assert_eq!(packed.sha256.len(), 64);

    let names = entry_names(&out);
    assert!(names.iter().any(|n| n.ends_with("src/main.c")));
    assert!(!names.iter().any(|n| n.contains("node_modules")));
    assert!(!names.iter().any(|n| n.contains(".git")));
}

#[test]
fn the_digest_matches_the_bytes_the_platform_will_receive() {
    // /uploads is told the hash and size before the bytes are sent; if they
    // disagree the upload is rejected after the whole archive has travelled.
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.c"), b"int a;").unwrap();
    let out = dir.path().join("archive.tar.zst");
    let packed = pack(dir.path(), &out, &AtomicBool::new(false)).unwrap();

    let bytes = std::fs::read(&out).unwrap();
    assert_eq!(packed.sha256, sha256_hex(&bytes));
    assert_eq!(packed.size, bytes.len() as u64);
}

#[test]
fn cancelling_stops_the_walk_and_leaves_no_archive() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.c"), b"int a;").unwrap();
    let out = dir.path().join("archive.tar.zst");
    assert!(pack(dir.path(), &out, &AtomicBool::new(true)).is_err());
    assert!(!out.exists(), "a cancelled pack must not leave a partial archive");
}
```

Write two helpers in the test module: `entry_names(path)` opens the archive, wraps it in `zstd::Decoder`, hands that to `tar::Archive`, and collects each entry path as a string; `sha256_hex(bytes)` hashes with `Sha256` and formats each byte as two hex characters, the same way `cloud.rs` already does.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pack`
Expected: FAIL — `pack` is not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:

```toml
tar = "0.4"
zstd = "0.13"
```

`pack.rs` walks the tree depth-first with an explicit stack, so a deep tree cannot exhaust the call stack. It skips directories whose name `excluded` matches and skips symbolic links, appending each file to a `tar::Builder` writing into a `zstd::Encoder` that wraps a `HashingWriter`. `HashingWriter` is a small `std::io::Write` that feeds every byte to `Sha256` and counts it before passing it to the file — that is what makes the digest and the size describe exactly the bytes written, with no second pass. Check `cancel` once per file; on cancellation remove the partial file and return `Err("Cancelled".into())`.

```rust
/// Directories an analysis never reads. Sending them costs upload time and CTU
/// for nothing, and node_modules alone routinely dwarfs the sources.
pub fn excluded(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | "build" | "dist" | ".next" | ".venv" | "__pycache__"
    )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pack`
Expected: PASS, three tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/pack.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): pack a workspace into the archive the platform accepts"
```

---

### Task 3: Uploading the archive

**Files:**
- Create: `src-tauri/src/cloud_run.rs`
- Modify: `src-tauri/src/cloud.rs` (make the session's `request` reachable from `cloud_run`), `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `pack::Packed` (Task 2).
- Produces: `pub(crate) async fn upload(session: &mut Session, org: &str, packed: &Packed) -> Result<String, String>` — returns the `input_id` a job will reference.

- [ ] **Step 1: Write the failing test**

```rust
#[tokio::test]
async fn uploads_then_waits_for_the_input_id() {
    // The platform authorises, takes the bytes on a presigned URL, verifies,
    // and only then names the input a job can use.
    let stub = stub_platform(vec![
        ("POST", "/v1/uploads", 201, UPLOAD_AUTHORISED),
        ("PUT", "/put", 200, ""),
        ("POST", "/v1/uploads/u1/complete", 202, VERIFYING),
        ("GET", "/v1/uploads/u1", 200, READY),
    ]);
    let input = upload(&mut stub.session(), "alpha", &tiny_archive()).await.unwrap();
    assert_eq!(input, "in-1");
    assert_eq!(
        stub.paths(),
        vec!["/v1/uploads", "/put", "/v1/uploads/u1/complete", "/v1/uploads/u1"]
    );
}

#[tokio::test]
async fn an_archive_over_the_authorised_size_is_refused_before_it_travels() {
    let stub = stub_platform(vec![("POST", "/v1/uploads", 201, UPLOAD_AUTHORISED_TINY_LIMIT)]);
    let err = upload(&mut stub.session(), "alpha", &tiny_archive()).await.unwrap_err();
    assert!(err.contains("too large"), "err = {err}");
    assert_eq!(stub.paths(), vec!["/v1/uploads"], "nothing was sent");
}

#[tokio::test]
async fn a_rejected_upload_is_reported_in_the_platforms_words() {
    let stub = stub_platform(vec![
        ("POST", "/v1/uploads", 201, UPLOAD_AUTHORISED),
        ("PUT", "/put", 200, ""),
        ("POST", "/v1/uploads/u1/complete", 202, VERIFYING),
        ("GET", "/v1/uploads/u1", 200, REJECTED_TOO_MANY_FILES),
    ]);
    let err = upload(&mut stub.session(), "alpha", &tiny_archive()).await.unwrap_err();
    assert!(err.contains("too many files"), "err = {err}");
}
```

Define the four response constants in the test module, with `{BASE}` where the presigned URL goes so `stub_platform` can substitute its own address:

```rust
const UPLOAD_AUTHORISED: &str = r#"{"upload_id":"u1","put_url":"{BASE}/put","expires_at":"2030-01-01T00:00:00Z","max_bytes":1048576}"#;
const UPLOAD_AUTHORISED_TINY_LIMIT: &str = r#"{"upload_id":"u1","put_url":"{BASE}/put","expires_at":"2030-01-01T00:00:00Z","max_bytes":10}"#;
const VERIFYING: &str = r#"{"upload_id":"u1","state":"verifying"}"#;
const READY: &str = r#"{"upload_id":"u1","state":"ready","input_id":"in-1"}"#;
const REJECTED_TOO_MANY_FILES: &str = r#"{"upload_id":"u1","state":"rejected","reject_reason":"too many files"}"#;
```

`stub_platform` extends the fake HTTP server `cloud.rs`'s tests already build (`fake_response`) to answer a scripted list of method/path/status/body tuples and record the paths it saw. `tiny_archive` packs a one-file temporary directory with `pack::pack`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud_run`
Expected: FAIL — `upload` is not defined.

- [ ] **Step 3: Write minimal implementation**

`upload` posts `{"declared_sha256": packed.sha256, "declared_size": packed.size}` to `/uploads`. When the authorised `max_bytes` is smaller than `packed.size` it returns, before sending anything:

```rust
return Err(format!(
    "The archive is too large: {} bytes, and this plan allows {}.",
    packed.size, max_bytes
));
```

Otherwise it `PUT`s the file as a streaming body to `put_url`, posts `/uploads/{id}/complete`, then polls `GET /uploads/{id}` once a second for at most 120 attempts, returning `input_id` when `state` is `ready` and the platform's `reject_reason` verbatim when it is `rejected`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud_run`
Expected: PASS, three tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud_run.rs src-tauri/src/cloud.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): upload a packed workspace to the platform"
```

---

### Task 4: The run, its quote and its cancellation

**Files:**
- Modify: `src-tauri/src/cloud_run.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `upload` (Task 3), `pack` (Task 2), `reserved_ctu` on the job view (Task 1).
- Produces:
  - `pub struct RunState` holding `cancel: Mutex<Option<oneshot::Sender<()>>>`, `running: AtomicBool`, `phase: Mutex<Phase>`, and the run's `TempDir`.
  - `#[derive(Serialize, Clone, Debug)] pub enum Phase` with variants `Idle`, `Packing { files: usize, bytes: u64 }`, `Uploading { sent: u64, total: u64 }`, `Verifying`, `Quoted { job: String, ctu: i64, deadline: String }`, `Running { job: String }`, `Done { job: String }`, `Failed { reason: String }`, `Cancelled { spent: bool }`, serialised with a `phase` tag so the frontend reads `{"phase":"quoted",...}`.
  - commands `cloud_run_start(root: String, org: String)`, `cloud_run_status() -> Phase`, `cloud_run_confirm()`, `cloud_run_cancel()`.

- [ ] **Step 1: Write the failing test**

```rust
#[tokio::test]
async fn the_run_parks_on_its_quote_and_spends_nothing_until_confirmed() {
    let stub = stub_platform(vec![
        ("POST", "/v1/uploads", 201, UPLOAD_AUTHORISED),
        ("PUT", "/put", 200, ""),
        ("POST", "/v1/uploads/u1/complete", 202, VERIFYING),
        ("GET", "/v1/uploads/u1", 200, READY),
        ("POST", "/v1/jobs", 201, QUOTED_JOB),
    ]);
    let state = RunState::default();
    start(&state, &mut stub.session(), workspace(), "alpha").await.unwrap();

    match state.phase() {
        Phase::Quoted { ctu, .. } => assert_eq!(ctu, 4000),
        other => panic!("phase = {other:?}"),
    }
    assert!(
        !stub.paths().iter().any(|p| p.ends_with("/confirm")),
        "nothing was confirmed"
    );
}

#[tokio::test]
async fn cancelling_before_the_quote_is_approved_confirms_nothing() {
    let stub = stub_platform(vec![("POST", "/v1/uploads", 201, UPLOAD_AUTHORISED)]);
    let state = RunState::default();
    state.request_cancel();
    let err = start(&state, &mut stub.session(), workspace(), "alpha").await.unwrap_err();
    assert!(err.contains("Cancelled"), "err = {err}");
    assert!(matches!(state.phase(), Phase::Cancelled { spent: false }));
}

#[tokio::test]
async fn a_second_run_is_refused_while_one_is_going() {
    let state = RunState::default();
    let _guard = state.begin().unwrap();
    assert_eq!(state.begin().unwrap_err(), "An analysis is already running");
}

#[tokio::test]
async fn the_temporary_archive_is_gone_when_the_run_ends() {
    let stub = stub_platform(vec![("POST", "/v1/uploads", 500, "")]);
    let state = RunState::default();
    let _ = start(&state, &mut stub.session(), workspace(), "alpha").await;
    assert!(state.archive_path().map_or(true, |p| !p.exists()));
}
```

Add the job constant beside the upload ones:

```rust
const QUOTED_JOB: &str = r#"{"id":"job-1","status":"awaiting_confirmation","created_at":"2026-01-01T00:00:00Z","runs":[],"quote_id":"q1","reserved_ctu":4000,"confirm_deadline":"2030-01-01T00:00:00Z"}"#;
```

`workspace()` creates a temporary directory with one `.c` file and returns its path.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud_run`
Expected: FAIL — `RunState` and `start` are not defined.

- [ ] **Step 3: Write minimal implementation**

`start` sets `Phase::Packing`, packs into a `TempDir` the run owns, sets `Phase::Uploading`, calls `upload`, sets `Phase::Verifying`, then posts to `/jobs` with `{"input_id":…, "tools":…, "allow_partial":true, "idempotency_key":…}` and **no `auto_confirm`**, reading `reserved_ctu` and `confirm_deadline` from the answer into `Phase::Quoted`. It returns there.

Nothing further happens until `cloud_run_confirm` posts `/jobs/{id}/confirm` and moves to `Phase::Running`, which polls `GET /jobs/{id}` every two seconds until the status is terminal, then `Phase::Done`.

`begin` is the guard: `compare_exchange` on `running` returning `Err("An analysis is already running".into())` when it is already true, and a guard whose `Drop` clears `running`, clears `cancel`, and drops the `TempDir` so the archive goes with it. `request_cancel` sets the flag `pack` watches and fires the `oneshot`; `Phase::Cancelled { spent }` is `true` only when the confirmation had already been posted.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, every test in the crate.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud_run.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): quote a cloud run and wait for the user to approve it"
```

---

### Task 5: The panel

**Files:**
- Create: `desktop/features/CloudRun.tsx`, `desktop/features/CloudRun.test.tsx`
- Modify: `desktop/bridge.ts`, `desktop/features/Analyses.tsx`

**Interfaces:**
- Consumes: the four commands from Task 4.
- Produces: `<CloudRun workspace={string} org={string} notify={(message: string) => void} />`; bridge methods `startCloudRun(root, org)`, `cloudRunStatus()`, `confirmCloudRun()`, `cancelCloudRun()`.

- [ ] **Step 1: Write the failing test**

```tsx
it("shows the cost and spends nothing until the user approves", async () => {
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({
    phase: "quoted",
    job: "job-1",
    ctu: 4000,
    deadline: "2030-01-01T00:00:00Z",
  });
  render(<CloudRun workspace="C:/work/app" org="alpha" notify={vi.fn()} />);
  expect(await screen.findByText(/4\s?000/)).toBeDefined();
  expect(desktop.confirmCloudRun).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /Lancer/ }));
  expect(desktop.confirmCloudRun).toHaveBeenCalled();
});

it("can be cancelled while it is packing", async () => {
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({
    phase: "packing",
    files: 12,
    bytes: 4096,
  });
  render(<CloudRun workspace="C:/work/app" org="alpha" notify={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: /Annuler/ }));
  expect(desktop.cancelCloudRun).toHaveBeenCalled();
});

it("says what the platform said when a run fails", async () => {
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({
    phase: "failed",
    reason: "too many files",
  });
  render(<CloudRun workspace="C:/work/app" org="alpha" notify={vi.fn()} />);
  expect(await screen.findByText(/too many files/)).toBeDefined();
});
```

Mock the bridge the way `desktop/features/Settings.test.tsx` already does, with `vi.mock("../bridge", …)` returning the four functions.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run desktop/features/CloudRun.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`CloudRun` polls `cloudRunStatus` every second while a run is active, renders the phase in French to match the rest of the desktop, and offers **Annuler** in every active phase and **Lancer l'analyse** only in `quoted`, beside the CTU figure and the deadline. `Analyses.tsx` renders it above the local result, passing the open workspace and the selected organisation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add desktop/features/CloudRun.tsx desktop/features/CloudRun.test.tsx desktop/bridge.ts desktop/features/Analyses.tsx
git commit -m "feat(desktop): run the open folder in the cloud, once the cost is approved"
```

---

### Task 6: Cloud findings in the editor

**Files:**
- Modify: `desktop/features/Analyses.tsx`, `desktop/types.ts`
- Test: `desktop/features/Analyses.test.tsx`

**Interfaces:**
- Consumes: `parseFindings` as it exists in `Analyses.tsx`, and the report the bridge already fetches through `desktop.report(org, job, run)`.
- Produces: `origin: "local" | "cloud"` on the finding shape the editor consumes.

- [ ] **Step 1: Write the failing test**

```tsx
it("marks where a finding came from", () => {
  // A finding the cloud produced and one found locally look identical
  // otherwise, and the reader cannot tell which machine ran the tool.
  expect(parseFindings(SARIF_WITH_ONE_RESULT, "cloud")[0].origin).toBe("cloud");
  expect(parseFindings(SARIF_WITH_ONE_RESULT, "local")[0].origin).toBe("local");
});
```

Reuse whatever SARIF sample `Analyses.test.tsx` already defines for its existing findings tests rather than writing a second one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run desktop/features/Analyses.test.tsx`
Expected: FAIL — `parseFindings` takes one argument.

- [ ] **Step 3: Write minimal implementation**

Give `parseFindings` a second parameter `origin: "local" | "cloud"` and set it on every finding it returns. The local caller passes `"local"`, the cloud report passes `"cloud"`, and the findings list shows a small marker on cloud findings so the two are distinguishable in one list.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/features/Analyses.tsx desktop/features/Analyses.test.tsx desktop/types.ts
git commit -m "feat(desktop): say which findings the cloud produced"
```

---

## Self-review

**Spec coverage.** Design section 1 (where the pipeline lives) → Tasks 2 and 3. Section 2 (the pipeline) → Tasks 2, 3 and 4. Section 3 (progress and cancellation) → Task 4 for the state, Task 5 for the display, and the correction about the quoted cost → Task 1. Section 4 (findings in the editor) → Task 6. Section 5 (failures) → Task 3 for the size cap and the rejection, Task 4 for cancellation and the archive's removal. Section 6 (testing) → the test steps throughout.

**Deliberately not covered:** the `put_url` expiry retry from the failure table. One retry with a fresh authorisation is worth having, but it needs a stub that can expire a URL mid-body, and the design gives it a single line. Add it once a real run has proven the happy path, rather than building an untested recovery for a failure never observed.

**Placeholders.** None. Every code step carries its code; the four places that say to reuse an existing helper name the file so the engineer confirms a real signature instead of inventing one.

**Type consistency.** `Packed` (Task 2) is consumed by `upload` (Task 3). The `input_id` `upload` returns is consumed by `start` (Task 4). `Phase` (Task 4) is serialised to exactly the shape Task 5's tests assert. `reserved_ctu` (Task 1) is what Task 4 reads into `Phase::Quoted` and Task 5 displays.

## Known risks

- **Nothing here exercises the real platform.** A real run spends the organisation's CTU, so the stub proves the shape of the conversation and not that the platform agrees with it. One real run on a small folder is required before this is called done, and its outcome recorded.
- `zstd` builds a C library through `zstd-sys`. It should compile with the MSVC toolchain the desktop already uses, but it is the first such dependency here; if the build fails, `zstd` has a pure-Rust fallback feature to try before abandoning the format.
- Task 1 changes the control plane, so the desktop cannot show a cost until that is deployed. Tasks 2 to 4 do not depend on it; only Task 5's display does.
