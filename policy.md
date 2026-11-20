# Technical and security debt management policy

**Scope:** the 16 repositories of the CoreTrace organisation. Demonstrated on coretrace,
coretrace-gui and coretrace-vscode, then extended to the others through the
`tool-template` repository and the reusable workflow in `CoreTrace/.github`.

**Principle:** AI speeds up writing code; debt must not speed up with it. We do not
promise zero debt: we **measure** it, **block** what increases it, **repay** it at a set
pace and **track** the trend.

## 1. Definitions

|Term|Definition|
|-|-|
|Technical debt|Whatever makes code more expensive to change: warnings, complexity, duplication, missing tests, outdated dependencies, `TODO`s.|
|Security debt|Whatever exposes users: known vulnerabilities (CVEs) in dependencies, dangerous functions, secrets, unvalidated input. Always takes priority.|
|Baseline|`debt-baseline.json` at the root of each repository: the list of findings accepted at a given date, and their estimated cost in days.|
|New debt|Any finding not in the baseline.|
|AI-assisted code|Code written or substantially modified by an AI tool (agent, multi-line completion, test generation).|

## 2. Debt register

* Any known debt not fixed right away is a **GitHub issue** in the relevant repository,
created with the "Debt" form (`.github/ISSUE_TEMPLATE/debt.yml`).
* Labels: `tech-debt` or `security-debt`, plus a severity `severity:critical`,
`severity:high`, `severity:medium` or `severity:low`.
* Each issue gives: the location, the impact, an effort estimate and, if one exists, the
finding's identifier in the baseline.
* A `TODO` in the code carries its issue number: `TODO(#123): ...`. A `TODO` without an
issue counts as new debt for the gate.

## 3. AI-assisted code

1. **Disclosure:** a PR whose code is AI-assisted carries the `ai-assisted` label, and the
relevant commits carry the `Assisted-by: <tool and model>` trailer.
2. **Accountability:** the human author of the PR is answerable for all the code it
contains, as if they had written it. "The AI wrote it" is not an answer in review.
3. **Framework:** each repository has an `AGENTS.md` (and a `CLAUDE.md` that imports it)
that agents read before acting: commands, prohibitions, definition of "done".
4. **Limits on action:** an agent works on a branch and opens a PR. It never pushes to
`main`, does not merge, and does not modify CI, `AGENTS.md` or the baseline without an
explicit request.

## 4. Review and merge

No PR is merged without:

1. a **green quality gate**: the "Debt baseline", "Security scan" and "Tests for new code"
jobs;
2. **one human approval**, from someone other than the author;
3. approval from a **code owner** if the PR touches `AGENTS.md`, `CLAUDE.md`, CI,
`debt-baseline.json`, the pre-commit configuration or the licence files.

Setting to apply on `main` in each repository (Settings → Branches, or an organisation
ruleset):

* Require a pull request before merging, 1 approval, *Require review from Code Owners*,
*Dismiss stale approvals when new commits are pushed*.
* Require status checks to pass: `gate / Debt baseline`, `gate / Security scan`,
`gate / Tests for new code`, plus the existing build checks.
* Do not allow bypassing the above settings, including for administrators.

Without this setting, a red CI does not prevent merging: the gate would only be advice.

## 5. Repayment

* **15 to 20 % of each sprint** is reserved for `tech-debt` and `security-debt` issues,
planned on the same footing as features.
* **Priority order:** critical security debt, then high, then technical debt in the most
frequently modified files (code we touch often costs the most).
* **Security debt remediation deadlines**, from discovery:

|Severity|Deadline|
|-|-|
|Critical (CVSS ≥ 9)|7 days; out-of-cycle fix released if needed|
|High (CVSS 7 to 8.9)|30 days|
|Medium|90 days|
|Low|At the next change to the affected file|

  These deadlines complement those in `SECURITY.md` for externally reported
vulnerabilities.

* **Ratchet rule:** when a PR repays debt, the baseline is updated in the same PR. Repaid
debt can no longer come back unnoticed.

## 6. Accepting new debt

Sometimes adding debt is the right call (urgent fix, prototype). In that case, the PR:

1. updates `debt-baseline.json` (the gate then shows the difference);
2. opens the corresponding `tech-debt` or `security-debt` issue, with a due date;
3. gets approval from a code owner, which `CODEOWNERS` requires on the baseline.

A critical vulnerability is not accepted: it is fixed.

## 7. Tracking

* Every sprint: `indicators.py` is run on each demonstrated repository; the output is
presented at the sprint review.
* Every quarter: review of this policy, the thresholds (complexity, length, costs in
minutes) and the list of banned functions, based on the indicators.
* Before each release: scans are rerun, because a CVE published since the last run can
make unchanged code vulnerable.

## 8. Roles

|Role|Responsibilities|
|-|-|
|Author|Discloses AI use, runs the `AGENTS.md` commands, describes the debt introduced.|
|Reviewer|Reviews the code as human code; checks tests, security, licences.|
|Code owners (`@CoreTrace/maintainers`)|Approve changes to rules, CI and baseline; maintain the register.|
|Security lead|Triages `security-debt` issues, tracks the § 5 deadlines.|



