# Tauri desktop migration

## Scope and acceptance

Replace the default Electron application with Tauri 2 (Rust) and React/TypeScript.
Deliver a desktop sidebar, personal and organisation dashboards using real platform data,
device sign-in, organisation switching, GitHub repository loading, a local folder explorer
and editable Monaco documents, and local/cloud analysis execution with visible results.

API ownership remains in Coretrace-Entreprise/coretrace-control. Contracts inspected:
`openapi/openapi.yaml`, coretrace-cli device authentication and coretrace-web dashboard
and analysis helpers. Remote repository analyses use the SCM endpoint; local analyses
use an explicitly selected installed ctrace executable. Opening or cloning does not
launch a build or analysis. Git uses the locally configured helpers and filters.
Cloud actions that spend CTU require an explicit user action.

## Migration and rollback

The [pre-Tauri commit](https://github.com/CoreTrace/coretrace-gui/tree/56a6ecf6dee7e15aa1eb9d4a91c8a01383c8020b)
contains the Electron source, tests, assets and dependency lockfile. Tauri uses
`desktop/` and `src-tauri/`, a new application identifier and its own OS credential
entry. Existing Electron settings and encrypted
credentials are not rewritten or implicitly imported. Sign in once in the new application.
To run the old app, check it out in a separate worktree and follow its README.

```sh
git worktree add --detach ../coretrace-electron 56a6ecf6dee7e15aa1eb9d4a91c8a01383c8020b
```

## Stages

1. Tauri/React build foundation and migration contract.
2. Native workspace, GitHub, authentication and analysis services.
3. Desktop UI, dashboards, IDE and analysis flows.
4. Regression checks, desktop build, CI and operating documentation.

The pre-Tauri commit also contains the Electron terminal, WSL manager, local LLM
integrations and updater.
No production deployment, paid analysis or GitHub publication is performed during validation.

References: https://v2.tauri.app/start/frontend/vite/ and
https://v2.tauri.app/plugin/dialog/.
