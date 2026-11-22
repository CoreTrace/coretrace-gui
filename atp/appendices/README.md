# CoreTrace Desktop — acceptance test appendices

Everything a tester needs to run the test plan without help from the team.
No compilation is required: the tests run against the **published package** of
release **v6.0.0-beta.4**. The interface is in French; the test plan quotes its
labels as displayed.

```
appendices/
├── README.md            ← this file
├── docker/              ← reproducible test environment, runs on any OS with Docker
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── build.sh
│   ├── run.sh
│   └── tester.sh
└── datasets/            ← C/C++ corpus with known, verified expected results
    ├── MANIFEST.md      ← the expected result of every file
    ├── DS01_stack_overflow.c
    ├── DS02_clean.c
    ├── DS03_index_oob.c
    ├── DS04_infeasible_path.c
    ├── DS05_recursion.c
    ├── DS06_cpp_array_oob.cpp
    └── DS07_invalid.txt
```

## Download links

| Item | Link |
|---|---|
| Release under test (v6.0.0-beta.4) | https://github.com/CoreTrace/coretrace-gui/releases/tag/v6.0.0-beta.4 |
| Analyser installed in the image (ctrace v0.85.0) | https://github.com/CoreTrace/coretrace/releases/tag/v0.85.0 |
| Source code | https://github.com/CoreTrace/coretrace-gui |

## Setup — Docker (Linux, macOS or Windows)

The whole test plan runs in this environment, whatever your operating system.
Requires Docker and about 3 GB of free disk space (on Windows, run the scripts
from WSL or Git Bash; on a Mac, give Docker Desktop at least 6 GB of RAM). The
image installs the published Linux package and the ctrace analyser, and serves
the running application over noVNC, so the only thing you need locally is a
browser.

```sh
cd appendices/docker
./build.sh            # ~5 min the first time
./run.sh              # mounts ../datasets at /home/tester/workspace
```

On Linux, use Docker Engine with its default UID mapping. Rootless Docker and
daemons configured with `userns-remap` translate file owners on bind mounts,
so the tester cannot write the host-owned dataset with its default permissions.

Build and run as the user who owns the extracted dataset. If you override
`TESTER_UID`, set it to the same value for both commands. Each UID gets its
own image and container. If another tester is using port 6080, run
`ATP_PORT=6081 ./run.sh` and open the address it prints.

By default, open <http://localhost:6080/>. The page connects on its own — there is no
Connect button to find — and shows the CoreTrace window. Inside the app, the
test data set is at `/home/tester/workspace`.

Stop the container with `Ctrl+C` in the terminal running `run.sh`, or by closing
the application window. Nothing is kept between two runs of the container: the
analyser has to be selected again (scenario **F9**).

### File pickers

The application opens the system's file picker to choose a folder or the
analyser. Browse with the mouse (`Home`, then `workspace`), or type a path
starting with `/`: the first `/` opens the path field. Browser shortcuts such as
Ctrl+L act on your own browser, not on the picker.

### If the browser shows nothing

The container prints a lot at startup — xkbcomp keysym warnings,
`Xlib: extension "DPMS" missing`. They are normal in a headless container and do
not stop the application. Judge the container by these instead:

```sh
# Use the container name and port printed by run.sh (example for UID 1000).
docker exec coretrace-gui-atp-1000 xwininfo -root -tree -display :99 | grep '"CoreTrace"'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:6080/
```

The first must list a `1440x940` window, the second must print `200`. If both
hold, the application is running and the problem is the browser view: open
<http://localhost:6080/vnc_lite.html>, or hard-reload the page (Ctrl+Shift+R).

## The analyser

CoreTrace Desktop ships no analyser: local analysis uses a `ctrace` program
chosen once in *Paramètres*. The image provides **ctrace v0.85.0** at
`/opt/coretrace/bin/ctrace`, with clang 20, which it needs to compile the file
under test.

- The release notes of v6.0.0-beta.3 point to ctrace v0.74.0. That version
  writes a report the application cannot read (`Format de rapport non reconnu`),
  which is why the image uses v0.85.0.
- Only the stack analyser built into ctrace runs. cppcheck, tscancode, ikos and
  flawfinder are not installed; *Paramètres* lists them as missing.

## Reporting an anomaly

Fill the **Feedback** column of the test plan with, in this order:

1. `PASS` or `FAIL`.
2. Host operating system (`Linux`, `macOS`, `Windows`).
3. For a `FAIL`: what you observed instead of the expected result, and the
   severity — **blocking** (the feature is unusable or the app crashes),
   **major** (wrong result produced), **minor** (cosmetic or wording).

A scenario is validated only when every expected result is obtained with no
blocking or critical anomaly. Anything blocking or major should also be opened
as an issue at <https://github.com/CoreTrace/coretrace-gui/issues>.
