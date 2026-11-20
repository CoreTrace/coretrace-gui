#!/usr/bin/env python3
"""Debt indicators for a CoreTrace repository, in Markdown.

Sources:
- the git history of debt-baseline.json: trend, debt added and repaid;
- the Assisted-by trailers of commits: share of AI-assisted code;
- GitHub via `gh` (if installed and logged in): PRs labelled ai-assisted,
  remediation time of security-debt issues, size of the register.
Standard library only.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import subprocess
import sys

BASELINE = "debt-baseline.json"


def run(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout


def gh_json(*args):
    if not shutil.which("gh"):
        return None
    try:
        return json.loads(run("gh", *args))
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None


def parse_date(text):
    return dt.datetime.fromisoformat(text.replace("Z", "+00:00"))


def baseline_history(since):
    """Each committed version of debt-baseline.json, oldest to newest."""
    log = run("git", "log", "--reverse", f"--since={since}", "--format=%H %as", "--", BASELINE)
    history = []
    for line in log.splitlines():
        sha, date = line.split()
        try:
            summary = json.loads(run("git", "show", f"{sha}:{BASELINE}"))["summary"]
        except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError):
            continue  # file deleted or unreadable in this commit
        history.append((date, sha[:7], summary))
    return history


def section_trend(since):
    history = baseline_history(since)
    out = ["## Measured debt (debt-baseline.json)\n"]
    if not history:
        return out + [f"No version of `{BASELINE}` since {since}.\n"]
    out += ["| Date | Commit | Findings | Critical | High | Debt (days) | Days / 1000 lines |",
            "|---|---|---|---|---|---|---|"]
    added = repaid = 0
    previous = None
    for date, sha, s in history:
        sev = s.get("by_severity", {})
        out.append(f"| {date} | {sha} | {s['findings']} | {sev.get('critical', 0)} | "
                   f"{sev.get('high', 0)} | {s['days']} | {s.get('days_per_kloc')} |")
        if previous is not None:
            delta = s["minutes"] - previous
            added += max(delta, 0)
            repaid += max(-delta, 0)
        previous = s["minutes"]
    day = 7 * 60
    first, last = history[0][2], history[-1][2]
    out.append(f"\n- Trend: {first['days']} → {last['days']} days "
               f"({first['findings']} → {last['findings']} findings).")
    out.append(f"- Debt accepted (baseline raised): {added / day:.1f} days; "
               f"debt repaid: {repaid / day:.1f} days.")
    ratio = f"{repaid / added:.1f}" if added else "∞ (no debt accepted)"
    out.append(f"- Repaid / added ratio: {ratio}. Target: greater than 1.\n")
    return out


def section_ai(since):
    out = ["## Share of AI-assisted code\n"]
    commits = run("git", "log", f"--since={since}", "--no-merges",
                  "--format=%(trailers:key=Assisted-by,valueonly,separator=%x2C)%x1e")
    entries = [c.strip() for c in commits.split("\x1e")[:-1]]  # one per commit
    total = len(entries)
    assisted = sum(1 for c in entries if c)
    if total:
        out.append(f"- Commits with an `Assisted-by` trailer: {assisted} / {total} "
                   f"({100 * assisted / total:.0f} %).")
    prs = gh_json("pr", "list", "--state", "merged", "--limit", "500",
                  "--search", f"merged:>={since}", "--json", "number,labels")
    if prs is not None:
        ai = sum(1 for p in prs if any(l["name"] == "ai-assisted" for l in p["labels"]))
        share = f"{100 * ai / len(prs):.0f} %" if prs else "n/a"
        out.append(f"- Merged PRs labelled `ai-assisted`: {ai} / {len(prs)} ({share}).")
    else:
        out.append("- PRs: `gh` missing or not logged in, indicator not computed.")
    out.append("- Self-reported measure: it counts the code authors declare, "
               "not all code produced by an AI.\n")
    return out


def section_register(since):
    out = ["## Debt register (GitHub issues)\n"]
    fields = "number,createdAt,closedAt,labels,state"
    issues = gh_json("issue", "list", "--state", "all", "--limit", "1000",
                     "--label", "security-debt", "--json", fields)
    tech = gh_json("issue", "list", "--state", "open", "--limit", "1000",
                   "--label", "tech-debt", "--json", "number")
    if issues is None or tech is None:
        return out + ["`gh` missing or not logged in: register not read.\n"]
    since_date = dt.datetime.fromisoformat(since).replace(tzinfo=dt.timezone.utc)
    closed = [i for i in issues if i["closedAt"] and parse_date(i["closedAt"]) >= since_date]
    open_sec = [i for i in issues if i["state"] == "OPEN"]
    out.append(f"- Open issues: {len(tech)} `tech-debt`, {len(open_sec)} `security-debt`.")
    if closed:
        days = [(parse_date(i["closedAt"]) - parse_date(i["createdAt"])).total_seconds() / 86400
                for i in closed]
        out.append(f"- Mean time to remediate a vulnerability (MTTR): "
                   f"{sum(days) / len(days):.1f} days over {len(closed)} closed issues "
                   f"(median {sorted(days)[len(days) // 2]:.1f}).")
    else:
        out.append("- MTTR: no `security-debt` issue closed in the period.")
    return out + [""]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    default = (dt.date.today() - dt.timedelta(days=90)).isoformat()
    parser.add_argument("--since", default=default, help="ISO date, defaults to 90 days ago")
    args = parser.parse_args()
    try:
        repo = run("git", "rev-parse", "--show-toplevel").strip().rsplit("/", 1)[-1]
    except subprocess.CalledProcessError:
        sys.exit("Must be run inside a git repository.")
    lines = [f"# Debt indicators: {repo}, since {args.since}\n"]
    lines += section_trend(args.since)
    lines += section_ai(args.since)
    lines += section_register(args.since)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
