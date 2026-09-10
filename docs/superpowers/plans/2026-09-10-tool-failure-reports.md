# Tool-Failure Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A failed local tool run can be reported from the desktop; the report is stored on the control plane, limited per user, and e-mailed to a configurable address.

**Architecture:** The control plane gains one user-scoped endpoint backed by a `support` package (limits → objects → row → mail). Mail is SMTP over STARTTLS through Go's standard library behind a `Sender` interface, so tests use a recording sender. The desktop gains a Rust `support` module (build-file detection, log truncation, the POST) and a `ReportDialog` component; the local-result panel carries the button.

**Tech Stack:** Go 1.25 / pgx v5 / oapi-codegen **v2.8.0** (pinned in `scripts/tools.sh`) / `net/smtp` + `mime/multipart`; Rust + Tauri v2; React 19 + Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-10-tool-failure-reports-design.md`.
- Control plane work happens in a worktree: `git worktree add -b feat/support-reports ../coretrace-control-wt-support main` — never in the shared checkout.
- Commit messages carry **no** AI attribution of any kind.
- Limits: **5** reports per user per rolling 24 h; the same `tools`+`signature` at most **once** per 24 h. Body cap **2 MiB** (log + files). Log truncated past **512 KiB** to first + last 256 KiB.
- Statement text, verbatim: **"Ces données restent privées. Nous les examinons uniquement pour améliorer et mettre à jour nos outils."**
- Question text, verbatim: **"Quelles librairies utilisez-vous dans votre projet ?"** and **"Fournissez votre Makefile / CMakeLists.txt / configuration de build"**.
- Env: `CONTROL_SUPPORT_REPORT_TO`, `CONTROL_SMTP_HOST`, `CONTROL_SMTP_PORT`, `CONTROL_SMTP_USER`, `CONTROL_SMTP_PASSWORD_FILE`, `CONTROL_SMTP_FROM`. No host ⇒ mail disabled, reports still stored.
- Regenerate the API with `./scripts/generate.sh` only; other oapi-codegen versions rewrite unrelated code.

---

## File Structure

**coretrace-control**
- `migrations/20260910000027_support_reports.sql` — the table and its policies.
- `internal/support/mail.go` — `Sender` interface, `Message`, `SMTPSender` (STARTTLS, `net/smtp`), `MemorySender` for tests, MIME assembly.
- `internal/support/mail_test.go` — MIME shape.
- `internal/support/reports.go` — `Service`: limits, object writes, row insert, mail, `LimitError`, `TooLargeError`.
- `test/integration/support_test.go` — service against DB + S3; endpoint via `App`.
- `openapi/openapi.yaml` — `POST /support/reports`.
- `internal/httpapi/support_handlers.go` — `SubmitSupportReport`.
- `internal/httpapi/problem.go` — two error mappings.
- `internal/config/config.go` — `Mail` settings.
- `cmd/control/dispatch.go` — construct the service.

**coretrace-deploy**
- `env/control.env.template`, `scripts/deploy.sh` — the six variables; `smtp.password` from `$SECRET_DIR`.

**coretrace-gui**
- `src-tauri/src/support.rs` — detection, truncation, tool names, OS string, the three commands.
- `src-tauri/src/settings.rs` — `LocalRun.reported`.
- `desktop/features/ReportDialog.tsx` (+ test) — the dialog.
- `desktop/features/Analyses.tsx` — the button on the local panel.
- `desktop/bridge.ts`, `desktop/types.ts`, `desktop/App.tsx` — wiring.

---

### Task 1: The table

**Files:**
- Create: `migrations/20260910000027_support_reports.sql`

**Interfaces:**
- Produces: table `support_reports` with the columns below; RLS: `app_rw` sees own rows via `app_user()`, `app_worker` sees all.

- [ ] **Step 1: Write the migration**

```sql
-- A report of a tool that failed on a user's machine. It belongs to the
-- person who sent it, not to an organisation: what failed is their project
-- and their build files, and the limit that keeps the mailbox usable is per
-- person. The log and the files live in the object store; the row keeps
-- their keys and what a reviewer needs to triage without opening them.
CREATE TABLE support_reports (
  id               uuid PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tools            text[] NOT NULL,
  signature        text NOT NULL,
  ctrace_version   text NOT NULL DEFAULT '',
  desktop_version  text NOT NULL DEFAULT '',
  os               text NOT NULL DEFAULT '',
  libraries        text NOT NULL DEFAULT '',
  log_key          text NOT NULL,
  file_keys        text[] NOT NULL DEFAULT '{}',
  log_bytes        bigint NOT NULL,
  files_bytes      bigint NOT NULL,
  email_status     text NOT NULL CHECK (email_status IN ('sent', 'failed', 'disabled')),
  email_error      text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- The limits read "this user's reports in the last day"; this is that lookup.
CREATE INDEX support_reports_user_recent ON support_reports (user_id, created_at DESC);

ALTER TABLE support_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY support_reports_self ON support_reports FOR ALL TO app_rw USING (user_id = app_user()) WITH CHECK (user_id = app_user());
CREATE POLICY support_reports_worker ON support_reports FOR ALL TO app_worker USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply and check**

Run: `go test ./test/integration -run TestRLS -count=1` (the RLS suite walks every table with policies).
Expected: PASS.

- [ ] **Step 3: Commit** — `feat(db): support_reports, one row per tool-failure report`

---

### Task 2: Mail

**Files:**
- Create: `internal/support/mail.go`, `internal/support/mail_test.go`

**Interfaces:**
- Produces:
  ```go
  type Attachment struct{ Name string; Content []byte }
  type Message struct{ To, Subject, Text string; Attachments []Attachment }
  type Sender interface{ Send(ctx context.Context, m Message) error }
  type SMTPConfig struct{ Host string; Port int; User, Password, From string }
  func NewSMTP(cfg SMTPConfig) *SMTPSender
  func (s *SMTPSender) Send(ctx context.Context, m Message) error
  type MemorySender struct{ mu sync.Mutex; Sent []Message; Err error }
  func (m *MemorySender) Send(ctx context.Context, msg Message) error
  func Encode(from string, m Message) []byte   // the RFC 5322 bytes, exported for the test
  ```

- [ ] **Step 1: Write the failing test**

```go
package support

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestEncodeCarriesTextAndAttachments(t *testing.T) {
	raw := Encode("noreply@coretrace.fr", Message{
		To: "cedric.roulof@coretrace.fr", Subject: "[CoreTrace] Échec d'outil : flawfinder — a@b.c",
		Text:        "libraries: SDL2\n",
		Attachments: []Attachment{{Name: "ctrace.log", Content: []byte("Running cppcheck\n")}},
	})
	s := string(raw)
	for _, want := range []string{
		"From: noreply@coretrace.fr\r\n", "To: cedric.roulof@coretrace.fr\r\n",
		"Subject: =?utf-8?", // non-ASCII subject is encoded
		"Content-Type: multipart/mixed;", "libraries: SDL2",
		`filename="ctrace.log"`, "Content-Transfer-Encoding: base64",
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("message lacks %q:\n%s", want, s)
		}
	}
	if !bytes.HasSuffix(raw, []byte("--\r\n")) {
		t.Fatalf("message does not close its multipart")
	}
}

func TestMemorySenderRecordsAndFails(t *testing.T) {
	m := &MemorySender{}
	if err := m.Send(context.Background(), Message{Subject: "x"}); err != nil || len(m.Sent) != 1 {
		t.Fatalf("sent = %v err = %v", m.Sent, err)
	}
	m.Err = context.DeadlineExceeded
	if err := m.Send(context.Background(), Message{}); err == nil {
		t.Fatal("expected the configured error")
	}
}
```

- [ ] **Step 2: Run** `go test ./internal/support/ -run 'TestEncode|TestMemory'` — FAIL: package does not exist.

- [ ] **Step 3: Implement**

```go
// Package support stores reports of tools that failed on users' machines
// and hands them to the team.
package support

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"mime"
	"mime/multipart"
	"net"
	"net/smtp"
	"net/textproto"
	"strconv"
	"sync"
	"time"
)

type Attachment struct {
	Name    string
	Content []byte
}

// Message is what the team receives: a plain-text body and files.
type Message struct {
	To, Subject, Text string
	Attachments       []Attachment
}

// Sender delivers a message. Production is SMTP; tests record.
type Sender interface {
	Send(ctx context.Context, m Message) error
}

// SMTPConfig names the relay. Password is the secret's value, not a path.
type SMTPConfig struct {
	Host           string
	Port           int
	User, Password string
	From           string
}

type SMTPSender struct{ cfg SMTPConfig }

func NewSMTP(cfg SMTPConfig) *SMTPSender { return &SMTPSender{cfg: cfg} }

// Send opens a STARTTLS session for each message. Reports are rare; a
// persistent connection would be a resource kept for nothing.
func (s *SMTPSender) Send(ctx context.Context, m Message) error {
	addr := net.JoinHostPort(s.cfg.Host, strconv.Itoa(s.cfg.Port))
	dialer := net.Dialer{Timeout: 15 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	c, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp greeting: %w", err)
	}
	defer c.Close()
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: s.cfg.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}
	if s.cfg.User != "" {
		if err := c.Auth(smtp.PlainAuth("", s.cfg.User, s.cfg.Password, s.cfg.Host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := c.Mail(s.cfg.From); err != nil {
		return fmt.Errorf("smtp from: %w", err)
	}
	if err := c.Rcpt(m.To); err != nil {
		return fmt.Errorf("smtp to: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write(Encode(s.cfg.From, m)); err != nil {
		return fmt.Errorf("smtp body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp end: %w", err)
	}
	return c.Quit()
}

// MemorySender keeps what it is given; tests read it back.
type MemorySender struct {
	mu   sync.Mutex
	Sent []Message
	Err  error
}

func (m *MemorySender) Send(_ context.Context, msg Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Err != nil {
		return m.Err
	}
	m.Sent = append(m.Sent, msg)
	return nil
}

// Encode renders the message as RFC 5322 bytes: a text part and one part per
// attachment, base64 so a log with odd bytes travels intact.
func Encode(from string, m Message) []byte {
	var buf bytes.Buffer
	mp := multipart.NewWriter(&buf)
	fmt.Fprintf(&buf, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=%q\r\n\r\n",
		from, m.To, mime.QEncoding.Encode("utf-8", m.Subject), mp.Boundary())
	text, _ := mp.CreatePart(textproto.MIMEHeader{"Content-Type": {"text/plain; charset=utf-8"}})
	text.Write([]byte(m.Text))
	for _, a := range m.Attachments {
		part, _ := mp.CreatePart(textproto.MIMEHeader{
			"Content-Type":              {"application/octet-stream"},
			"Content-Transfer-Encoding": {"base64"},
			"Content-Disposition":       {fmt.Sprintf("attachment; filename=%q", a.Name)},
		})
		enc := base64.NewEncoder(base64.StdEncoding, part)
		enc.Write(a.Content)
		enc.Close()
	}
	mp.Close()
	return buf.Bytes()
}
```

- [ ] **Step 4: Run** the two tests — PASS. Run `./scripts/lint.sh` — clean.
- [ ] **Step 5: Commit** — `feat(support): mail a message with attachments over SMTP`

---

### Task 3: The service

**Files:**
- Create: `internal/support/reports.go`
- Test: `test/integration/support_test.go` (service part)

**Interfaces:**
- Consumes: Task 2 `Sender`, `Message`, `Attachment`; `objectstore.ObjectStore`; `db.WithWorker(ctx, pool, fn)`.
- Produces:
  ```go
  type File struct{ Name string; Content []byte }
  type Report struct {
      Tools []string; Signature, CtraceVersion, DesktopVersion, OS, Libraries string
      Log []byte; Files []File
  }
  type Service struct {
      Pool  *pgxpool.Pool          // the worker pool: reports cross no org
      Store objectstore.ObjectStore
      Mail  Sender                 // nil disables mail
      To    string                 // CONTROL_SUPPORT_REPORT_TO
      Now   func() time.Time       // nil means time.Now
  }
  type LimitError struct{ RetryAfter time.Duration; Reason string } // Reason: "daily" | "duplicate"
  type TooLargeError struct{ Bytes, Max int64 }
  const MaxBytes = 2 << 20; const DailyLimit = 5; const Window = 24 * time.Hour
  func (s *Service) Submit(ctx context.Context, user uuid.UUID, email string, r Report) (uuid.UUID, error)
  ```

- [ ] **Step 1: Write the failing integration test**

```go
package integration

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/CoreTrace-Entreprise/coretrace-control/internal/objectstore"
	"github.com/CoreTrace-Entreprise/coretrace-control/internal/support"
	"github.com/CoreTrace-Entreprise/coretrace-control/internal/testutil"
)

func supportService(t *testing.T) (*support.Service, *support.MemorySender, *testutil.Environment) {
	t.Helper()
	env := testutil.Env(t)
	store, err := objectstore.NewS3(objectstore.S3Config{Endpoint: env.S3Endpoint, Region: "us-east-1", Bucket: env.S3Bucket, AccessKey: env.S3AccessKey, SecretKey: env.S3SecretKey, PathStyle: true})
	if err != nil {
		t.Fatal(err)
	}
	mail := &support.MemorySender{}
	return &support.Service{Pool: env.Worker, Store: store, Mail: mail, To: "team@example.test"}, mail, env
}

func sampleReport(sig string) support.Report {
	return support.Report{
		Tools: []string{"flawfinder"}, Signature: sig, CtraceVersion: "0.74.1", DesktopVersion: "6.0.0-beta.1",
		OS: "windows 11", Libraries: "SDL2, libcurl",
		Log:   []byte("Running flawfinder\n" + sig + "\n"),
		Files: []support.File{{Name: "CMakeLists.txt", Content: []byte("project(x)\n")}},
	}
}

func TestSupportReportIsStoredAndMailed(t *testing.T) {
	svc, mail, env := supportService(t)
	user := testutil.NewUser(t, env)
	ctx := context.Background()

	id, err := svc.Submit(ctx, user, "dev@example.test", sampleReport("python: can't open file"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Store.Head(ctx, "support/"+id.String()+"/log.txt"); err != nil {
		t.Fatalf("log object: %v", err)
	}
	if len(mail.Sent) != 1 {
		t.Fatalf("mails = %d", len(mail.Sent))
	}
	m := mail.Sent[0]
	if m.To != "team@example.test" || !strings.Contains(m.Subject, "flawfinder") || !strings.Contains(m.Subject, "dev@example.test") {
		t.Fatalf("subject/to = %q %q", m.Subject, m.To)
	}
	if !strings.Contains(m.Text, "SDL2, libcurl") || !strings.Contains(m.Text, "Running flawfinder") {
		t.Fatalf("body lacks the answer or the log head:\n%s", m.Text)
	}
	if len(m.Attachments) != 2 || m.Attachments[1].Name != "CMakeLists.txt" {
		t.Fatalf("attachments = %+v", m.Attachments)
	}
	var status string
	_ = testutil.RunAsWorker(t, env, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT email_status FROM support_reports WHERE id = $1`, id).Scan(&status)
	})
	if status != "sent" {
		t.Fatalf("email_status = %q", status)
	}
}

