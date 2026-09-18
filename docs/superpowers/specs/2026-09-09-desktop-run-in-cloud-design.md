# Run in cloud, for a folder opened locally

Date: 2026-09-09
Status: design, approved for planning
Repository: coretrace-gui (`feat/tauri-react-desktop`)

## The problem

Open a folder in CoreTrace Desktop and the only analysis on offer is the local one, which is why
the application insists on being pointed at a `ctrace` executable before it will do anything. There
is no way to spend CTU on the workspace in front of you.

That is not a limit of the platform. `POST /v1/uploads`, `POST /v1/uploads/{id}/complete`,
`GET /v1/uploads/{id}` and `POST /v1/jobs` all exist, and `ctrace-cloud run --path ./sample` uses
them today through `@coretrace/cli-core`'s `uploadArchive`.

The desktop simply does not call them. `src-tauri/src/cloud.rs` reaches the cloud only through
`/orgs/{org}/scm/installations/{id}/repos/{repo}/analyses` (line 372), so a cloud analysis requires
a repository connected through GitHub. A folder on disk has no path to the cloud at all.

The capability existed and was lost. The Electron application had `src/main/cloud/cloudRun.js`
(commit `cc5a38f`), which packed a `rootPath`, quoted the cost, waited for confirmation and streamed
the job. The Tauri rewrite did not carry it over.

The application even says so: `desktop/features/Analyses.tsx:342` warns that "Les modifications
locales ne seront pas envoyées" — which is precisely the gap.

## Decisions taken

1. **The whole workspace goes up, filtered** — everything under the opened folder except what an
   analysis never reads. The same set `ctrace-cloud run --path` sends.
2. **Nothing is spent without a click.** The quote is shown and the run waits.
3. **Progress, cancellation and findings in the editor** are all in the first version.

## 1. Where the pipeline lives

`@coretrace/cli-core` cannot be reused: it needs Node and a filesystem, and the Tauri webview has
neither. The pipeline is therefore Rust, in a new `src-tauri/src/cloud_run.rs`, using the
authenticated session `cloud.rs` already owns.

It is a new file rather than an addition to `cloud.rs`, which is already 600 lines carrying
sessions, the device login and the SCM calls. A multi-phase pipeline on top would make it the file
that does everything.

Two crates are added: `tar` and `zstd`. `pkg/archive/extract.go` in the control plane reads tar
streams through `zstd`, so that is the format the platform accepts. `reqwest`, `tokio`, `sha2`,
`uuid` and `tempfile` are already dependencies.

## 2. The pipeline

```
pack  →  POST /uploads {declared_sha256, declared_size}  →  PUT put_url
      →  POST /uploads/{id}/complete
      →  poll GET /uploads/{id} until it carries input_id
      →  POST /jobs {input_id, tools, allow_partial}          (auto_confirm is never sent)
      →  quote shown; on confirmation  POST /jobs/{id}/confirm
      →  poll GET /jobs/{id} until terminal  →  GET /jobs/{id}/runs/{run}/report
```

Packing walks the opened folder and skips directories an analysis never reads: `.git`,
`node_modules`, `target`, `build`, `dist`, `.next`, and any path the workspace's own `.gitignore`
excludes when one is present. Entries are streamed into tar+zstd in a `tempfile` and hashed while
they are written, so the SHA-256 and byte count the platform demands up front cost no second pass
over the tree.

The archive is deleted when the run ends, whatever the outcome.

## 3. Progress and cancellation

The state mirrors `src-tauri/src/analysis.rs:22` exactly, because that is how this codebase already
expresses a cancellable long-running job: a `cancel: Mutex<Option<oneshot::Sender<()>>>` beside a
`running: AtomicBool`, a guard type that clears both on drop, and `tokio::select!` against the
cancel receiver at every await point that can block.

Progress is **polled**, not pushed: the desktop emits no Tauri events anywhere today, and the
frontend already polls for jobs. A `cloud_run_status` command returns the current phase.

| Phase | Carries |
|---|---|
| `packing` | files walked so far, bytes written |
| `uploading` | bytes sent, total |
| `verifying` | — |
| `quoted` | CTU cost, remaining balance, confirm deadline |
| `running` | job id |
| `done` | job id |
| `failed` | reason, in the platform's words where it gave one |
| `cancelled` | whether anything was spent |

**Correction, 2026-09-09.** This design assumed the CTU cost could be read by polling
`GET /jobs/{id}`. It cannot: that view carries `quote_id` and `confirm_deadline` but no amount, and
the total is published only as a `job.quoted` event on the SSE stream
(`internal/jobs/service.go:342`). Rather than give the desktop an event-stream client for one
number, the control plane exposes it: a cost the user must approve should be readable from the job,
not only from a transient stream. `sum(quote_items.reserved_ctu)` is already stored, so this is a
read, and it is the first task of the plan.

**Cancelling before confirmation costs nothing**: no CTU moves until `/jobs/{id}/confirm`. After
confirmation, cancelling calls `POST /jobs/{id}/cancel`, which is the platform's own behaviour and
is not a promise that the CTU come back.

Only one cloud run at a time, refused with "An analysis is already running" — the same rule and the
same words `analysis.rs:333` uses for local runs.

## 4. Findings in the editor

The report is SARIF, which `parseFindings` in `desktop/features/Analyses.tsx` already reads for
local runs. Cloud findings pass through the same function and reach the editor by the same path,
carrying their origin so a finding the cloud produced is distinguishable from a local one in the
list and in the gutter.

The job itself needs no new view: `Analyses.tsx:190` already falls back to "Analyse cloud" when a
job has no repository source, which is exactly the shape an upload-based job has.

## 5. Failures

| Failure | Behaviour |
|---|---|
| Archive exceeds the plan's `max_archive_bytes` | Refused before anything is uploaded, naming the limit and the actual size |
| `put_url` expires mid-upload | One retry with a fresh authorisation, then reported |
| Verification rejects the upload | The platform's `reject_reason` is shown verbatim, not reworded |
| `confirm_deadline` passes before confirmation | Reported as expired; nothing was spent |
| Session expires mid-run | The existing refresh path; if it fails the run stops before the confirmation step |
| Platform unreachable | The phase that failed is named, and the temporary archive is removed |

## 6. Testing

Rust, against a stub HTTP server — the pattern `cloud.rs`'s tests already use:

- the walker excludes the listed directories and honours a `.gitignore`
- pack then extract reproduces the tree, and the declared hash and size match the bytes written
- an archive over the cap is refused before any request is made
- each phase transition, including a `put_url` expiry retried once
- cancelling during packing, uploading and after the quote, and that nothing is confirmed in the
  first two cases
- the temporary archive is gone after success, failure and cancellation

Frontend: phases render, the confirmation dialog spends nothing until it is clicked, and cancel is
reachable from every phase.

**What tests cannot show:** none of this exercises the real platform, because a real run spends the
organisation's CTU. One real run against a small folder is required before this is called done, and
its outcome recorded — the stub proves the shape of the conversation, not that the platform agrees
with it.

## Out of scope

- Uploading anything narrower than the workspace. Single-file cloud analysis stays a later question.
- Re-running an upload-based job from its row in the history: the source is a one-off archive, not
  a commit that can be fetched again.
- Streaming the tool's log lines while the job runs. The report arrives at the end, as it does for
  repository analyses today.
