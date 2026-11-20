"""Print the desktop debt snapshot as JSON. See docs/debt.md for prerequisites."""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tomllib
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
LOCKFILES = ("package-lock.json", "src-tauri/Cargo.lock")


def run(args, allowed=(0,)):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    if result.returncode not in allowed:
        raise RuntimeError(f"{args[0]} exited {result.returncode}\n{result.stderr}\n{result.stdout[-2000:]}")
    return result


def source_findings():
    tsc = ["node", "node_modules/typescript/bin/tsc"]
    # Confirm the repository configuration passes before attributing diagnostics
    # to the additional checks. Keep tests in scope, just as the project does.
    run(tsc + ["--noEmit"])
    strict = run(tsc + ["--noEmit", "--pretty", "false", "--noUncheckedIndexedAccess",
                        "--noUnusedLocals", "--noUnusedParameters", "--noImplicitReturns",
                        "--noFallthroughCasesInSwitch"], allowed=(0, 2))
    files, rules = Counter(), Counter()
    for line in strict.stdout.splitlines():
        if line.startswith(" ") or not line:
            continue
        match = re.fullmatch(r"(.+)\(\d+,\d+\): error (TS\d+): .*", line)
        if not match:
            raise ValueError(f"Unexpected TypeScript diagnostic: {line}")
        files[Path(match[1]).as_posix()] += 1
        rules[match[2]] += 1
    if strict.returncode and not files:
        raise ValueError("The stricter TypeScript pass failed without file diagnostics")

    native = run(["cargo", "clippy", "--manifest-path", "src-tauri/Cargo.toml", "--locked",
                  "--all-targets", "--message-format=json", "--", "-W", "warnings"])
    native_counts = Counter()
    for line in native.stdout.splitlines():
        message = json.loads(line)
        if message["reason"] != "compiler-message":
            continue
        diagnostic = message["message"]
        if diagnostic["level"] not in {"error", "warning"}:
            continue
        spans = [s for s in diagnostic["spans"] if s["is_primary"]]
        manifest = Path(message["manifest_path"])
        if manifest != ROOT / "src-tauri/Cargo.toml":
            continue
        native_counts[diagnostic["level"]] += 1
        if spans:
            source = (manifest.parent / spans[0]["file_name"]).resolve()
            files[source.relative_to(ROOT).as_posix()] += 1

    top = sorted(files.items(), key=lambda pair: (-pair[1], pair[0]))[:5]
    return {
        "typescript": {"current_config_errors": 0, "additional_errors": sum(rules.values()),
                       "by_code": dict(sorted(rules.items()))},
        "clippy": {level: native_counts[level] for level in ("error", "warning")},
        "top_files": [{"path": path, "findings": count} for path, count in top],
    }


def latest_crate(name):
    # Cargo's sparse registry stores one JSON record per published version.
    if len(name) <= 2:
        prefix = str(len(name))
    elif len(name) == 3:
        prefix = f"3/{name[0]}"
    else:
        prefix = f"{name[:2]}/{name[2:4]}"
    with urlopen(f"https://index.crates.io/{prefix}/{name}", timeout=45) as response:
        releases = [json.loads(line) for line in response]
    stable = [r["vers"] for r in releases if not r["yanked"] and "-" not in r["vers"].split("+")[0]]
    return max(stable, key=version_key, default=None)


def version_key(version):
    # Compare against a stable candidate. An installed prerelease of that
    # same version is older, and build metadata does not affect precedence.
    core, separator, _ = version.split("+")[0].partition("-")
    return (*map(int, core.split(".")), not bool(separator))


def direct_dependencies():
    npm = shutil.which("npm")
    if not npm:
        raise RuntimeError("npm is required")
    result = run([npm, "outdated", "--json", "--depth=0"], allowed=(0, 1))
    outdated = json.loads(result.stdout)
    if "error" in outdated or any(not record.get("current") for record in outdated.values()):
        raise ValueError(f"Incomplete npm dependency information. Run npm ci and retry: {result.stderr}")
    js = {name: {k: record[k] for k in ("current", "wanted", "latest")}
          for name, record in sorted(outdated.items())}

    native = ROOT / "src-tauri"
    manifest = tomllib.loads((native / "Cargo.toml").read_text())
    lock = tomllib.loads((native / "Cargo.lock").read_text())["package"]
    package = next(p for p in lock if p["name"] == manifest["package"]["name"] and "source" not in p)
    locked = {}
    for spec in package["dependencies"]:
        name, *suffix = spec.split()
        locked[name] = suffix[0] if suffix else next(p["version"] for p in lock if p["name"] == name)
    names = sorted(locked)
    with ThreadPoolExecutor(max_workers=4) as pool:
        latest = dict(zip(names, pool.map(latest_crate, names)))
    crates = {n: {"current": locked[n], "latest": latest[n]} for n in names
              if latest[n] and version_key(locked[n]) < version_key(latest[n])}
    return {"npm": js, "cargo": crates}


def severity(score):
    if score in (None, ""):
        return "unscored"
    value = float(score)
    for threshold, label in [(9, "critical"), (7, "high"), (4, "medium"), (0.1, "low")]:
        if value >= threshold:
            return label
    return "none"


def vulnerabilities():
    result = run(["osv-scanner", "scan", "source", "--all-packages", "--format", "json",
                  "--lockfile", LOCKFILES[0], "--lockfile", LOCKFILES[1]], allowed=(0, 1))
    summary = {}
    for entry in json.loads(result.stdout)["results"]:
        path = (ROOT / entry["source"]["path"]).resolve().relative_to(ROOT).as_posix()
        counts, cves = Counter(), set()
        packages = entry["packages"]
        for package in packages:
            for group in package.get("groups") or []:
                counts[severity(group.get("max_severity"))] += 1
                cves.update(i for i in group["ids"] + (group.get("aliases") or []) if i.startswith("CVE-"))
        summary[path] = {
            "packages_scanned": len(packages),
            "affected_packages": sum(bool(p.get("groups")) for p in packages),
            "package_advisory_groups": sum(counts.values()),
            "by_severity": {s: counts[s] for s in ("critical", "high", "medium", "low", "none", "unscored")},
            "distinct_cve_ids": len(cves),
        }
    if set(summary) != set(LOCKFILES) or not all(row["packages_scanned"] for row in summary.values()):
        raise ValueError("OSV-Scanner did not report packages from both lockfiles")
    return summary


if __name__ == "__main__":
    # Emit only a complete measurement. The caller chooses when to replace the baseline.
    snapshot = {
        "measured_utc": datetime.now(timezone.utc).date().isoformat(),
        "source_commit": run(["git", "rev-parse", "HEAD"]).stdout.strip(),
        "tools": {name: run(args).stdout.splitlines()[0] for name, args in {
            "typescript": ["node", "node_modules/typescript/bin/tsc", "--version"],
            "clippy": ["cargo", "clippy", "--version"],
            "npm": [shutil.which("npm") or "npm", "--version"],
            "osv_scanner": ["osv-scanner", "--version"],
        }.items()},
        "source": source_findings(),
        "outdated_direct_dependencies": direct_dependencies(),
        "osv": vulnerabilities(),
    }
    json.dump(snapshot, sys.stdout, indent=2)
    print()