func TestSupportReportLimits(t *testing.T) {
	svc, _, env := supportService(t)
	user := testutil.NewUser(t, env)
	ctx := context.Background()

	// The same failure twice in a day is one report.
	if _, err := svc.Submit(ctx, user, "a@b.c", sampleReport("same")); err != nil {
		t.Fatal(err)
	}
	var limit *support.LimitError
	_, err := svc.Submit(ctx, user, "a@b.c", sampleReport("same"))
	if !errors.As(err, &limit) || limit.Reason != "duplicate" || limit.RetryAfter <= 0 {
		t.Fatalf("duplicate: err = %v", err)
	}
	// Five distinct failures a day, and no more.
	for i := 2; i <= 5; i++ {
		if _, err := svc.Submit(ctx, user, "a@b.c", sampleReport("failure "+string(rune('0'+i)))); err != nil {
			t.Fatalf("report %d: %v", i, err)
		}
	}
	_, err = svc.Submit(ctx, user, "a@b.c", sampleReport("sixth"))
	if !errors.As(err, &limit) || limit.Reason != "daily" {
		t.Fatalf("sixth: err = %v", err)
	}
	// Another user is not held back by this one.
	if _, err := svc.Submit(ctx, testutil.NewUser(t, env), "z@b.c", sampleReport("sixth")); err != nil {
		t.Fatal(err)
	}
}

