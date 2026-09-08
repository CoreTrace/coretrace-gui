# Desktop migration validation

Validated on Windows x64 on 2026-09-08, using Node 22.19.0 and Rust 1.95.0.

## Passing checks

- TypeScript strict check and Vite production build.
- 17 frontend tests: organisation-switch races, partial API failure, sign-out cleanup,
  CTU display semantics, capped/refused outcomes, report parsing and safe file navigation,
  explicit paid-run confirmation, idempotency on retry, rendering untrusted report text,
  save-in-flight editing and retention of conflicted/unsaved drafts.
- 11 native tests: workspace traversal and Git metadata rejection, stale workspace IDs,
  binary rejection, save revisions, external edit preservation, atomic replacement of
  hard links, GitHub input validation, scoped API headers, unauthenticated device requests,
  bounded output, cancellation lifetime and a real test-process/report/cancellation flow.
  Some tests cover several related cases.
- Rustfmt and Clippy for all targets, with warnings treated as errors.
- Prettier check and consistent npm/Tauri/Cargo version `6.0.0-beta.1`.
- Tauri release build: `src-tauri/target/release/coretrace-desktop.exe` (Windows x64).
- Browser visual inspection of the disconnected home/sidebar at approximately 930 px.
  Native-only actions are explicitly identified in browser-preview mode.

The Monaco editor is bundled locally and loaded on demand. Vite reports its large lazy
chunk; the application entry bundle stays separate. No CDN is needed to load the editor.

## Checks requiring a configured deployment or another platform

No production sign-in, paid cloud analysis, private-repository clone, or real installed
ctrace analysis was performed. Cloud tests use a local HTTP fixture; the native runner
test compiles and runs a fixture executable with the real argument/report contract.
OS credential-manager interaction, authenticated live dashboard contents and end-to-end
production reports still require a configured user session. The native window has not
been manually exercised in this validation session.

macOS/Linux builds and installer packaging are defined in CI but were not run locally.
Signing, automatic updates and release publication are not configured. CI itself has
not run because this branch has not been pushed.

## Ownership and rollback

All migration commits use `shookapic <cedric.roulof@epitech.eu>` as sole author and
committer, without co-author trailers. The user's existing ATP archive modification and
untracked `native/` experiments are excluded. See `tauri-migration.md` for rollback and
the main README for the current feature boundaries.
