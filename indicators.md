# Debt indicators

Debt has no single measure. We track four proxy indicators, chosen because they can be
computed automatically, each answers a specific question, and together they cover both
kinds of debt and the effect of AI. `indicators.py` computes them for a repository:



|#|Indicator|Question|Calculation|Source|Target|
|-|-|-|-|-|-|
|1|**Measured debt**: findings by severity, debt days, days / 1000 lines|How much debt do we have, and where?|Sum of finding costs (§ below)|`debt-baseline.json` and its git history|Decreasing from one sprint to the next; 0 critical|
|2|**Mean time to remediate a vulnerability (MTTR)**|Do we react fast enough to security debt?|Mean and median of (closed − opened) for closed `security-debt` issues|GitHub issues|Within the policy deadlines (critical 7 d, high 30 d)|
|3|**Share of AI-assisted PRs**|What share of the change flow comes from AI?|Merged PRs labelled `ai-assisted` / merged PRs; commits with `Assisted-by` / commits|PR labels, commit trailers|No target: used to read indicators 1 and 4|
|4|**Debt added vs. debt repaid**|Is repayment keeping pace?|Successive increases and decreases of baseline debt, in days|Git history of `debt-baseline.json`|Repaid / added ratio > 1|

## Cost of a finding

Converting to days lets us add up findings of different kinds and speak the language of
a schedule. The costs are conventions, not measurements: they are for comparing over
time, not for billing.

|Finding|Cost|
|-|-|
|Minor warning (style, readability)|5 min|
|Medium warning (cppcheck `warning`, eslint error)|10 min|
|Likely bug or security warning (clang-analyzer, bugprone, cert)|15 min|
|`TODO` without an issue|15 min|
|Duplicated block|30 min|
|Function too complex (CCN > 15) or too long (> 80 lines)|1 h|
|Low / medium / high / critical vulnerability|30 min / 1 h / 2 h / 4 h|

One day of debt = 7 hours. We normalise to 1000 lines to compare repositories of
different sizes.

## Cross-reading

The indicators are not read in isolation:

* If the share of AI-assisted PRs rises while measured debt stays flat or falls, the
framework (AGENTS.md + gate) works: AI speeds things up without adding debt.
* If measured debt falls while MTTR rises, we are repaying easy technical debt at the
expense of security: revisit the sprint priorities.
* If the repaid / added ratio is infinite (nothing added), check that the baseline is
updated when debt is accepted, rather than bypassed.

## What we measure by hand

Two kinds of debt escape the tools and are assessed once a quarter:

* **Bus factor**: for each repository, the number of people who wrote 80 % of the year's
commits (`git shortlog -sn --since=1.year`). A single name = risk.
* **Architecture**: a review of inter-module dependencies and deviations from the
intended design, recorded in a `tech-debt` issue.