func TestSupportReportTooLargeAndMailFailure(t *testing.T) {
	svc, mail, env := supportService(t)
	user := testutil.NewUser(t, env)
	ctx := context.Background()

	big := sampleReport("big")
	big.Log = make([]byte, support.MaxBytes+1)
	var tooLarge *support.TooLargeError
	if _, err := svc.Submit(ctx, user, "a@b.c", big); !errors.As(err, &tooLarge) {
		t.Fatalf("err = %v", err)
	}

	// A mail that cannot be delivered does not lose the report.
	mail.Err = errors.New("relay down")
	id, err := svc.Submit(ctx, user, "a@b.c", sampleReport("mail fails"))
	if err != nil {
		t.Fatal(err)
	}
	var status, reason string
	_ = testutil.RunAsWorker(t, env, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT email_status, email_error FROM support_reports WHERE id = $1`, id).Scan(&status, &reason)
	})
	if status != "failed" || !strings.Contains(reason, "relay down") {
		t.Fatalf("status = %q reason = %q", status, reason)
	}
	_ = time.Second
}
```

Add `"github.com/jackc/pgx/v5"` to the imports.

- [ ] **Step 2: Run** `go test ./test/integration -run TestSupportReport -count=1` — FAIL: package `support` has no `Service`.

- [ ] **Step 3: Implement**

```go
package support

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/CoreTrace-Entreprise/coretrace-control/internal/db"
	"github.com/CoreTrace-Entreprise/coretrace-control/internal/objectstore"
)

const (
	// MaxBytes bounds log plus files. Larger than any build configuration;
	// smaller than what a mailbox will take.
	MaxBytes = int64(2 << 20)
	// DailyLimit is reports per user per Window.
	DailyLimit = 5
	Window     = 24 * time.Hour
	// mailAttachmentBytes is the most the message itself carries; past it
	// the object keys are named instead.
	mailAttachmentBytes = int64(1 << 20)
	logHeadLines        = 200
)

type File struct {
	Name    string
	Content []byte
}

// Report is what the desktop sends.
type Report struct {
	Tools                                                  []string
	Signature, CtraceVersion, DesktopVersion, OS, Libraries string
	Log                                                    []byte
	Files                                                  []File
}

// LimitError says the user must wait. Reason is "daily" or "duplicate".
type LimitError struct {
	RetryAfter time.Duration
	Reason     string
}

func (e *LimitError) Error() string {
	return fmt.Sprintf("support: %s limit, retry in %s", e.Reason, e.RetryAfter.Round(time.Minute))
}

type TooLargeError struct{ Bytes, Max int64 }

func (e *TooLargeError) Error() string {
	return fmt.Sprintf("support: report is %d bytes, at most %d", e.Bytes, e.Max)
}

// Service stores reports and hands them to the team.
type Service struct {
	Pool  *pgxpool.Pool
	Store objectstore.ObjectStore
	Mail  Sender
	To    string
	Now   func() time.Time
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// Submit checks the limits, writes the objects and the row, then mails. A
// mail that cannot be sent is recorded on the row and never fails the
// report: the report exists, which is what the user was promised.
func (s *Service) Submit(ctx context.Context, user uuid.UUID, email string, r Report) (uuid.UUID, error) {
	var total int64 = int64(len(r.Log))
	for _, f := range r.Files {
		total += int64(len(f.Content))
	}
	if total > MaxBytes {
		return uuid.Nil, &TooLargeError{Bytes: total, Max: MaxBytes}
	}
	if err := s.checkLimits(ctx, user, r); err != nil {
		return uuid.Nil, err
	}

	id := uuid.Must(uuid.NewV7())
	logKey := fmt.Sprintf("support/%s/log.txt", id)
	if err := s.Store.Put(ctx, logKey, bytes.NewReader(r.Log), int64(len(r.Log))); err != nil {
		return uuid.Nil, fmt.Errorf("support: store log: %w", err)
	}
	fileKeys := make([]string, 0, len(r.Files))
	var filesBytes int64
	for i, f := range r.Files {
		key := fmt.Sprintf("support/%s/files/%d-%s", id, i+1, safeName(f.Name))
		if err := s.Store.Put(ctx, key, bytes.NewReader(f.Content), int64(len(f.Content))); err != nil {
			return uuid.Nil, fmt.Errorf("support: store %s: %w", f.Name, err)
		}
		fileKeys = append(fileKeys, key)
		filesBytes += int64(len(f.Content))
	}

	status, reason := "disabled", ""
	if s.Mail != nil && s.To != "" {
		if err := s.Mail.Send(ctx, s.message(id, email, r, logKey, fileKeys)); err != nil {
			status, reason = "failed", err.Error()
		} else {
			status = "sent"
		}
	}

	err := db.WithWorker(ctx, s.Pool, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO support_reports
			(id, user_id, tools, signature, ctrace_version, desktop_version, os, libraries, log_key, file_keys, log_bytes, files_bytes, email_status, email_error, created_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
			id, user, r.Tools, r.Signature, r.CtraceVersion, r.DesktopVersion, r.OS, r.Libraries,
			logKey, fileKeys, int64(len(r.Log)), filesBytes, status, reason, s.now())
		return err
	})
	if err != nil {
		return uuid.Nil, fmt.Errorf("support: record: %w", err)
	}
	return id, nil
}

// checkLimits reads this user's last day. The oldest counted report sets
// how long the wait is: the moment it leaves the window, a slot frees.
func (s *Service) checkLimits(ctx context.Context, user uuid.UUID, r Report) error {
	since := s.now().Add(-Window)
	var count int
	var oldest, sameAt *time.Time
	err := db.WithWorker(ctx, s.Pool, func(ctx context.Context, tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT count(*), min(created_at) FROM support_reports WHERE user_id = $1 AND created_at > $2`, user, since).Scan(&count, &oldest); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `SELECT max(created_at) FROM support_reports WHERE user_id = $1 AND created_at > $2 AND signature = $3 AND tools = $4`,
			user, since, r.Signature, r.Tools).Scan(&sameAt)
	})
	if err != nil {
		return fmt.Errorf("support: limits: %w", err)
	}
	if sameAt != nil {
		return &LimitError{Reason: "duplicate", RetryAfter: sameAt.Add(Window).Sub(s.now())}
	}
	if count >= DailyLimit && oldest != nil {
		return &LimitError{Reason: "daily", RetryAfter: oldest.Add(Window).Sub(s.now())}
	}
	return nil
}

