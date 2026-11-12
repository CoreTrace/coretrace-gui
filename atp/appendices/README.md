# CoreTrace GUI — acceptance test appendices

Everything a tester needs to run the test plan without help from the team.
No compilation is required: the tests run against the **published binaries** of
release **v5.1.0**.

```
appendices/
├── README.md            ← this file
├── docker/              ← reproducible test environment, runs on any OS with Docker
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── build.sh
│   └── run.sh
└── datasets/            ← C/C++ corpus with known, verified expected results
    ├── MANIFEST.md      ← the expected result of every file
    ├── DS01_stack_overflow.c
    ├── DS02_clean.c
    ├── DS03_index_oob.c
    ├── DS04_infeasible_path.c
    ├── DS05_recursion.c
    ├── DS06_cpp_array_oob.cpp
    ├── DS07_invalid.txt
    └── DS08_large_file.c
```

## Download links

| Item | Link |
|---|---|
| Release under test (v5.1.0) | https://github.com/CoreTrace/coretrace-gui/releases/tag/v5.1.0 |
| Source code | https://github.com/CoreTrace/coretrace-gui |
| API documentation | https://coretrace.github.io/coretrace-gui/ |

## Setup — Docker (Linux, macOS or Windows)

The whole test plan runs in this environment, whatever your operating system.
Requires Docker and about 3 GB of free disk space (on Windows, run the scripts
from WSL or Git Bash; on a Mac, give Docker Desktop at least 6 GB of RAM). The image downloads the
AppImage, extracts it, and serves the running application over noVNC, so the
only thing you need locally is a browser.

```sh
cd appendices/docker
./build.sh            # ~5 min, downloads the AppImage once
./run.sh              # mounts ../datasets at /home/tester/workspace
```

Then open <http://localhost:6080/>. The page connects on its own — there is no
Connect button to find, and the CoreTrace GUI window fills the canvas. Inside
the app, the test data set is at `/home/tester/workspace`.

Stop the container with `Ctrl+C` in the terminal running `run.sh`.

### If the browser shows nothing

The container prints a lot at startup — xkbcomp keysym warnings, a D-Bus
connection error, `Xlib: extension "DPMS" missing`. All three are normal in a
headless container and none of them stops the application. Judge the container
by these instead:

```sh
docker exec coretrace-gui-atp xwininfo -root -tree -display :99 | grep "CTrace GUI"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:6080/
```

The first must list a `1200x800` window, the second must print `200`. If both
hold, the application is running and the problem is the browser view: open
<http://localhost:6080/vnc_lite.html>, or hard-reload the page (Ctrl+Shift+R) in
case an older non-connecting version of it was cached.

## clang 20

The analyser compiles the source under test to LLVM IR before analysing it and
needs clang 20. The Docker image already contains it. Without it the analyser
does not report an error — it returns "0 diagnostics" for every file — so
scenario **F9** checks the toolchain before the analysis scenarios.

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
