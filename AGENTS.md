# CoreTrace Desktop

## Repository conventions

- Work on the Tauri 2 desktop. React and TypeScript live in `desktop/`, native services in `src-tauri/src/`. Keep native calls behind the typed bridge. Write user-facing text in French.
- Add interface tests beside the changed component or model. Cover native service behavior with Rust tests, including error paths. Use the existing code style and helpers.
- The old Electron sources in `src/` and `tests/`, generated `desktop/platform-schema.d.ts`, packaged binaries, generated notices and ATP datasets have separate owners or generation steps. Preserve these unless the task specifically targets them. Preserve LICENSE and NOTICE.
- Link a debt issue to deferred work. Each issue records severity, an effort estimate, evidence and a way to verify repayment. See [the register](docs/debt.md).

## Commands

Install Node.js 22.19+, Rust 1.95+ with Clippy and rustfmt, and the platform dependencies in [CONTRIBUTING.md](CONTRIBUTING.md). Run these commands from the repository root.

```sh
npm ci
npm run check
npm run format:check
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri -- build --no-bundle
```

Use `npm start` for native workflows and `npm run dev` for the browser preview. Reproduce the stricter source and dependency measurements with `python3 scripts/measure-debt.py` as described in [docs/debt.md](docs/debt.md).

## Security and dependencies

- Validate native command arguments at the Rust boundary. Confine paths to the selected workspace, including through links. Pass subprocess arguments individually. Preserve size limits, timeouts and cancellation.
- Keep credentials in the native account service and OS credential manager. Keep them out of the webview, logs, fixtures and Git. Treat reports, project files and remote responses as untrusted input.
- Review each new dependency, its license, compatibility with Apache-2.0 and required notices. Record the source and license of reused code. Update the matching lockfile with its package manager and regenerate notices with `npm run notices` when dependencies change.
- Use the private channel in [SECURITY.md](SECURITY.md) for product vulnerabilities.

## Definition of done and review

- Build, run relevant tests, and check formatting and static analysis. Add regression coverage for behavior changes. Investigate new diagnostics and record any accepted debt in the register.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md) for issue branches, scoped English Conventional Commits, and pull requests. Describe the change, tests, dependency changes and remaining debt. Document assistance in the PR according to the team's policy.
- Require passing desktop CI on all three platforms and maintainer review before merge. Refresh the baseline after verifying repayment, keeping the before/after revisions available for comparison.