func (s *Service) message(id uuid.UUID, email string, r Report, logKey string, fileKeys []string) Message {
	var text strings.Builder
	fmt.Fprintf(&text, "Rapport %s\nDe : %s\nOutils : %s\nctrace : %s\nDesktop : %s\nSystème : %s\nPremière erreur : %s\n\n",
		id, email, strings.Join(r.Tools, ", "), r.CtraceVersion, r.DesktopVersion, r.OS, r.Signature)
	fmt.Fprintf(&text, "Librairies utilisées :\n%s\n\n", strings.TrimSpace(r.Libraries))
	fmt.Fprintf(&text, "Journal (%d premières lignes) :\n%s\n", logHeadLines, head(r.Log, logHeadLines))

	var attachments []Attachment
	var size int64 = int64(len(r.Log))
	for _, f := range r.Files {
		size += int64(len(f.Content))
	}
	if size <= mailAttachmentBytes {
		attachments = append(attachments, Attachment{Name: "ctrace.log", Content: r.Log})
		for _, f := range r.Files {
			attachments = append(attachments, Attachment{Name: safeName(f.Name), Content: f.Content})
		}
	} else {
		fmt.Fprintf(&text, "\nPièces trop volumineuses pour ce message ; objets : %s, %s\n", logKey, strings.Join(fileKeys, ", "))
	}
	return Message{
		To:          s.To,
		Subject:     fmt.Sprintf("[CoreTrace] Échec d'outil : %s — %s", strings.Join(r.Tools, ", "), email),
		Text:        text.String(),
		Attachments: attachments,
	}
}

func head(log []byte, lines int) string {
	parts := strings.SplitN(string(log), "\n", lines+1)
	if len(parts) > lines {
		parts = parts[:lines]
	}
	return strings.Join(parts, "\n")
}

// safeName keeps a file name to what an object key and a mail header accept.
func safeName(name string) string {
	name = strings.TrimSpace(name)
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	var b strings.Builder
	for _, c := range name {
		if c == '.' || c == '-' || c == '_' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') {
			b.WriteRune(c)
		} else {
			b.WriteByte('_')
		}
	}
	if b.Len() == 0 {
		return "file"
	}
	return b.String()
}
```

- [ ] **Step 4: Run** the three tests — PASS. `./scripts/lint.sh` — clean.
- [ ] **Step 5: Commit** — `feat(support): store a tool-failure report, within limits, and mail it`

---

### Task 4: The endpoint

**Files:**
- Modify: `openapi/openapi.yaml` (add path after `/jobs/{id}/runs/{run}/report`; schemas after `JobRequest`)
- Create: `internal/httpapi/support_handlers.go`
- Modify: `internal/httpapi/handlers.go:31-60` (field), `internal/httpapi/problem.go:65-130` (two cases)
- Test: `test/integration/support_test.go` (endpoint part)

**Interfaces:**
- Consumes: Task 3 `Service`, `LimitError`, `TooLargeError`.
- Produces: `Handlers.Support *support.Service`; operation `submitSupportReport`; generated `gen.SubmitSupportReportRequestObject{Body *gen.SupportReportRequest}`, `gen.SubmitSupportReport201JSONResponse`.

- [ ] **Step 1: OpenAPI**

Path:
```yaml
  /support/reports:
    post:
      operationId: submitSupportReport
      description: >-
        Reports a tool that failed on the user's machine. Stored for the team and
        mailed to them. Per user, at most five a day, and the same failure once a day.
      security:
        - bearerUser: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/SupportReportRequest"
      responses:
        "201":
          description: Stored
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SupportReportCreated"
        default:
          $ref: "#/components/responses/Problem"
```
Schemas:
```yaml
    SupportReportRequest:
      type: object
      required: [tools, signature, log]
      properties:
        tools:
          type: array
          items:
            type: string
        signature:
          type: string
          maxLength: 200
        ctrace_version:
          type: string
        desktop_version:
          type: string
        os:
          type: string
        libraries:
          type: string
        log:
          type: string
        files:
          type: array
          items:
            type: object
            required: [name, content]
            properties:
              name:
                type: string
              content:
                type: string
    SupportReportCreated:
      type: object
      required: [id]
      properties:
        id:
          type: string
          format: uuid
```

- [ ] **Step 2: Generate** — `./scripts/generate.sh`; `git diff --stat internal/httpapi/gen/` shows only the new operation and schemas.

- [ ] **Step 3: Write the failing endpoint test** (append to `test/integration/support_test.go`)

```go
func TestSupportReportEndpoint(t *testing.T) {
	app := NewApp(t)
	mail := &support.MemorySender{}
	store, err := objectstore.NewS3(objectstore.S3Config{Endpoint: app.Env.S3Endpoint, Region: "us-east-1", Bucket: app.Env.S3Bucket, AccessKey: app.Env.S3AccessKey, SecretKey: app.Env.S3SecretKey, PathStyle: true})
	if err != nil {
		t.Fatal(err)
	}
	app.Handlers.Support = &support.Service{Pool: app.Env.Worker, Store: store, Mail: mail, To: "team@example.test"}
	token, _ := app.SignIn(t, "u-support", "reporter@example.test")
	c := app.NewClient(t).WithToken(token)

	body := map[string]any{
		"tools": []string{"tscancode"}, "signature": "Failed to create process", "ctrace_version": "0.74.1",
		"desktop_version": "6.0.0-beta.1", "os": "windows 11", "libraries": "none", "log": "Running tscancode\nFailed to create process\n",
		"files": []map[string]string{{"name": "Makefile", "content": "all:\n"}},
	}
	var created struct{ ID string `json:"id"` }
	if status, _, raw := c.Do("POST", "/support/reports", body, &created); status != 201 || created.ID == "" {
		t.Fatalf("status = %d body = %s", status, raw)
	}
	if len(mail.Sent) != 1 || !strings.Contains(mail.Sent[0].Subject, "reporter@example.test") {
		t.Fatalf("mail = %+v", mail.Sent)
	}

	// The same failure again: refused, and told when.
	status, headers, raw := c.Do("POST", "/support/reports", body, nil)
	if status != 429 || headers.Get("Retry-After") == "" || !strings.Contains(raw, "rate_limited") {
		t.Fatalf("duplicate: status = %d retry = %q body = %s", status, headers.Get("Retry-After"), raw)
	}

	// Too large: refused before anything is stored.
	body["signature"] = "huge"
	body["log"] = strings.Repeat("x", int(support.MaxBytes)+1)
	if status, _, _ := c.Do("POST", "/support/reports", body, nil); status != 413 {
		t.Fatalf("too large: status = %d", status)
	}

	// Signed out: refused.
	if status, _, _ := app.NewClient(t).Do("POST", "/support/reports", body, nil); status != 401 {
		t.Fatalf("anonymous: status = %d", status)
	}
}
```

- [ ] **Step 4: Run** `go test ./test/integration -run TestSupportReportEndpoint -count=1` — FAIL: `Handlers` has no field `Support`.

- [ ] **Step 5: Implement the handler**

`internal/httpapi/handlers.go`, in the struct after `ClientRelease`:
```go
	// Support stores tool-failure reports from the desktop (nil disables the endpoint).
	Support *support.Service
```

`internal/httpapi/support_handlers.go`:
```go
package httpapi

