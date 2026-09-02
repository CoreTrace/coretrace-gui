# ATP delivery — CoreTrace GUI

What to upload on the Innovation platform:

| File | Where it goes |
|---|---|
| `CoreTrace-GUI_ATP.xlsx` | the ATP Excel |
| `CoreTrace-GUI_ATP_appendices.zip` (130 KB) | the appendices archive (limit: 200 MB) |

The workbook is built from `ATP_template.xlsx` and keeps its two tabs:

- **Info & Access** — download links, the Docker environment, the test data set
  with its verified expected results, and the notes a tester needs.
- **Test Plan** — 49 scenarios (`F1`…`F50`, `F24` retired) with Feature ID, name, category,
  objective, prerequisites, numbered steps, expected result and development
  status. The **Feedback** column is intentionally empty: the tester fills it.

## Scope

Only **coretrace-gui v5.0.2** is under test. The analysis binary is a
prerequisite, shipped inside the release artifacts — testers never build
anything.

## Regenerating the workbook

The scenarios live in `scripts/gen_atp.py` next to this README; re-run it with
`python gen_atp.py` after editing, then rebuild the archive:

```sh
cd atp && rm -f CoreTrace-GUI_ATP_appendices.zip \
  && python -c "import shutil; shutil.make_archive('CoreTrace-GUI_ATP_appendices','zip','.','appendices')"
```

## Known gaps to close before the next test cycle

Addressed on the `feat/macos` branch:

1. **No macOS artifact.** ~~The `macos-latest` job is commented out.~~ The
   release matrix now builds an unsigned `.dmg` + `.zip` on `macos-latest`
   (arm64) and `macos-13` (x64), landing in v5.1.0. Once that tag ships, `F3` switches from
   Docker to the native build and its steps must be rewritten (first launch:
   right-click → Open, or `xattr -cr`).
2. **Ctrl-only shortcuts.** ~~`e.metaKey` was never tested.~~ The keydown
   handler now picks Cmd on macOS and Ctrl elsewhere, and the menu hints render
   as ⌘/⇧/⌥. `Ctrl+Tab` and `Ctrl+PageUp/PageDown` stay on Ctrl everywhere,
   because Cmd+Tab is the macOS application switcher.
3. **Format Document was a no-op** for C/C++ — the feature is dropped, and
   scenario `F24` is retired (the plan keeps the gap in its numbering so every
   cross-reference stays valid).

Still open:

4. **The analyser binary is Linux-only.** `bin/ctrace` is an x86-64 ELF, so on
   macOS the app runs but cannot analyse. It now says so explicitly instead of
   failing with "cannot execute binary file", and a native build can be selected
   from *File > Backend Settings* or dropped next to the bundled one as
   `ctrace-darwin-<arch>`. A Darwin build of ctrace is the real fix.
5. **Third-party analysers are unreachable.** `--invoke=cppcheck` resolves to
   the hard-coded path `/opt/homebrew/bin/cppcheck` and silently produces no
   output. Only `ctrace_stack_analyzer` is exercised by the plan.
6. **The Docker image has not been built end to end here** (no Docker daemon
   available on the authoring machine). Run `appendices/docker/build.sh` once
   before shipping the ZIP.
