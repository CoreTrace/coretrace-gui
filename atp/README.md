# ATP delivery — CoreTrace GUI

What to upload on the Innovation platform:

| File | Where it goes |
|---|---|
| `CoreTrace-GUI_ATP.xlsx` | the ATP Excel |
| `CoreTrace-GUI_ATP_appendices.zip` (130 KB) | the appendices archive (limit: 200 MB) |

The workbook is built from `ATP_template.xlsx` and keeps its two tabs:

- **Info & Access** — download links, the Docker environment, the test data set
  with its verified expected results, and the notes a tester needs.
- **Test Plan** — 56 scenarios (`F1`…`F56`, plus `F3b`; `F24` retired) with Feature ID, name, category,
  objective, prerequisites, numbered steps, expected result and development
  status. The **Feedback** column is intentionally empty: the tester fills it.

## Scope

Only **coretrace-gui v5.1.0** is under test. The analysis binary is a
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

Shipped in v5.1.0:

1. **macOS artifact.** ~~The `macos-latest` job is commented out.~~ v5.1.0
   publishes an unsigned `.dmg` and `.zip` for Apple Silicon. `F3` is now a
   native install with the Gatekeeper steps spelled out.
2. **Ctrl-only shortcuts.** ~~`e.metaKey` was never tested.~~ Shortcuts follow
   the platform, and `F53` covers Cmd on macOS. Tab navigation stays on Ctrl
   everywhere, because Cmd+Tab is the macOS application switcher.
3. **Format Document was a no-op** for C/C++ — dropped, and `F24` is retired
   (the numbering keeps the gap so every cross-reference stays valid).

Still open:

4. **No Intel macOS artifact.** The x64 job targeted `macos-13`, which GitHub
   has retired; a job pinned to a retired label queues forever instead of
   failing, so v5.1.0 shipped without it. The matrix now uses `macos-15-intel`,
   but that fix is not in the v5.1.0 tag. Until an Intel build ships, `F3b`
   routes Intel Macs through Docker.
5. **The analyser binary is Linux-only.** `bin/ctrace` is an x86-64 ELF, so on
   macOS the app runs but cannot analyse — `F54` pins the message it shows
   instead. A Darwin build of ctrace is the real fix; until then, run `F28`
   to `F38` on Linux.
6. **Third-party analysers are unreachable.** `--invoke=cppcheck` resolves to
   the hard-coded path `/opt/homebrew/bin/cppcheck` and silently produces no
   output. Only `ctrace_stack_analyzer` is exercised by the plan.
7. **The Docker image has not been built end to end here** (no Docker daemon
   available on the authoring machine). Run `appendices/docker/build.sh` once
   before shipping the ZIP.
8. **Windows is not in the plan.** The WSL detection and setup flow
   (`main.js`) has no scenario, because the delivery targets Linux and macOS.