import (
	"context"

	"github.com/CoreTrace-Entreprise/coretrace-control/internal/auth"
	"github.com/CoreTrace-Entreprise/coretrace-control/internal/httpapi/gen"
	"github.com/CoreTrace-Entreprise/coretrace-control/internal/support"
	"github.com/CoreTrace-Entreprise/coretrace-control/internal/tenancy"
)

// SubmitSupportReport stores a report of a tool that failed on the user's
// machine. The user, not an organisation, is the subject: the limit that
// keeps the mailbox usable is theirs, and so is the reply address.
func (h *Handlers) SubmitSupportReport(ctx context.Context, req gen.SubmitSupportReportRequestObject) (gen.SubmitSupportReportResponseObject, error) {
	p, err := requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if h.Support == nil || req.Body == nil {
		return nil, tenancy.ErrForbidden
	}
	email, err := auth.SignInEmail(ctx, h.Pools.Worker, p.UserID)
	if err != nil {
		return nil, err
	}
	report := support.Report{
		Tools:     req.Body.Tools,
		Signature: req.Body.Signature,
		Log:       []byte(req.Body.Log),
	}
	if req.Body.CtraceVersion != nil {
		report.CtraceVersion = *req.Body.CtraceVersion
	}
	if req.Body.DesktopVersion != nil {
		report.DesktopVersion = *req.Body.DesktopVersion
	}
	if req.Body.Os != nil {
		report.OS = *req.Body.Os
	}
	if req.Body.Libraries != nil {
		report.Libraries = *req.Body.Libraries
	}
	if req.Body.Files != nil {
		for _, f := range *req.Body.Files {
			report.Files = append(report.Files, support.File{Name: f.Name, Content: []byte(f.Content)})
		}
	}
	id, err := h.Support.Submit(ctx, p.UserID, email, report)
	if err != nil {
		return nil, err
	}
	h.audit(ctx, "support.report", map[string]any{"report_id": id.String(), "tools": report.Tools})
	return gen.SubmitSupportReport201JSONResponse{Id: id}, nil
}
```
(If `h.audit` is not the audit helper's name, use the one `AuditKeyReject` calls; the generated field names — `CtraceVersion`, `Os`, `Files` — are what oapi-codegen v2.8.0 emits for the schema above; confirm against `gen/api.gen.go` after generation.)

`internal/httpapi/problem.go`, two cases before `default:`:
```go
	case errors.As(err, &supportLimit):
		p.Type, p.Title, p.Status = "rate_limited", "Too many reports", http.StatusTooManyRequests
		retry := int(supportLimit.RetryAfter.Seconds()) + 1
		w.Header().Set("Retry-After", itoa(retry))
		p.Detail = map[string]any{"reason": supportLimit.Reason, "retry_after_seconds": retry,
			"sentence": "Vous avez atteint la limite de rapports. Réessayez dans " + humanWait(supportLimit.RetryAfter) + "."}
	case errors.As(err, &supportSize):
		p.Type, p.Title, p.Status = "invalid", "Report too large", http.StatusRequestEntityTooLarge
		p.Detail = map[string]any{"bytes": supportSize.Bytes, "max": supportSize.Max}
```
with `var supportLimit *support.LimitError; var supportSize *support.TooLargeError` declared beside the other vars, and:
```go
// humanWait says a duration the way a sentence would: "3 heures", "40 minutes".
func humanWait(d time.Duration) string {
	if d >= time.Hour {
		return itoa(int(d.Hours()+0.5)) + " heures"
	}
	m := int(d.Minutes() + 0.5)
	if m < 1 {
		m = 1
	}
	return itoa(m) + " minutes"
}
```

- [ ] **Step 6: Run** the endpoint test and `go test ./internal/httpapi/...` (the contract test checks every operation is implemented) — PASS. `./scripts/lint.sh` — clean.
- [ ] **Step 7: Commit** — `feat(api): POST /support/reports`

---

### Task 5: Configuration and wiring

**Files:**
- Modify: `internal/config/config.go` (struct + `Load`), `cmd/control/dispatch.go:220-235`
- Modify (deploy repo): `env/control.env.template`, `scripts/deploy.sh:160-190`

**Interfaces:**
- Produces: `config.Mail{Host string; Port int; User, Password, From, To string}` on `Config.Mail`; `Config.Mail.Enabled() bool` (Host != "").

- [ ] **Step 1: Failing config test** (`internal/config/config_test.go`, alongside the existing `Load` tests)

```go
func TestMailIsOptionalButCompleteWhenSet(t *testing.T) {
	base := validLookup() // the existing helper returning a complete lookup
	cfg, err := Load(base)
	if err != nil || cfg.Mail.Enabled() {
		t.Fatalf("mail should be off by default: %v %+v", err, cfg.Mail)
	}
	with := func(extra map[string]string) Lookup {
		return func(k string) (string, bool) {
			if v, ok := extra[k]; ok {
				return v, true
			}
			return base(k)
		}
	}
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "smtp.password"), []byte("s3cret-s3cret"), 0o600)
	cfg, err = Load(with(map[string]string{
		"CONTROL_SMTP_HOST": "smtp.mail.ovh.net", "CONTROL_SMTP_PORT": "587", "CONTROL_SMTP_USER": "noreply@coretrace.fr",
		"CONTROL_SMTP_PASSWORD_FILE": filepath.Join(dir, "smtp.password"), "CONTROL_SMTP_FROM": "noreply@coretrace.fr",
		"CONTROL_SUPPORT_REPORT_TO": "cedric.roulof@coretrace.fr",
	}))
	if err != nil || cfg.Mail.Port != 587 || cfg.Mail.Password != "s3cret-s3cret" || cfg.Mail.To != "cedric.roulof@coretrace.fr" {
		t.Fatalf("mail = %+v err = %v", cfg.Mail, err)
	}
	if _, err := Load(with(map[string]string{"CONTROL_SMTP_HOST": "smtp.mail.ovh.net"})); err == nil {
		t.Fatal("a host without from/to/port must be refused")
	}
}
```

- [ ] **Step 2: Implement in `config.go`**

```go
// Mail names the SMTP relay for outgoing messages and where support reports go.
// Host empty means no mail is sent; reports are still stored.
type Mail struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
	To       string
}

func (m Mail) Enabled() bool { return m.Host != "" }
```
Add `Mail Mail` to `Config`. In `Load`, after the CLI block:
```go
	cfg.Mail.Host = get("CONTROL_SMTP_HOST")
	if cfg.Mail.Host != "" {
		port, err := strconv.Atoi(get("CONTROL_SMTP_PORT"))
		if err != nil || port <= 0 {
			fail("CONTROL_SMTP_PORT", "must be a port number when a host is set")
		}
		cfg.Mail.Port = port
		cfg.Mail.User = get("CONTROL_SMTP_USER")
		if pw, err := secret(lookup, "CONTROL_SMTP_PASSWORD", 1); err == nil {
			cfg.Mail.Password = string(pw)
		} else if cfg.Mail.User != "" {
			fail("CONTROL_SMTP_PASSWORD_FILE", err.Error())
		}
		cfg.Mail.From = get("CONTROL_SMTP_FROM")
		cfg.Mail.To = get("CONTROL_SUPPORT_REPORT_TO")
		if cfg.Mail.From == "" || cfg.Mail.To == "" {
			fail("CONTROL_SMTP_FROM", "from and CONTROL_SUPPORT_REPORT_TO are required when a host is set")
		}
	}
