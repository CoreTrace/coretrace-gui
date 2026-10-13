# Contributing to CoreTrace Desktop

Thanks for your interest. This guide takes you from choosing an issue to a merged pull request.

## Find something to work on

- Issues labelled
  [`good first issue`](https://github.com/CoreTrace/coretrace-gui/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22)
  are scoped for a first contribution.
- Comment on the issue to ask for it; a maintainer assigns it to you and answers questions
  there.
- For a larger change, open an issue first to agree on the approach.
- Report a bug with the steps to reproduce it, your operating system and the version shown in
  the About panel. For a vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening a
  public issue.

## Set up

Install Node.js 22.19 or newer, Rust 1.95 or newer and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) of your platform:

- **Linux** (Ubuntu or Debian), the packages CI installs:
  `sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libdbus-1-dev`
- **Windows**: Microsoft C++ Build Tools and the WebView2 Runtime.
- **macOS**: the Xcode Command Line Tools.

```sh
npm ci
npm start      # the native application
npm run dev    # browser preview: no filesystem, Git or account actions
```

## Where the code is

| Path | Content |
|---|---|
| `desktop/` | React and TypeScript interface, typed native bridge, and its tests (`*.test.ts`, `*.test.tsx`) |
| `src-tauri/src/` | Rust services: workspace, GitHub, cloud account and API, local analysis |
| `desktop/platform-schema.d.ts` | Generated from the cloud platform's API contract: do not edit it by hand |
| `src/`, `tests/` | The old Electron implementation, kept as a reference: do not change it |

The interface is in French: write new labels and messages in French.

## Before you open a pull request

Run what CI runs, on Windows, macOS and Linux:

```sh
npm run check            # TypeScript types
npm run format:check     # Prettier; `npm run format` fixes it
npm test                 # interface tests (Vitest)
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run test:native      # Rust tests
```

Add or update the tests next to the code you change.

## Pull request

- Branch from `main` and name the branch after the issue, `<number>-<short-description>`, for
  example `85-fix-breadcrumb-contrast`. The "Create a branch" link of the issue does it for you.
- Write commit subjects as English Conventional Commits with a scope, for example
  `fix(desktop): raise the contrast of the breadcrumb`.
- In the description, say what changed and why, link the issue (`Closes #85`), list the commands
  you ran, and add a screenshot for any visible change.
- CI must pass on the three systems before a maintainer reviews and merges.

Contributions are licensed under Apache-2.0, like the project (section 5 of the
[license](LICENSE)). This project follows the CoreTrace
[Code of Conduct](https://github.com/CoreTrace/coretrace/blob/main/CODE_OF_CONDUCT.md).
