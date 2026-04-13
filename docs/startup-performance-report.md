# Startup Performance Report

## Scope

This report documents the performance investigation and optimization work applied to the CtraceGUI startup path on Linux AppImage builds.

Test context:
- Platform: Fedora Linux
- Package format: AppImage
- Build command: `npm run dist`
- Scenario: application launch with an existing saved session containing 5 tabs
- Evidence source: terminal startup logs emitted by `[StartupTiming]`, `[StateHandlers]`, and `[UpdaterHandlers]`

## 1. Chosen Indicators

The startup work was measured with the following technical indicators.

| Indicator | Definition | Why it matters | Source | Integration into dev cycle |
| --- | --- | --- | --- | --- |
| `app.whenReady` time | Time from main process entry to Electron `app.whenReady()` | Measures Electron/runtime/bootstrap overhead before the app can create UI | `[StartupTiming] app.whenReady resolved` | Logged on every launch; extracted by `scripts/benchmark-startup.sh` |
| `ready-to-show` time | Time from main process entry to `BrowserWindow` ready-to-show | Measures time until the window is visible to the user | `[StartupTiming] Main window ready-to-show` | Logged on every launch; extracted by `scripts/benchmark-startup.sh` |
| `restored-session-ready` time | Time from main process entry to restored session being usable | Main user-facing KPI for this project because the app is expected to restore prior work quickly | `[StartupTiming] restored-session-ready` | Logged on every launch; extracted by `scripts/benchmark-startup.sh` |

Supporting diagnostic metrics were also logged during the investigation:
- `BrowserWindow created`
- `Renderer did-finish-load`
- `rendererElapsedMs` inside the restore-completion event

## 2. Measurement Method

### Instrumentation added

Startup instrumentation was added in the following places:
- [src/main.js](/home/shookapic/Project/coretrace-gui/src/main.js:11)
- [src/renderer/UIController.js](/home/shookapic/Project/coretrace-gui/src/renderer/UIController.js:1)

These logs now expose a consistent startup timeline:
- main process entry
- Electron readiness
- window creation
- first visible window
- restored session ready

### Repeatable benchmark script

A benchmark helper was added:
- [scripts/benchmark-startup.sh](/home/shookapic/Project/coretrace-gui/scripts/benchmark-startup.sh:1)

Usage:

```bash
scripts/benchmark-startup.sh ./dist/CtraceGUI-4.4.1.AppImage 3 15
```

Output format:

```text
run,when_ready_ms,window_created_ms,ready_to_show_ms,restored_session_ready_ms,renderer_restore_ms
1,250,371,2637,2899,316
...
```

This output is CSV-compatible and can be imported into a spreadsheet or dashboard.

## 3. Test Scenarios

### Comparative efficiency tests

Three representative scenarios were used:

1. Baseline packaged startup before optimization
2. First launch after rebuild with optimizations applied
3. Warm relaunch with optimizations applied

### Resilience tests

Manual interruption behavior was exercised during repeated runs:
- app interrupted with `Ctrl+C` once the UI became usable
- state-save path executed successfully
- CTrace backend shutdown completed cleanly

Observed resilience evidence:
- `[Main] Requesting state save before quit...`
- `[StateHandlers] State saved successfully`
- `ctrace serve exited` or backend shutdown completion logs

### Simulation scenario

The practical simulation scenario used for evaluation was:
- packaged Linux AppImage
- restored previous session with 5 tabs
- full main window startup, state restore, updater initialization, and backend preload

This matches the main real-world complaint: long startup time before the interface becomes usable.

## 4. Results

### Tracking table

| Metric | Baseline before optimization | Optimized first run after build | Optimized warm run | Improvement vs. baseline |
| --- | ---: | ---: | ---: | ---: |
| `app.whenReady` | 6496 ms | 250 ms | 272 ms | 95.8% to 96.2% faster |
| `BrowserWindow created` | 13520 ms | 371 ms | 397 ms | 97.1% to 97.3% faster |
| `ready-to-show` | 27274 ms | 2637 ms | 2645 ms | 90.3% faster |
| `restored-session-ready` | 30104 ms | 2899 ms | 2929 ms | 90.3% to 90.4% faster |
| Renderer restore work only | 3481 ms | 316 ms | 277 ms | 90.9% to 92.0% faster |

### Before/after evidence

Representative baseline run before optimization:

```text
[StartupTiming] app.whenReady resolved ... (6496ms since process start)
[StartupTiming] BrowserWindow created ... (13520ms since process start)
[StartupTiming] Main window ready-to-show ... (27274ms since process start)
[StartupTiming] restored-session-ready ... (30104ms since process start)
```

Representative optimized run after the startup changes:

```text
[StartupTiming] app.whenReady resolved ... (250ms since process start)
[StartupTiming] BrowserWindow created ... (371ms since process start)
[StartupTiming] Main window ready-to-show ... (2637ms since process start)
[StartupTiming] restored-session-ready ... (2899ms since process start)
```

Warm relaunch after the same build:

```text
[StartupTiming] app.whenReady resolved ... (272ms since process start)
[StartupTiming] BrowserWindow created ... (397ms since process start)
[StartupTiming] Main window ready-to-show ... (2645ms since process start)
[StartupTiming] restored-session-ready ... (2929ms since process start)
```

