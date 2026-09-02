# CoreTrace GUI — acceptance test appendices

Everything a tester needs to run the test plan without help from the team.
No compilation is required: the tests run against the **published binaries** of
release **v5.1.0**.

```
appendices/
├── README.md            ← this file
├── docker/              ← reproducible Linux environment (also used on Intel Macs)
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
| Linux AppImage | https://github.com/CoreTrace/coretrace-gui/releases/download/v5.1.0/CtraceGUI-5.1.0.AppImage |
| Windows installer | https://github.com/CoreTrace/coretrace-gui/releases/download/v5.1.0/CtraceGUI-Setup-5.1.0.exe |
| macOS, Apple Silicon (DMG) | https://github.com/CoreTrace/coretrace-gui/releases/download/v5.1.0/CtraceGUI-5.1.0-arm64.dmg |
| macOS, Apple Silicon (ZIP) | https://github.com/CoreTrace/coretrace-gui/releases/download/v5.1.0/CtraceGUI-5.1.0-arm64-mac.zip |
| macOS, Intel | not published in v5.1.0 — use the Docker setup |
| Source code | https://github.com/CoreTrace/coretrace-gui |
| API documentation | https://coretrace.github.io/coretrace-gui/ |

## Setup A — Linux, through Docker (recommended, and the reference environment)

Requires Docker and about 3 GB of free disk space. The image downloads the
AppImage, extracts it, and serves the running application over noVNC, so the
only thing you need locally is a browser.

```sh
cd appendices/docker
./build.sh            # ~5 min, downloads the AppImage once
./run.sh              # mounts ../datasets at /home/tester/workspace
```

Then open <http://localhost:6080/vnc.html> and click **Connect**. The CoreTrace
GUI window fills the noVNC canvas. Inside the app, the test data set is at
`/home/tester/workspace`.

Stop the container with `Ctrl+C` in the terminal running `run.sh`.

## Setup B — Linux, native AppImage

**Install clang 20 first.** The analyser compiles the source under test to LLVM
IR before analysing it, and needs a toolchain matching the LLVM it links
(`libclang-cpp.so.20.1`). Ubuntu 24.04 ships clang 18, which is not enough:
it fails with `'stddef.h' file not found`.

This matters more than it looks. **Without clang 20 the analyser does not
report an error — it returns "0 diagnostics" for every file.** `F29` (clean
file, no diagnostic) would then appear to pass while nothing is being analysed
at all, and `F28`, `F30`, `F32` and `F33` would fail for a reason no message
explains. Scenario **F27b** exists to catch exactly that, and must be run
before the analysis scenarios.

```sh
wget -qO- https://apt.llvm.org/llvm-snapshot.gpg.key \
  | sudo gpg --dearmor -o /usr/share/keyrings/llvm.gpg
echo "deb [signed-by=/usr/share/keyrings/llvm.gpg] http://apt.llvm.org/noble/ llvm-toolchain-noble-20 main" \
  | sudo tee /etc/apt/sources.list.d/llvm20.list
sudo apt-get update && sudo apt-get install -y clang-20
sudo ln -sf /usr/bin/clang-20 /usr/bin/clang
clang --version      # must report 20.x
```

Then run the application:

```sh
wget https://github.com/CoreTrace/coretrace-gui/releases/download/v5.1.0/CtraceGUI-5.1.0.AppImage
chmod +x CtraceGUI-5.1.0.AppImage
./CtraceGUI-5.1.0.AppImage
```

If your distribution has no FUSE 2 runtime, run
`./CtraceGUI-5.1.0.AppImage --appimage-extract` and start `squashfs-root/AppRun`
instead.

> The Docker environment in Setup A already contains clang 20, which is the
> main reason to prefer it: the analysis scenarios are reproducible there
> without touching your machine's toolchain.

## Setup C — macOS, Apple Silicon (native)

Download
[CtraceGUI-5.1.0-arm64.dmg](https://github.com/CoreTrace/coretrace-gui/releases/download/v5.1.0/CtraceGUI-5.1.0-arm64.dmg),
open it, and drag **CtraceGUI** to Applications.

The build is **unsigned** — signing needs a paid Apple Developer account — so
macOS quarantines it and refuses the first launch. That refusal is expected and
is part of scenario **F3**; it is not a defect. Get past it one of two ways,
depending on what macOS tells you:

- *"cannot be opened because the developer cannot be verified"* →
  **right-click** (or Control-click) the app in Applications and choose
  **Open**, then click **Open** in the dialog. Double-clicking will not work:
  only the Open menu item offers the override.
- *"is damaged and can't be opened"* → that dialog has no Open button, so clear
  the quarantine flag instead:

  ```sh
  xattr -cr /Applications/CtraceGUI.app
  ```

Either way, macOS remembers the decision and every later launch is a normal
double-click.

> On Ventura and later the app may instead appear under **System Settings →
> Privacy & Security**; click **Open Anyway** there and authenticate.

**Analysis does not run on macOS.** The bundled `ctrace` is a Linux binary, so
**Run Analysis** reports that explicitly (scenario **F54**) instead of failing
silently. Everything else — editor, explorer, search, terminal, assistant,
session restore — works. Run the analysis scenarios **F28 to F38** on Linux.

## Setup D — macOS, Intel

v5.1.0 publishes no x64 artifact, so Intel Macs go through the Docker
environment (scenario **F3b**):

```sh
cd appendices/docker
./build.sh
./run.sh
```

then open <http://localhost:6080/vnc.html>. Allocate at least 6 GB of RAM to
Docker Desktop (Settings → Resources).

## Reporting an anomaly

Fill the **Feedback** column of the test plan with, in this order:

1. `PASS` or `FAIL`.
2. Setup used (`Docker/Linux`, `Native/Linux`, `Native/macOS-AppleSilicon`,
   `Docker/macOS-Intel`).
3. For a `FAIL`: what you observed instead of the expected result, and the
   severity — **blocking** (the feature is unusable or the app crashes),
   **major** (wrong result produced), **minor** (cosmetic or wording).

A scenario is validated only when every expected result is obtained with no
blocking or critical anomaly. Anything blocking or major should also be opened
as an issue at <https://github.com/CoreTrace/coretrace-gui/issues>.
