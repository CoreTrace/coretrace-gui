# CoreTrace Desktop — ATP data set

Every file below was analysed from CoreTrace Desktop v6.0.0-beta.3 with
**ctrace v0.85.0** and its packaged tool configuration
(`/opt/coretrace/config/tool-config.json`, selected automatically), in the Docker
environment of these appendices.

The "Expected result" column of the test plan is taken from these runs. A
scenario is validated when the *Analyses* page shows the counts and locations
listed here.

| File | Results | Detail |
|---|---|---|
| `DS01_stack_overflow.c` | 1 warning | `StackBufferOverflow` on `buf` (size 16) at line 12, "index variable may go up to 32 (array last valid index: 15)", write access |
| `DS02_clean.c` | none | Status *Terminée*, "Aucun problème signalé dans les rapports chargés." |
| `DS03_index_oob.c` | 2 warnings | `StackBufferOverflow` on `tab` (size 10) at line 9; `UninitializedLocalRead` at line 10 |
| `DS04_infeasible_path.c` | none | The overflow is on a path the guard makes unreachable — no false positive is reported |
| `DS05_recursion.c` | 1 error + 1 note | `Recursion.Unconditional` (error) and `Recursion.Detected` (note), both at line 9. The status reads *Échouée* because ctrace exits with an error code when it finds an error-level defect |
| `DS06_cpp_array_oob.cpp` | 2 warnings | Same shape as DS03 on a C++ input: `StackBufferOverflow` on `tab` (size 8) at line 10, `UninitializedLocalRead` at line 12 |
| `DS07_invalid.txt` | none | Status *Terminée avec avertissements*; the unfolded output quotes "Unsupported input file type" |

## Notes for the tester

- Line numbers refer to the files exactly as shipped. Scenario F5 adds a comment
  at the **end** of `DS02_clean.c`, which does not shift any reported line.
- The analyser starts from the `main` entry point. A bug placed in a function
  that `main` never reaches is intentionally not reported.
- Badges on the *Analyses* page: **E** error, **W** warning, **N** note.