## 5. Bottleneck Analysis

### Initial bottlenecks

The startup investigation showed that the original latency was not primarily caused by state restore itself.

Main friction points identified:
- AppImage/package startup overhead before Electron was ready
- expensive `BrowserWindow` and renderer startup path
- many renderer scripts loaded directly in `index.html`
- synchronous preload file reads
- nonessential startup work executing on the first-paint path
- updater/backend startup tasks competing with UI visibility
- remote dependency in main window (`d3js.org`) creating avoidable startup risk

### What the metrics showed

The key finding was:
- session restore was only a small portion of the original total time
- the dominant problem was early startup and renderer boot
- improving packaging and critical-path loading delivered far larger gains than tuning restore logic alone

## 6. Implemented Optimizations

### Packaging

Changed Electron Builder compression from `maximum` to `normal` in:
- [package.json](/home/shookapic/Project/coretrace-gui/package.json:67)

Rationale:
- `maximum` compression reduced distribution size but heavily penalized startup time in AppImage format
- `normal` is a better trade-off for desktop UX where launch latency matters more than minimal package size

### Renderer boot optimization

Bundled renderer scripts into one generated file:
- [scripts/build-renderer-bundle.js](/home/shookapic/Project/coretrace-gui/scripts/build-renderer-bundle.js:1)
- [src/renderer/bundle.js](/home/shookapic/Project/coretrace-gui/src/renderer/bundle.js:1)

Updated HTML bootstrap:
- [src/index.html](/home/shookapic/Project/coretrace-gui/src/index.html:35)

Actions:
- replaced many head-loaded script tags with one deferred bundle
- delayed Monaco loader until after `DOMContentLoaded` and first animation frame
- removed the main window’s remote D3 dependency

Rationale:
- fewer blocking script evaluations before first paint
- simpler and more cache-friendly renderer startup path
- lower risk of network-related startup stalls

### Preload optimization

Updated:
- [src/preload.js](/home/shookapic/Project/coretrace-gui/src/preload.js:1)

Actions:
- removed eager synchronous reads of `package.json`
- removed eager synchronous reads of `syntax-config.json`
- replaced them with lazy async getters: `getAppInfo()` and `getSyntaxConfig()`

Rationale:
- preload code runs very early and should avoid synchronous filesystem work
- the values were not required before first paint

### Deferring nonessential renderer work

Updated:
- [src/renderer/UIController.js](/home/shookapic/Project/coretrace-gui/src/renderer/UIController.js:194)

Deferred until after first paint:
- version label loading
- file tree watcher setup
- auto-save state loading and listener wiring
- file tree context menu setup
- WSL status listener
- updater status listener

Rationale:
- these tasks are useful but not required to render the first usable interface
- deferring them reduces contention during the critical startup path

### Deferring background services

Updated:
- [src/main.js](/home/shookapic/Project/coretrace-gui/src/main.js:593)

Actions:
- deferred updater setup until after the window became visible
- deferred CTrace server preload until after initial UI readiness

Rationale:
- the user should see and use the UI before background maintenance work starts

## 7. Trade-offs and Technical Rationale

| Decision | Benefit | Cost / trade-off | Result |
| --- | --- | --- | --- |
| Reduce AppImage compression | Major startup reduction | Slightly larger artifact | Accepted |
| Bundle renderer files | Lower startup overhead, fewer blocking script loads | Generated artifact must be rebuilt before packaging | Accepted |
| Lazy preload reads | Removes sync I/O from critical path | Async access pattern in renderer | Accepted |
| Defer noncritical listeners/setup | Faster first paint and usable UI | Some secondary features initialize slightly later | Accepted |
| Defer updater/backend preload | Better perceived startup | Background services start a moment later | Accepted |

Key architectural trade-off:
- The optimizations prioritize user-perceived startup latency over doing all setup immediately.
- This is appropriate for a desktop IDE-like application where fast interaction matters more than eager background initialization.

## 8. Limits and Remaining Observations

Current startup is now approximately:
- 2.6 s to visible window
- 2.9 s to restored session ready

This is a major improvement and likely within an acceptable range for a packaged Electron desktop app with Monaco and session restore.

Remaining limits:
- first launch after rebuild can still be slower than warm relaunch because of packaging/filesystem cache effects
- Monaco initialization still contributes meaningful cost
- no visual dashboard screenshot was produced; current monitoring is log-based and CLI-driven

## 9. Applied Optimization Plan Summary

1. Instrument startup milestones with precise timing logs.
2. Establish baseline from packaged runs with restored session.
3. Identify critical-path bottlenecks instead of optimizing by intuition.
4. Remove packaging and bootstrap penalties first.
5. Defer all nonessential startup work.
6. Re-test cold and warm launches.
7. Preserve the benchmark tooling for future regressions.

## 10. Conclusion

The startup optimization work achieved a measured and repeatable performance gain.

Outcome:
- packaged launch time to usable restored session dropped from about `30.1 s` to about `2.9 s`
- visible-window time dropped from about `27.3 s` to about `2.6 s`
- Electron readiness dropped from about `6.5 s` to about `0.25 s`

This result is supported by direct before/after timing logs, repeatable measurement tooling, and documented code changes tied to specific bottlenecks rather than intuition.
