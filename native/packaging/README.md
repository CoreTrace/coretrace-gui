# Packaging

## Installer

`installer.nsi` is a real, complete NSIS script matching the old
Electron app's electron-builder NSIS parity target (same product name,
same bundled-resource layout). It is **not compiled or tested in this
environment** -- `makensis` isn't installed here (checked via `where
makensis`), and installing new system tooling without the user's
explicit go-ahead is out of scope for autonomous work. To build it:

```
# 1. Install NSIS: https://nsis.sourceforge.io/
# 2. Build a release binary:
cargo build --release -p coretrace-ui
# 3. Build the installer:
makensis /DAPP_VERSION=1.2.3 packaging\installer.nsi
```

## Code signing

No code-signing certificate exists in this environment (a real
cert costs money and requires identity verification with a CA --
not something obtainable or fakeable here). The installer above is
unsigned. To sign a release build once a cert is available:

```
signtool sign /f path\to\cert.pfx /p <password> /fd sha256 /tr http://timestamp.digicert.com /td sha256 target\release\coretrace-ui.exe
signtool sign /f path\to\cert.pfx /p <password> /fd sha256 /tr http://timestamp.digicert.com /td sha256 target\dist\CtraceGUI-Setup-*.exe
```

Wire this into CI as a signing step gated on secrets being present
(`CODE_SIGN_CERT`, `CODE_SIGN_PASSWORD` or equivalent), not hardcoded
here -- there's nothing to test that step against without a real cert,
so it isn't pretended to be more finished than it is.

## Accessibility

Floem 0.2.0 (the UI framework this app is built on) has no
`accesskit`/OS-accessibility-tree integration -- checked directly in
its `Cargo.toml`, not assumed. That means screen readers and other
assistive technology cannot currently see this app's UI at all: no
labeled controls, no focus announcements, nothing. This is a real,
structural gap the plan flagged as a known risk for native GPU UIs
("commonly lag Electron on screen-reader support") -- it isn't
something fixable at the application level; it needs either an
upstream Floem accessibility integration or a lower-level
platform-accessibility bridge built independently, both of which are
substantial efforts beyond this phase's scope. Documented here plainly
rather than worked around with something cosmetic.
