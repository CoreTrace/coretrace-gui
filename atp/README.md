# ATP delivery — CoreTrace GUI

What to upload on the Innovation platform:

| File | Where it goes |
|---|---|
| `CoreTrace-GUI_ATP.xlsx` | the ATP Excel |
| `CoreTrace-GUI_ATP_appendices.zip` | the appendices archive (limit: 200 MB) |

The workbook is built from `ATP_template.xlsx` and keeps its two tabs:

- **Info & Access** — download links, the Docker environment, the test data set
  with its verified expected results, and the notes a tester needs.
- **Test Plan** — 24 scenarios (`F1`…`F24`), all run in the Docker environment
  so the plan is reproducible on any OS, with Feature ID, name, category,
  objective, prerequisites, numbered steps, expected result and development
  status. The **Feedback** column is intentionally empty: the tester fills it.

## Scope

Only **CoreTrace Desktop v6.0.0-beta.4** (the Tauri rewrite) is under test, from
its published Linux package. Local analysis uses **ctrace v0.85.0**, installed
in the Docker image. `F23` and `F24` (sign-in, cloud analysis) need a CoreTrace
account; connected repositories, dashboards and automatic updates are out of
scope.

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

## Acceptance run on 2026-11-22

Tested the published v6.0.0-beta.3 Linux package and ctrace v0.85.0 from the
appendices ZIP on Docker Desktop for macOS (amd64 container, UID 501).
The run used a fresh dataset and a signed-out session.

| Scenarios | Result | Observed |
|---|---|---|
| F1–F9 | PASS | noVNC connected, version and licence matched, edits persisted on the host, discard and refresh worked, and the app prompted for and accepted ctrace. |
| F10–F16 | PASS | DS01–DS07 returned 1, 0, 2, 0, 2, 2 and 0 findings. Recursion showed an error and a note. The unsupported file showed the tool failure. |
| F17 | PASS | Clicking the DS01 finding opened the editor on line 12. |
| F18 | FAIL | The app analysed 6 of 6 files and displayed 0 of the expected 7 findings. The raw output contained findings. |
| F19–F21 | PASS | The device-code dialog opened and could be dismissed. Public cloning worked while signed out. Ctrl+S saved to disk. Ctrl+P, Tab, DS01 and Enter opened the file. |
| F22 | FAIL | Ctrl+F left focus in the editor. Typing `buf` edited the source. |
| F23–F24 | Account required (expected) | Sign-in waited for external approval. Cloud analysis was disabled while signed out. No job was submitted or billed. |

## Running F23 and F24

Testers sign in with their own Google account. F23 approves the desktop
device code. F24 requires enough CTU to cover the quote displayed before
confirmation. The reference cloud run was quoted at 4,832 CTU and billed 3,204 CTU.