```

- [ ] **Step 3: Wire in `dispatch.go`** where `handlers := &httpapi.Handlers{…}` is built (the `store` from line 125 is in scope):
```go
		supportSvc := &support.Service{Pool: pools.Worker, Store: store, To: cfg.Mail.To}
		if cfg.Mail.Enabled() {
			supportSvc.Mail = support.NewSMTP(support.SMTPConfig{Host: cfg.Mail.Host, Port: cfg.Mail.Port, User: cfg.Mail.User, Password: cfg.Mail.Password, From: cfg.Mail.From})
		}
		handlers.Support = supportSvc
```

- [ ] **Step 4: Deploy repo** — `env/control.env.template`, new section:
```
# --- support reports --------------------------------------------------------
# Where tool-failure reports from the desktop are mailed. Leave the host empty to store without mailing.
CONTROL_SUPPORT_REPORT_TO=
CONTROL_SMTP_HOST=
CONTROL_SMTP_PORT=
CONTROL_SMTP_USER=
CONTROL_SMTP_PASSWORD_FILE=/etc/coretrace/secrets/smtp.password
CONTROL_SMTP_FROM=
```
`scripts/deploy.sh`: read `$SECRET_DIR/smtp.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM`, `SUPPORT_REPORT_TO`) if present, copy `$SECRET_DIR/smtp.password` to `/etc/coretrace/secrets/smtp.password` (0600) the way `github-app.pem` is copied, and append to the control env block:
```
CONTROL_SUPPORT_REPORT_TO=${SUPPORT_REPORT_TO:-}
CONTROL_SMTP_HOST=${SMTP_HOST:-}
CONTROL_SMTP_PORT=${SMTP_PORT:-}
CONTROL_SMTP_USER=${SMTP_USER:-}
CONTROL_SMTP_PASSWORD_FILE=/etc/coretrace/secrets/smtp.password
CONTROL_SMTP_FROM=${SMTP_FROM:-}
```

- [ ] **Step 5: Run** `go test ./internal/config/ ./cmd/...` — PASS; `./scripts/lint.sh` — clean.
- [ ] **Step 6: Commit** control — `feat(config): SMTP relay and support-report recipient`; deploy — `feat(deploy): mail settings for support reports`.

---

### Task 6: Desktop, Rust side

**Files:**
- Create: `src-tauri/src/support.rs`
- Modify: `src-tauri/src/settings.rs` (`LocalRun.reported`, `remember_reported`), `src-tauri/src/lib.rs` (register)

**Interfaces:**
- Consumes: `crate::workspace::{root, resolve, WorkspaceState}`, `crate::cloud::{Cloud, request_status semantics}`.
- Produces commands:
  ```rust
  support_candidates(workspace_id) -> Vec<Candidate{ name: String, bytes: u64 }>
  support_read_file(workspace_id, relative: String) -> String        // text only, ≤ 1 MiB
  support_send(org: Option<String>, report: ReportBody) -> Result<String /*id*/, String>
  support_mark_reported(workspace_id, run_id)
  ```
  and pure functions `build_files(root) -> Vec<Candidate>`, `truncate_log(&str) -> String`, `failed_tools(output: &str) -> Vec<String>`, `signature(output) -> String`, `os_description() -> String`.

- [ ] **Step 1: Failing tests** (in `support.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_build_files_and_nothing_else() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["Makefile", "CMakeLists.txt", "vcpkg.json", "README.md", "main.c"] {
            std::fs::write(dir.path().join(name), "x").unwrap();
        }
        let names: Vec<String> = build_files(dir.path()).into_iter().map(|c| c.name).collect();
        assert_eq!(names, vec!["CMakeLists.txt", "Makefile", "vcpkg.json"]);
    }

    #[test]
    fn a_long_log_keeps_its_head_and_tail() {
        let log = "a".repeat(300 * 1024) + "MIDDLE" + &"z".repeat(300 * 1024);
        let cut = truncate_log(&log);
        assert!(cut.len() < 520 * 1024);
        assert!(cut.starts_with("aaaa"));
        assert!(cut.ends_with("zzzz"));
        assert!(cut.contains("[… journal tronqué :"));
        assert!(!cut.contains("MIDDLE"));
        assert_eq!(truncate_log("short"), "short");
    }

    #[test]
    fn names_the_tools_that_did_not_complete() {
        let out = "|1| == CoreTrace == [WARN] (tscancode) Could not be started, so this file is unanalysed by it.\n\
                   |1| == CoreTrace == [INFO] (cppcheck) Completed; its findings are in the report.\n\
                   |1| == CoreTrace == [WARN] (flawfinder) Failed, so this file is unanalysed by it.\n\
                   |1| == CoreTrace == [INFO] (ctrace_stack_analyzer) Diagnostics summary: info=0, warning=0, error=0\n";
        assert_eq!(failed_tools(out), vec!["tscancode", "flawfinder"]);
        assert_eq!(failed_tools("nothing here"), vec!["ctrace"]);
        assert_eq!(signature("ok\nError: Failed to create process\nmore"), "Error: Failed to create process");
    }
}
```

- [ ] **Step 2: Run** `cargo test --lib support` — FAIL: module missing.

- [ ] **Step 3: Implement**

```rust
use crate::cloud::Cloud;
use crate::workspace::{resolve, root, WorkspaceState};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Build files worth sending with a report, by name. Order is the order
/// they are shown.
const BUILD_FILES: [&str; 7] = [
    "CMakeLists.txt", "Makefile", "compile_commands.json", "configure.ac",
    "conanfile.txt", "meson.build", "vcpkg.json",
];
const LOG_LIMIT: usize = 512 * 1024;
const FILE_LIMIT: u64 = 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate { pub name: String, pub bytes: u64 }

/// The files at the folder's root a build is configured by.
pub fn build_files(root: &Path) -> Vec<Candidate> {
    let mut found: Vec<Candidate> = BUILD_FILES
        .iter()
        .filter_map(|name| {
            let meta = std::fs::metadata(root.join(name)).ok()?;
            meta.is_file().then(|| Candidate { name: (*name).into(), bytes: meta.len() })
        })
        .collect();
    found.sort_by(|a, b| a.name.cmp(&b.name));
    found
}

/// Keeps a log within the limit by keeping its start and its end: the start
/// says what was run, the end says how it ended.
pub fn truncate_log(log: &str) -> String {
    if log.len() <= LOG_LIMIT { return log.to_owned(); }
    let half = LOG_LIMIT / 2;
    let mut head_end = half;
    while !log.is_char_boundary(head_end) { head_end -= 1; }
    let mut tail_start = log.len() - half;
    while !log.is_char_boundary(tail_start) { tail_start += 1; }
    format!(
        "{}\n[… journal tronqué : {} octets omis …]\n{}",
        &log[..head_end], tail_start - head_end, &log[tail_start..]
    )
}

/// The tools ctrace said did not complete, from its own summary lines.
pub fn failed_tools(output: &str) -> Vec<String> {
    let mut tools = Vec::new();
    for line in output.lines() {
        let Some(start) = line.find("== CoreTrace == [WARN] (") else { continue };
        let rest = &line[start + "== CoreTrace == [WARN] (".len()..];
        let Some(end) = rest.find(')') else { continue };
        let name = &rest[..end];
        if !tools.iter().any(|t| t == name) { tools.push(name.to_owned()); }
    }
    if tools.is_empty() { tools.push("ctrace".into()); }
    tools
}

/// The first line that reads like the reason, for telling one failure from
/// another. At most 200 characters.
pub fn signature(output: &str) -> String {
    let line = output
        .lines()
        .map(str::trim)
        .find(|l| { let l = l.to_lowercase(); l.contains("error") || l.contains("failed") || l.contains("not found") || l.contains("cannot") })
        .unwrap_or("");
    line.chars().take(200).collect()
}

