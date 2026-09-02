# CoreTrace GUI — ATP data set

Every file below was run through the exact binary shipped inside
`CtraceGUI-5.1.0.AppImage` with the panel's default arguments:

```
--invoke=ctrace_stack_analyzer --sarif-format
```

The "Expected result" column of the test plan is taken verbatim from these runs.
A scenario is validated when the analysis panel shows the counts and locations
listed here.

| File | Diagnostics | Detail |
|---|---|---|
| `DS01_stack_overflow.c` | 1 warning | `StackBufferOverflow` on `buf` (size 16) at line 12, "index variable may go up to 32 (array last valid index: 15)", write access |
| `DS02_clean.c` | none | Analysis succeeds, 0 diagnostics — the empty-results state must be shown |
| `DS03_index_oob.c` | 2 warnings | `StackBufferOverflow` on `tab` (size 10) at line 9; `UninitializedLocalRead` (CWE-457, confidence 0.90) at line 10 |
| `DS04_infeasible_path.c` | none | The overflow is on a path the guard makes unreachable — no false positive is reported |
| `DS05_recursion.c` | 1 info + 1 error | "recursive or mutually recursive function detected" (INFO) and "unconditional self recursion detected (no base case)" (ERROR), both at line 9 |
| `DS06_cpp_array_oob.cpp` | 2 warnings | Same shape as DS03 on a C++ input: `StackBufferOverflow` on `tab` (size 8) at line 10, `UninitializedLocalRead` at line 12 |
| `DS07_invalid.txt` | analysis fails | "Unsupported input file type" — the GUI must surface the failure instead of hanging or crashing |
| `DS08_large_file.c` | not analysed | ~2 MB source used only for the partial-loading scenario (the editor shows the first 1 MB and a "Load next 1 MB" button) |

## The results above require clang 20

The analyser compiles each file to LLVM IR before analysing it, using a
toolchain that must match the LLVM it links (`libclang-cpp.so.20.1`). With an
older clang, or none at all, **every file below reports 0 diagnostics** and no
error is printed — `DS02` would look correct while nothing is being analysed.

Verify with scenario **F27b** before running any analysis scenario. Setup A
(Docker) already has clang 20; Setup B (native AppImage) needs it installed.

Both the analyser bundled in v5.1.0 and the v0.74.0 build that the in-app
backend updater installs produce exactly the results above once clang 20 is
present.

## Notes for the tester

- Line numbers refer to the files exactly as shipped. Do not reformat them
  before running a scenario, or the reported lines will shift.
- The analyser starts from the `main` entry point. A bug placed in a function
  that `main` never reaches is intentionally not reported.
- Severity levels map to the panel's badges: INFO, WARNING, ERROR.
