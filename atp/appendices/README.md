# CoreTrace GUI — acceptance test appendices

Everything a tester needs to run the test plan without help from the team.
No compilation is required: the tests run against the **published binaries** of
release **v5.0.2**.

```
appendices/
├── README.md            ← this file
├── docker/              ← reproducible Linux environment (also used on macOS)
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
| Release under test (v5.0.2) | https://github.com/CoreTrace/coretrace-gui/releases/tag/v5.0.2 |
| Linux AppImage | https://github.com/CoreTrace/coretrace-gui/releases/download/v5.0.2/CtraceGUI-5.0.2.AppImage |
| Windows installer | https://github.com/CoreTrace/coretrace-gui/releases/download/v5.0.2/CtraceGUI-Setup-5.0.2.exe |
| Source code | https://github.com/CoreTrace/coretrace-gui |
| API documentation | https://coretrace.github.io/coretrace-gui/ |

## Setup A — Linux, through Docker (recommended, and the reference environment)

Requires Docker and about 3 GB of free disk space. The image downloads the
AppImage, extracts it, and serves the running application over noVNC, so the
only thing you need locally is a browser.

```sh
cd appendices/docker
./build.sh            # ~5 min, downloads the 506 MB AppImage once
./run.sh              # mounts ../datasets at /home/tester/workspace
```

Then open <http://localhost:6080/vnc.html> and click **Connect**. The CoreTrace
GUI window fills the noVNC canvas. Inside the app, the test data set is at
`/home/tester/workspace`.

Stop the container with `Ctrl+C` in the terminal running `run.sh`.

## Setup B — Linux, native AppImage

```sh
wget https://github.com/CoreTrace/coretrace-gui/releases/download/v5.0.2/CtraceGUI-5.0.2.AppImage
chmod +x CtraceGUI-5.0.2.AppImage
./CtraceGUI-5.0.2.AppImage
```

If your distribution has no FUSE 2 runtime, run
`./CtraceGUI-5.0.2.AppImage --appimage-extract` and start `squashfs-root/AppRun`
instead.

## Setup C — macOS

There is **no macOS build published for v5.0.2**, so macOS testing goes through
the same Docker environment as Linux:

```sh
cd appendices/docker
./build.sh
./run.sh
```

then open <http://localhost:6080/vnc.html>.

- **Intel Macs** run the image natively.
- **Apple Silicon Macs** run it under `linux/amd64` emulation (the scripts pass
  `--platform linux/amd64` automatically). Everything works, but expect the app
  to start slowly and to feel sluggish. Allocate at least 6 GB of RAM to Docker
  Desktop (Settings → Resources) and enable **Use Rosetta for x86/amd64
  emulation**.

Scenario **F03** in the test plan covers this path explicitly.

## Reporting an anomaly

Fill the **Feedback** column of the test plan with, in this order:

1. `PASS` or `FAIL`.
2. Setup used (`Docker/Linux`, `Native/Linux`, `Docker/macOS-Intel`,
   `Docker/macOS-AppleSilicon`).
3. For a `FAIL`: what you observed instead of the expected result, and the
   severity — **blocking** (the feature is unusable or the app crashes),
   **major** (wrong result produced), **minor** (cosmetic or wording).

A scenario is validated only when every expected result is obtained with no
blocking or critical anomaly. Anything blocking or major should also be opened
as an issue at <https://github.com/CoreTrace/coretrace-gui/issues>.