pub fn os_description() -> String {
    format!("{} {}", std::env::consts::OS, std::env::consts::ARCH)
}

#[tauri::command]
pub fn support_candidates(state: tauri::State<'_, WorkspaceState>, workspace_id: String) -> Result<Vec<Candidate>, String> {
    Ok(build_files(&root(&state, &workspace_id)?))
}

/// Reads a file the user chose to attach. Text only, and small: a report is
/// for reading, not for archiving a repository.
#[tauri::command]
pub fn support_read_file(state: tauri::State<'_, WorkspaceState>, workspace_id: String, relative: String) -> Result<String, String> {
    let path = resolve(&root(&state, &workspace_id)?, &relative)?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > FILE_LIMIT { return Err("Choose a text file smaller than 1 MiB".into()); }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.contains(&0) { return Err("Binary files cannot be attached".into()); }
    String::from_utf8(bytes).map_err(|_| "The file is not UTF-8 text".into())
}

#[derive(Deserialize, Serialize)]
pub struct ReportFile { pub name: String, pub content: String }

#[derive(Deserialize, Serialize)]
pub struct ReportBody {
    pub tools: Vec<String>,
    pub signature: String,
    pub ctrace_version: String,
    pub desktop_version: String,
    pub os: String,
    pub libraries: String,
    pub log: String,
    pub files: Vec<ReportFile>,
}

/// Sends the report. The platform's refusals are sentences the dialog shows.
#[tauri::command]
pub async fn support_send(cloud: tauri::State<'_, Cloud>, report: ReportBody) -> Result<String, String> {
    let body = serde_json::to_value(&report).map_err(|e| e.to_string())?;
    let mut s = cloud.0.lock().await;
    let (status, value) = s.request_status(Method::POST, "/support/reports", None, Some(body)).await?;
    match status {
        201 => value["id"].as_str().map(str::to_owned).ok_or_else(|| "The platform stored the report but named no id".into()),
        429 => Err(value["detail"]["sentence"].as_str().unwrap_or("Vous avez atteint la limite de rapports. Réessayez plus tard.").to_owned()),
        413 => Err("Le rapport dépasse 2 Mio. Retirez une pièce jointe.".into()),
        401 => Err("Sign in to CoreTrace first".into()),
        _ => Err(format!("{} (HTTP {status})", value["title"].as_str().unwrap_or("Report refused"))),
    }
}

#[tauri::command]
pub fn support_mark_reported(app: tauri::AppHandle, state: tauri::State<'_, WorkspaceState>, workspace_id: String, run_id: String) -> Result<(), String> {
    crate::settings::remember_reported(&app, &root(&state, &workspace_id)?, &run_id);
    Ok(())
}
```

`settings.rs`: add `#[serde(default)] pub reported: bool` to `LocalRun`, and
```rust
/// Marks a run as reported, so the button says so after a restart too.
pub fn remember_reported(app: &tauri::AppHandle, folder: &Path, run_id: &str) {
    let mut settings = load(app);
    if let Some(runs) = settings.local_runs.get_mut(&folder_key(folder)) {
        for run in runs.iter_mut().filter(|r| r.id == run_id) { run.reported = true; }
    }
    save(app, &settings);
}
```
`analyse_local` / `analyse_local_folder` must return the run id to the frontend: add `pub run_id: String` to `ResultView` (set from the `LocalRun` created) — the dialog needs it.

Register the four commands in `lib.rs`.

- [ ] **Step 4: Run** `cargo test --lib`, `cargo clippy --all-targets -- -D warnings` — PASS, clean.
- [ ] **Step 5: Commit** — `feat(desktop): gather and send a tool-failure report`

---

### Task 7: Desktop, the dialog

**Files:**
- Create: `desktop/features/ReportDialog.tsx`, `desktop/features/ReportDialog.test.tsx`
- Modify: `desktop/bridge.ts`, `desktop/types.ts`, `desktop/features/Analyses.tsx` (local panel), `desktop/App.tsx`

**Interfaces:**
- Consumes: Task 6 commands. Bridge:
  ```ts
  supportCandidates: (workspaceId) => call<{name:string;bytes:number}[]>("support_candidates", {workspaceId})
  supportReadFile: (workspaceId, relative) => call<string>("support_read_file", {workspaceId, relative})
  supportSend: (report: ReportBody) => call<string>("support_send", {report})
  supportMarkReported: (workspaceId, runId) => call<void>("support_mark_reported", {workspaceId, runId})
  ```
  `LocalResult` gains `runId: string`; `LocalRun` gains `reported: boolean`.
- Produces: `<ReportDialog workspaceId local={LocalResult} signedIn onClose onSent={(id)=>void} />`.

- [ ] **Step 1: Failing test**

```tsx
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { desktop } from "../bridge";
import { ReportDialog } from "./ReportDialog";

vi.mock("../bridge", () => ({
  native: true,
  desktop: {
    supportCandidates: vi.fn(() => Promise.resolve([{ name: "CMakeLists.txt", bytes: 120 }, { name: "Makefile", bytes: 80 }])),
    supportReadFile: vi.fn((_: string, name: string) => Promise.resolve(`content of ${name}`)),
    supportSend: vi.fn(() => Promise.resolve("report-1")),
    supportMarkReported: vi.fn(() => Promise.resolve()),
  },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
const local = {
  runId: "run-1", exitCode: 0, cancelled: false, report: null,
  stdout: "|1| == CoreTrace == [WARN] (flawfinder) Failed, so this file is unanalysed by it.\nError: python: can't open file\n",
  stderr: "", warnings: ["Un ou plusieurs outils n’ont pas pu terminer l’analyse."],
};

it("lists the build files ticked, states the privacy promise, and sends", async () => {
  const onSent = vi.fn();
  render(<ReportDialog workspaceId="w1" local={local} onClose={vi.fn()} onSent={onSent} />);
  expect(await screen.findByLabelText("CMakeLists.txt")).toHaveProperty("checked", true);
  expect(screen.getByText(/Ces données restent privées/)).toBeDefined();
  await userEvent.type(screen.getByLabelText(/Quelles librairies/), "SDL2");
  await userEvent.click(screen.getByLabelText("Makefile")); // untick
  await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await waitFor(() => expect(onSent).toHaveBeenCalledWith("report-1"));
  const sent = vi.mocked(desktop.supportSend).mock.calls[0][0];
  expect(sent.tools).toEqual(["flawfinder"]);
  expect(sent.libraries).toBe("SDL2");
  expect(sent.files.map((f) => f.name)).toEqual(["CMakeLists.txt"]);
  expect(sent.log).toContain("can't open file");
  expect(desktop.supportMarkReported).toHaveBeenCalledWith("w1", "run-1");
});

it("shows the platform's refusal in place", async () => {
  vi.mocked(desktop.supportSend).mockRejectedValueOnce(new Error("Vous avez atteint la limite de rapports. Réessayez dans 3 heures."));
  render(<ReportDialog workspaceId="w1" local={local} onClose={vi.fn()} onSent={vi.fn()} />);
  await screen.findByLabelText("CMakeLists.txt");
  await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("3 heures"));
});
```

- [ ] **Step 2: Run** `npx vitest run desktop/features/ReportDialog.test.tsx` — FAIL: module missing.

- [ ] **Step 3: Implement**

