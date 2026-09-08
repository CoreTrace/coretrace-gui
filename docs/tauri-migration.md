# Tauri desktop migration

## Scope and acceptance

Replace the default Electron application with Tauri 2 (Rust) and React/TypeScript.
Deliver a desktop sidebar, personal and organisation dashboards using real platform data,
device sign-in, organisation switching, GitHub repository loading, a local folder explorer
and editable Monaco documents, and local/cloud analysis execution with visible results.

API ownership remains in Coretrace-Entreprise/coretrace-control. Contracts inspected:
`openapi/openapi.yaml`, coretrace-cli device authentication and coretrace-web dashboard
and analysis helpers. Remote repository analyses use the SCM endpoint; local analyses
use an explicitly selected installed ctrace executable. Repository code is never executed
on opening or cloning. Cloud actions that spend CTU require an explicit user action.

## Migration and rollback

Base: `807e2c9`. The Electron source and tests remain as migration reference; its package
manifest is saved alongside this document. Tauri uses `desktop/` and `src-tauri/`, its own
application identifier and OS credential entry. Existing Electron settings and encrypted
credentials are not rewritten or implicitly imported. Sign in once in the new application.
Rollback by checking out the base revision in a separate clean worktree and installing its
dependencies. Never reset over user changes. The pre-existing `native/` directory and ATP
archive modification belong to the user and are excluded from migration commits.

## Stages

1. Tauri/React build foundation and migration contract.
2. Native workspace, GitHub, authentication and analysis services.
3. Desktop UI, dashboards, IDE and analysis flows.
4. Regression checks, desktop build, CI and operating documentation.

The previous terminal, WSL manager, local LLM integrations, extension experiments and
Electron updater are not part of the requested replacement. They remain in the old source.
No production deployment, paid analysis or GitHub publication is performed during validation.

References: https://v2.tauri.app/start/frontend/vite/ and
https://v2.tauri.app/plugin/dialog/.
