# Desktop debt register

The [baseline](../debt-baseline.json) records a dated measurement of the active React/TypeScript and Tauri/Rust application. The issue register tracks the work behind the numbers.

| Register | Initial entry | Verification |
| --- | --- | --- |
| [Technical debt](https://github.com/CoreTrace/coretrace-gui/issues?q=is%3Aissue+is%3Aopen+label%3Atech-debt) | [#100 · Review stricter TypeScript diagnostics](https://github.com/CoreTrace/coretrace-gui/issues/100) | Run the stricter compiler pass and interface tests. |
| [Security debt](https://github.com/CoreTrace/coretrace-gui/issues?q=is%3Aissue+is%3Aopen+label%3Asecurity-debt) | [#101 · Triage dependency advisories](https://github.com/CoreTrace/coretrace-gui/issues/101) | Record reachability and disposition, update affected lockfiles, then rescan. |

For new entries, use the matching issue form. Record severity, estimated developer-hours, evidence at a specific revision and a closure check. During triage, assign an owner and prioritize reachable high-impact findings. Link the fix and its verification before closing. Follow [SECURITY.md](../SECURITY.md) to report product vulnerabilities privately.

## Initial measurement

At `a63995d` on 2026-11-20, the configured TypeScript check and Clippy were clean. The additional TypeScript checks reported 17 diagnostics. The five highest-count files and the compiler diagnostic codes are in the JSON. All 106 interface tests and 46 native tests passed on Linux. The frontend build succeeded with Vite's existing chunk-size warning.

| Lockfile | Packages scanned | Outdated direct dependencies | Affected packages | Advisory groups (critical / high / medium / low / unscored) |
| --- | ---: | ---: | ---: | --- |
| npm | 227 | 15 | 5 | 2 / 2 / 6 / 1 / 0 |
| Cargo | 514 | 12 | 20 | 2 / 4 / 4 / 3 / 31 |

## Reproduce the snapshot

Use a clean checkout of the revision being measured, the desktop prerequisites in [CONTRIBUTING.md](../CONTRIBUTING.md), Python 3.11+ and OSV-Scanner v2 on PATH. Run from the root. The registries and OSV service must be reachable.

```sh
npm ci
python3 scripts/measure-debt.py > /tmp/gui-debt.json && diff -u debt-baseline.json /tmp/gui-debt.json
```

Review changes before replacing the committed snapshot. The JSON records the checkout revision, UTC date and tool versions. Registry versions and advisory data may change while the checkout stays the same. The measuring command emits JSON only after all measurements succeed.

- **Source.** Run the configured TypeScript compiler first. The exploratory pass also checks unchecked indexing, unused locals and parameters, implicit returns and switch fallthrough. Its error count includes test code. Clippy checks all targets of the desktop crate with the committed lockfile. The top five ranks source files by diagnostic count, breaking ties by path. These counts measure review work. They do not establish user-visible impact.
- **Outdated dependencies.** Compare direct dependencies, including development and build tools. npm reports the installed version, the newest version within the declared range, and the latest tag. Cargo versions come from the desktop package in Cargo.lock and are compared with the newest stable, non-yanked crates.io release. A newer major may require migration.
- **Security.** OSV-Scanner checks both complete lockfiles, including transitives and platform-specific packages. One finding is one alias-group for one resolved package in one lockfile. A CVE affecting two packages can count twice here. The CVE ID count is distinct within each lockfile. Unscored advisories include records without a CVSS rating and require separate triage. Scanner severity alone does not establish reachability in the shipped desktop.

For advisory IDs, aliases and affected versions, inspect the detailed report locally:

```sh
osv-scanner scan source --lockfile package-lock.json --lockfile src-tauri/Cargo.lock --format json > osv-report.json
```

Exit status 1 from this command indicates findings. Follow the repository's disclosure policy when sharing the report.

## C/C++ acceptance fixtures

The repository's C and C++ files belong to the legacy acceptance dataset. DS01–DS06 exercise the analyzers. DS07 is invalid input and DS08 is editor load-test data. Fixture findings stay outside the desktop debt total. The reference Electron app, generated schema, bundled binary and generated documentation also fall outside the active source ranking.

| Tool and configuration | Result on DS01–DS06 at the baseline revision |
| --- | --- |
| clang-tidy 22.1.8, bugprone and Clang static analyzer checks | 1 reported warning in DS02 |
| Cppcheck 2.17.1, warning/style/performance/portability | 3 errors, 2 style findings |
| CoreTrace 0.85.0, stack analyzer | 1 error, 6 warnings, 1 note |
| CoreTrace 0.85.0, concurrency analyzer | 0 diagnostics across six single-file runs |

The stack analyzer flags DS02 in this release. The [historical acceptance manifest](../atp/appendices/datasets/MANIFEST.md) records a different result for its older toolchain. Reproduce with the named tool versions from the repository root in a POSIX shell:

```sh
set -- atp/appendices/datasets/DS0[1-6]_*
clang-tidy --checks='-*,bugprone-*,clang-analyzer-*' "$@" --
cppcheck --enable=warning,style,performance,portability --xml --xml-version=2 "$@" 2> /tmp/gui-fixtures.xml
for source in "$@"; do
  ctrace --input "$source" --invoke=ctrace_stack_analyzer,coretrace-concurrency-analyzer \
    --fail-on none --sarif-format --report-file "/tmp/$(basename "$source").sarif" || exit 1
done
```