```tsx
import { Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { desktop, errorMessage } from "../bridge";
import { Dialog } from "../components/Dialog";
import type { LocalResult } from "../types";

const CAP = 2 * 1024 * 1024;
const LOG_LIMIT = 512 * 1024;

/** The tools ctrace said did not complete, from its own summary lines. */
export function failedTools(output: string): string[] {
  const tools: string[] = [];
  for (const line of output.split("\n")) {
    const m = /== CoreTrace == \[WARN\] \(([^)]+)\)/.exec(line);
    if (m && !tools.includes(m[1])) tools.push(m[1]);
  }
  return tools.length ? tools : ["ctrace"];
}

function signature(output: string): string {
  const line = output.split("\n").map((l) => l.trim()).find((l) => /error|failed|not found|cannot/i.test(l)) ?? "";
  return line.slice(0, 200);
}

function truncate(log: string): string {
  if (log.length <= LOG_LIMIT) return log;
  const half = LOG_LIMIT / 2;
  return `${log.slice(0, half)}\n[… journal tronqué : ${log.length - LOG_LIMIT} caractères omis …]\n${log.slice(-half)}`;
}

function kilobytes(n: number): string {
  return n < 1024 ? `${n} o` : `${Math.round(n / 1024)} Ko`;
}

export function ReportDialog({ workspaceId, local, onClose, onSent }: {
  workspaceId: string;
  local: LocalResult;
  onClose: () => void;
  onSent: (id: string) => void;
}) {
  const log = useMemo(() => truncate(`${local.stdout}\n${local.stderr}`), [local]);
  const tools = useMemo(() => failedTools(`${local.stdout}\n${local.stderr}`), [local]);
  const [candidates, setCandidates] = useState<{ name: string; bytes: number }[]>([]);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState<{ name: string; content: string }[]>([]);
  const [libraries, setLibraries] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void desktop.supportCandidates(workspaceId).then((found) => {
      setCandidates(found);
      setTicked(Object.fromEntries(found.map((f) => [f.name, true])));
    }).catch((e) => setError(errorMessage(e)));
  }, [workspaceId]);

  const attachedBytes = candidates.filter((c) => ticked[c.name]).reduce((n, c) => n + c.bytes, 0)
    + extra.reduce((n, f) => n + f.content.length, 0);
  const total = log.length + attachedBytes;
  const lines = log.split("\n").length;

  const send = async () => {
    setSending(true);
    setError("");
    try {
      const files = [...extra];
      for (const c of candidates) {
        if (ticked[c.name]) files.push({ name: c.name, content: await desktop.supportReadFile(workspaceId, c.name) });
      }
      const id = await desktop.supportSend({
        tools, signature: signature(`${local.stdout}\n${local.stderr}`),
        ctrace_version: /ctrace[^\n]*?(\d+\.\d+\.\d+)/.exec(local.stdout)?.[1] ?? "",
        desktop_version: "6.0.0-beta.1", os: navigator.platform, libraries, log, files,
      });
      await desktop.supportMarkReported(workspaceId, local.runId);
      onSent(id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog title="Signaler l’échec d’un outil" close={onClose}>
      <p>
        Sera envoyé : le journal complet de ctrace ({lines} lignes, {kilobytes(log.length)}),
        la version de ctrace, votre système et la version de CoreTrace Desktop.
        Outils concernés : <strong>{tools.join(", ")}</strong>.
      </p>
      <label>
        Quelles librairies utilisez-vous dans votre projet ?
        <textarea rows={3} value={libraries} onChange={(e) => setLibraries(e.target.value)} placeholder="SDL2, libcurl, un allocateur maison…" />
      </label>
      <fieldset>
        <legend>Fournissez votre Makefile / CMakeLists.txt / configuration de build</legend>
        {candidates.length === 0 && <p className="muted small">Aucun fichier de build trouvé à la racine du dossier.</p>}
        {candidates.map((c) => (
          <label key={c.name} className="checkbox">
            <input type="checkbox" checked={!!ticked[c.name]} onChange={(e) => setTicked({ ...ticked, [c.name]: e.target.checked })} />
            {c.name} <span className="muted small">{kilobytes(c.bytes)}</span>
          </label>
        ))}
        {extra.map((f) => (
          <label key={f.name} className="checkbox">
            <input type="checkbox" checked readOnly onChange={() => setExtra(extra.filter((x) => x.name !== f.name))} />
            {f.name} <span className="muted small">{kilobytes(f.content.length)}</span>
          </label>
        ))}
        <button type="button" onClick={() => {
          const name = window.prompt("Chemin du fichier, relatif au dossier ouvert :");
          if (!name) return;
          void desktop.supportReadFile(workspaceId, name).then((content) => setExtra([...extra, { name: name.split(/[\\/]/).pop() ?? name, content }])).catch((e) => setError(errorMessage(e)));
        }}>Ajouter un fichier…</button>
        <p className="muted small">Total : {kilobytes(total)} sur {kilobytes(CAP)}.</p>
      </fieldset>
      <p>
        <strong>Ces données restent privées. Nous les examinons uniquement pour améliorer et mettre à jour nos outils.</strong>
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <footer>
        <button onClick={onClose}>Annuler</button>
        <button className="primary" disabled={sending || total > CAP} onClick={() => void send()}>
          <Send size={15} /> {sending ? "Envoi…" : "Envoyer"}
        </button>
      </footer>
    </Dialog>
  );
}
```
(Replace `window.prompt` with a `Dialog` input if the confirm provider can host one; `prompt` is the minimum that satisfies "Ajouter un fichier…" without a native picker crossing the workspace boundary.)

`Analyses.tsx`, in the *Dernière analyse locale* heading, after the badge:
```tsx
{(local.warnings?.length || local.exitCode !== 0) && (
  cloud.me ? (
    <button disabled={reportedRuns.has(local.runId)} onClick={() => setReporting(true)}>
      <Send size={14} /> {reportedRuns.has(local.runId) ? "Rapport envoyé" : "Envoyer un rapport"}
    </button>
  ) : (
    <button onClick={login}>Connectez-vous pour envoyer un rapport</button>
  )
)}
{reporting && workspaceId && (
  <ReportDialog workspaceId={workspaceId} local={local} onClose={() => setReporting(false)}
    onSent={(id) => { setReporting(false); markReported(local.runId); notify("Rapport envoyé, merci."); }} />
)}
```
with props `reportedRuns: Set<string>`, `markReported: (runId: string) => void`, `login: () => void`, `workspaceId?: string` added to `Analyses`, and `App` holding `reportedRuns` (seeded from `localHistory.filter(r => r.reported)`).

- [ ] **Step 4: Run** all frontend checks — PASS; add `supportSend` etc. to the `Analyses.test.tsx` bridge mock as needed.
- [ ] **Step 5: Commit** — `feat(desktop): report a tool that failed, privately, to the team`

---

### Task 8: Ship

- [ ] Control: push `feat/support-reports`, open the PR, wait for `unit`/`lint`/`integration`; merge; `deploy.sh`; `status.sh`.
- [ ] Put `smtp.env` and `smtp.password` in `C:\CoreTraceStuff\prod\` (the user provides the OVH SMTP credentials); redeploy; send one report from the desktop against production and confirm the mail arrives at `cedric.roulof@coretrace.fr`.
- [ ] Desktop: push, build the installer, send it.

## Self-review

- Spec coverage: trigger (T7), dialog contents and statement (T7), payload (T4/T6), storage and keys (T1/T3), limits with `Retry-After` and French sentence (T3/T4), mail transport, body, attachments cap, disabled/failed states (T2/T3/T5), env and deploy (T5), reported-state persistence (T6/T7), tests (each task). Out-of-scope items untouched.
- Placeholders: none; the one `prompt()` is called out as the minimum, not a TODO.
- Types: `support.Report/File/Service/LimitError/TooLargeError` used identically in T3, T4, T5; `ReportBody` fields match the OpenAPI names in T4 and the frontend payload in T7; `LocalResult.runId` added in T6 and consumed in T7.
