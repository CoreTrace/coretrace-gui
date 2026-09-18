# Tool-failure reports — design

Approved 2026-09-10.

## Purpose

When a tool ctrace calls fails on a user's machine, the desktop offers to send
a report: the whole tool log, what the user knows about their project's
libraries, and their build files. Reports are stored on the control plane and
e-mailed to the team, so that failures seen in the field turn into fixes.

## What the user sees

**Trigger.** A local analysis result whose `warnings` are non-empty or whose
exit code is non-zero shows **Envoyer un rapport** on the *Dernière analyse
locale* panel. It requires a signed-in session; signed out, the same place
reads *Connectez-vous pour envoyer un rapport* and opens the sign-in.

**Dialog — "Signaler l'échec d'un outil".**

1. A line saying what will be sent, with the real figures: "Le journal complet
   de ctrace (N lignes, X Ko), la version de ctrace, votre système et la
   version de CoreTrace Desktop." The log is sent whole; past 512 KiB it is
   truncated to its first and last 256 KiB with a marker line between.
2. "Quelles librairies utilisez-vous dans votre projet ?" — a free-text area.
3. "Fournissez votre Makefile / CMakeLists.txt / configuration de build" —
   files found at the workspace root are listed with a checkbox each, ticked
   by default: `Makefile`, `CMakeLists.txt`, `meson.build`, `configure.ac`,
   `conanfile.txt`, `vcpkg.json`, `compile_commands.json`. *Ajouter un
   fichier…* opens a picker restricted to text files. The dialog shows the
   running total and refuses to send above 2 MiB.
4. The statement, as body text above the buttons: **"Ces données restent
   privées. Nous les examinons uniquement pour améliorer et mettre à jour nos
   outils."**
5. *Envoyer*. On success the dialog closes, a notice says *Rapport envoyé,
   merci.*, and the button on that result reads *Rapport envoyé* (disabled).
   On a limit refusal the dialog stays open and shows the platform's message,
   which names when the next report may be sent.

## What is sent

`POST /v1/support/reports`, bearer user token, JSON body:

```
{
  "tools":        ["flawfinder", "tscancode"],      // tools that did not complete
  "signature":    "python: can't open file …",       // first error line, ≤ 200 chars
  "ctrace_version": "0.74.1",                        // as ctrace reports it, or ""
  "desktop_version": "6.0.0-beta.1",
  "os":           "windows 11 10.0.26100",
  "libraries":    "SDL2, libcurl, own allocator",    // the user's answer
  "log":          "…",                               // stdout + stderr, ≤ 512 KiB after truncation
  "files":        [{ "name": "CMakeLists.txt", "content": "…" }]   // text, ≤ 2 MiB total with log
}
```

Response `201 { "id": "<uuid>" }`. Refusals: `413` over the cap, `429` with
`Retry-After` when a limit is hit, `401` without a user session.

## Storage

Table `support_reports`, one row per report:

| column | type | note |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | who sent it |
| tools | text[] | tools that failed |
| signature | text | first error line, for the dedupe |
| ctrace_version, desktop_version, os | text | |
| libraries | text | the user's answer |
| log_key | text | object key of the full log |
| file_keys | text[] | object keys of attachments |
| log_bytes, files_bytes | bigint | |
| email_status | text | `sent`, `failed`, `disabled` |
| email_error | text | last delivery error, if any |
| created_at | timestamptz | |

RLS as for `user_github_tokens`: the user sees their own rows, the worker role
sees all. Objects live under `support/<report_id>/log.txt` and
`support/<report_id>/files/<n>-<name>` in the existing object store.

## Limits

Per user, over a rolling 24 hours:

- at most **5** reports;
- the same failure — same `tools` set and `signature` — at most **once**.

Both are checked in the handler from `support_reports`, before anything is
stored. A refusal is `429` with `Retry-After` set to the seconds until the
oldest counted report leaves the window, and a problem detail in French
naming that time. The request body is capped at 2 MiB by the handler before
parsing.

## E-mail

After the row and objects are written, the handler sends one message:

- to `CONTROL_SUPPORT_REPORT_TO` (production: `cedric.roulof@coretrace.fr`);
- subject `[CoreTrace] Échec d'outil : <tools> — <user e-mail>`;
- body: the metadata as a short table, the libraries answer, the first 200
  lines of the log; attachments: the log and the files, up to 1 MiB in total,
  otherwise the object keys are listed instead.

Transport is SMTP over STARTTLS with Go's standard library — no new
dependency — configured by `CONTROL_SMTP_HOST`, `CONTROL_SMTP_PORT`,
`CONTROL_SMTP_USER`, `CONTROL_SMTP_PASSWORD_FILE`, `CONTROL_SMTP_FROM`. With
no host configured, sending is disabled and rows carry `email_status =
disabled`; the report is still stored. A delivery failure is logged, recorded
on the row, and never turned into an error for the user: the report exists.

`deploy.sh` assembles these into `control.env` from the operator store, like
every other secret; the password file is `$SECRET_DIR/smtp.password`.

## Desktop internals

- Rust `support.rs`: `build_files(root) -> Vec<BuildFile{name, bytes}>` finds
  the candidates above; `read_text_file(root, relative)` for the picker,
  refusing binary content; `os_description()`; `send_report(body)` posts
  through the cloud session and maps `429`/`413` to messages the dialog shows.
- The log is assembled from `LocalResult.stdout` + `stderr`; the tools are
  those named on `Did not run`/`Failed`/`Could not be started` lines of the
  ctrace output, falling back to `["ctrace"]`.
- One report per result: the desktop remembers which `LocalRun.id` has been
  reported in `session.json`, so the button says *Rapport envoyé* after a
  restart too.

## Testing

- Go: handler tests with the in-memory object store and a recording mail
  sender — stores a report and its objects; refuses the sixth in a day and
  the same failure twice, with `Retry-After`; refuses over 2 MiB; the mail
  carries subject, metadata, the answer, the log head and the attachments;
  a failed send leaves the row with `email_status = failed`.
- Go: the SMTP sender against a local test server for the MIME shape.
- Rust: `build_files` finds the listed names and nothing else; log truncation
  keeps head and tail with the marker.
- Frontend: the dialog lists detected files ticked, refuses over the cap with
  the running total, sends the composed body, and shows a 429 message in
  place.

## Out of scope

A staff page listing reports (the mail is the review surface for now); retry
of failed mail; reports from cloud runs (their logs are already on the
platform); reports from signed-out desktops.
