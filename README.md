# CoreTrace Desktop

CoreTrace 6 uses **Tauri 2 / Rust**, **React / TypeScript** and an embedded Monaco editor.
A desktop sidebar connects the personal home, organisation dashboard, repositories,
analyses and code workspace.

## Start

Install Node.js 22.19+, Rust 1.95+ and the platform's
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
Windows requires Microsoft C++ Build Tools and WebView2 Runtime.

```sh
npm ci
npm start
```

`npm start` launches the native application. `npm run dev` is a browser preview;
filesystem, Git and account actions deliberately require Tauri. No demo data or
production credentials are embedded in the preview.

## Use

- **Local code:** Open a folder. Browse the tree, edit files, search with Ctrl/Cmd+F,
  save with Ctrl/Cmd+S. Tabs retain drafts while navigating. Closing dirty tabs,
  switching folders and closing the desktop asks before discarding. Save conflicts
  preserve external edits and your in-memory draft; copy the draft before reopening.
- **GitHub:** Enter `owner/repository` or its HTTPS GitHub URL and choose a parent
  folder. Git clones into a new child directory; existing destinations are never
  overwritten. Private repositories use Git Credential Manager or `gh auth setup-git`.
  CoreTrace does not launch builds or install dependencies while opening or cloning;
  Git uses your existing local configuration.
- **Account:** Approve the device code in your browser. Rust keeps access tokens in
  memory and refresh tokens in the OS credential manager, separated by API URL.
  Credentials never enter React, localStorage or config files. Select the organisation
  in the top bar. Dashboards show its quotas, reported period spend, plan and jobs.
  Missing figures remain unknown. Account settings list members subject to permissions.
- **Cloud analysis:** Select an enabled connected GitHub repository and branch, tag or
  commit, then confirm CTU spending. The repository configuration determines the tools.
  Follow progress, cancel, inspect verified reports and open findings in the matching
  workspace. Retrying an uncertain submission keeps its idempotency key until inputs
  change or submission succeeds. Local edits are not uploaded by this workflow.
- **Local analysis:** Select your installed native `ctrace` executable in Settings,
  with its analysis tools installed. Open a source file, save it and run static analysis.
  SARIF findings, stdout/stderr and cancellation are available. The existing Linux
  `bin/ctrace` cannot run directly on Windows.

The API defaults to `https://coretrace.fr/v1`. Set `CORETRACE_BASE_URL` before launch
for another deployment; `/v1` is added if absent. HTTPS is required except for loopback
API development addresses. Device-browser and signed report URLs require HTTPS.
Web account management links target coretrace.fr.

## Build and verify

```sh
npm run check
npm test
npm run format:check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run test:native
npm run tauri -- build --no-bundle
npm run dist
```

Windows executable: `src-tauri/target/release/coretrace-desktop.exe`.
`npm run dist` builds installers. Builds are unsigned; the CI validates Windows,
macOS and Linux and retains tag installers as artifacts. No automatic publication,
signing or replacement update service is configured by this migration.

## Architecture and current boundaries

- `desktop/`: React features, typed native bridge, platform projections and tests.
- `src-tauri/src/`: workspace, GitHub, cloud authentication/API and local process services.
- `desktop/platform-schema.d.ts`: generated contract snapshot from
  Coretrace-Entreprise/coretrace-web, matching the control plane OpenAPI schema.
- Editing is confined to the chosen workspace, excludes Git metadata and path escapes,
  and accepts UTF-8 text up to 4 MiB. Atomic saves check the on-disk revision. Directory
  listing omits links and dependency/build folders, with a 5,000-entry limit per folder.
- Reports are capped at 10 MiB, output at 1 MiB per stream, local runs at 15 minutes,
  clones at five minutes and cloud history at 200 jobs. Inspect incomplete clone folders
  before retrying. Workspace tabs and the analyser choice last for the session.
- The IDE includes exploration, syntax colouring, tabs, search, editing and findings
  navigation. Terminal, debugger, LSP, extensions, Git commit/push UI, WSL bridging and
  local LLM integrations are not included. Local analysis targets the active source
  file; cloud analysis targets connected GitHub commits. Uploading arbitrary local
  folders to the cloud is not implemented.

See [migration/rollback](docs/tauri-migration.md) and
[validation evidence](docs/desktop-validation.md). The old Electron implementation stays
in `src/` as reference, with its [README](docs/electron-readme.md),
[manifest](docs/electron-package.json) and `tests/`. It is not the new runtime; recover it
in a separate clean worktree at `807e2c9` when needed. Existing user changes are preserved.
