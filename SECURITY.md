# Security Policy

## Supported versions

| Version                       | Supported |
| ----------------------------- | --------- |
| 6.x (Tauri desktop, `main`)   | Yes       |
| 5.x and earlier (Electron)    | No        |

Only the latest 6.x pre-release receives fixes. The Electron implementation kept in
`src/` is reference code: it is not built, shipped or patched.

## Reporting a vulnerability

Do not open a public issue, discussion or pull request for a vulnerability.

Report it privately through GitHub:
[Security → Report a vulnerability](https://github.com/CoreTrace/coretrace-gui/security/advisories/new).

Include:

- the affected version or commit, and the operating system;
- the component (React UI, native command, cloud API client, local `ctrace` runner);
- reproduction steps or a proof of concept;
- the impact you observed or expect.

We aim to acknowledge reports within 5 working days and to share an assessment and
remediation plan within 15 working days. We will credit you in the advisory unless you
ask us not to. Please give us reasonable time to release a fix before disclosing.

Vulnerabilities in the CoreTrace cloud service itself (`api.coretrace.fr`,
`app.coretrace.fr`) may be reported through the same channel; we will route them.

## Scope

In scope, among others:

- escaping the chosen workspace when reading, writing or listing files, including
  through links, `..` segments or Git metadata;
- exposing access or refresh tokens to the web view, logs, `localStorage` or config files;
- reaching native commands or the network from the web view beyond what
  `src-tauri/capabilities/` and the Content Security Policy allow;
- accepting non-HTTPS API, device-login or report URLs outside loopback development;
- command or argument injection when cloning repositories or running `ctrace`;
- tampered or unverified cloud reports being displayed as verified;
- spending CTU without explicit user confirmation.

Out of scope:

- findings that require an already compromised machine or user account;
- vulnerabilities in third-party analysers run by `ctrace`, Git, or the OS credential
  manager (report them upstream);
- the browser preview (`npm run dev`), which has no filesystem, Git or account access;
- missing code signing or automatic updates: release builds are currently unsigned and
  this is documented in the [README](README.md#build-and-verify).

## Security design notes

- The web view only holds the `core:default` and window-destroy permissions; workspace,
  Git, process and network access live in Rust commands.
- Access tokens stay in Rust memory; refresh tokens are stored in the OS credential
  manager, keyed by API URL.
- File edits are confined to the workspace, limited to 4 MiB UTF-8 text, and saved
  atomically after checking the on-disk revision.
- Reports, process output, run duration and clone duration are capped.
- Opening or cloning a repository never builds it or installs its dependencies.
