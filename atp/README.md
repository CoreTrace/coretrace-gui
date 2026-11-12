# ATP delivery — CoreTrace GUI

What to upload on the Innovation platform:

| File | Where it goes |
|---|---|
| `CoreTrace-GUI_ATP.xlsx` | the ATP Excel |
| `CoreTrace-GUI_ATP_appendices.zip` (130 KB) | the appendices archive (limit: 200 MB) |

The workbook is built from `ATP_template.xlsx` and keeps its two tabs:

- **Info & Access** — download links, the Docker environment, the test data set
  with its verified expected results, and the notes a tester needs.
- **Test Plan** — 24 scenarios (`F1`…`F24`), all run in the Docker environment so the plan is
  reproducible on any OS with Feature ID, name, category,
  objective, prerequisites, numbered steps, expected result and development
  status. The **Feedback** column is intentionally empty: the tester fills it.

## Scope

Only **coretrace-gui v5.1.0** is under test. The analysis binary is a
prerequisite, shipped inside the release artifacts — testers never build
anything.

## Regenerating the workbook

The scenarios live in `scripts/gen_atp.py` next to this README; re-run it with
`python gen_atp.py` after editing (pass the path of `ATP_template.xlsx` to
rebuild from the blank template; by default it rewrites the existing workbook), then rebuild the archive:

```sh
cd atp && python scripts/make_appendices_zip.py
```

Do **not** rebuild the archive with `shutil.make_archive`. Built from a Windows
working copy it produced a ZIP that failed for every tester: CRLF shebangs, so
`entrypoint.sh` reported *"no such file or directory"*, and mode 0644 scripts,
so `./build.sh` was refused outright. `make_appendices_zip.py` normalises line
endings, sets 0755 on scripts, and marks entries as Unix-created so `unzip`
honours the mode at all.

## Known gaps to close before the next test cycle

Shipped in v5.1.0:

1. **macOS artifact.** ~~The `macos-latest` job is commented out.~~ v5.1.0
   publishes an unsigned `.dmg` and `.zip` for Apple Silicon. Native installs are not
   part of the plan: every scenario runs in Docker.
2. **Ctrl-only shortcuts.** ~~`e.metaKey` was never tested.~~ Shortcuts follow
   the platform (Cmd on macOS). Tab navigation stays on Ctrl
   everywhere, because Cmd+Tab is the macOS application switcher.
3. **Format Document was a no-op** for C/C++ — dropped, along with its scenario.

Still open:

4. **No Intel macOS artifact.** The x64 job targeted `macos-13`, which GitHub
   has retired; a job pinned to a retired label queues forever instead of
   failing, so v5.1.0 shipped without it. The matrix now uses `macos-15-intel`,
   but that fix is not in the v5.1.0 tag. Intel Macs use Docker like everyone else.
5. **The analyser binary is Linux-only.** `bin/ctrace` is an x86-64 ELF, so on
   macOS the app runs but cannot analyse. A Darwin build of ctrace is the real
   fix; the plan avoids the problem by running in Docker.
6. **Third-party analysers are unreachable.** `--invoke=cppcheck` resolves to
   the hard-coded path `/opt/homebrew/bin/cppcheck` and silently produces no
   output. Only `ctrace_stack_analyzer` is exercised by the plan.
7. ~~**The Docker image has not been built end to end here.**~~ It now has
   been, from the delivered archive rather than the working copy: unzip into a
   clean directory, run `build.sh` and `run.sh` from those files, and confirm
   the app window on the virtual display with
   `docker exec <container> xwininfo -root -tree -display :99`. Re-run that
   after any change under `appendices/docker/`.
8. **Windows is not in the plan.** The WSL detection and setup flow
   (`main.js`) has no scenario, and the plan has no OS-specific scenario at all.
