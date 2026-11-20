<!--
Common rules for every CoreTrace AGENTS.md (P4). Each repository copies this block
unchanged and adds its own "Project", "Commands", "Conventions" and "Do not modify"
sections around it. Change these rules here first, then in every copy.
-->

## Security

- Never commit secrets: tokens, passwords, private keys, `.env` files. Read them from the
  environment.
- No absolute paths to a developer's machine, in code or in tests.
- Validate every external input (files, command-line arguments, network responses, user
  input) before using it: type, size, and that a path stays inside the directory it is meant
  for.
- C and C++: `strcpy`, `strcat`, `sprintf`, `vsprintf`, `gets`, `alloca`, variable-length
  arrays and recursion without a depth bound are forbidden. Keep stack arrays under 4 KiB.
- TypeScript and JavaScript: no `eval`, `new Function`, `innerHTML` or
  `dangerouslySetInnerHTML`.
- Rust: no new `unsafe` block without a `// SAFETY:` comment that explains why it is sound.
- Do not disable a security check, a linter rule or a test to make the build pass.

## Dependencies and licences

- Do not add a dependency unless the task needs it. Name every new dependency, its version
  and its licence in the pull request.
- Allowed licences: MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, Zlib.
  Forbidden: GPL, LGPL, AGPL, SSPL, BUSL and any licence without a name. Ask when unsure.
- Code copied from elsewhere: give its source URL and licence in a comment and in the pull
  request.
- Pin versions with the lockfile; never edit a lockfile by hand.

## Definition of done

A change is done only when all of these hold. Run the commands yourself; do not assume.

1. The build passes and every test passes.
2. New or changed behaviour has a test.
3. The linters and analyzers listed under "Commands" report no new finding. The CI gate
   compares with `debt-baseline.json`: do not edit that file to make the gate pass.
4. No `TODO`, `FIXME` or `HACK` without an issue number: write `TODO(#123): ...`.
5. Public functions and non-obvious decisions are documented.

## Pull requests

- Branch from `main`; never push to `main`.
- Commit subjects are English Conventional Commits with a scope:
  `fix(parser): reject empty input`.
- When an AI tool wrote or substantially changed the code, add the `ai-assisted` label to
  the pull request and this trailer to each such commit:
  `Assisted-by: <tool and model>`.
- The description says: what changed and why, the issue it closes, the commands run and
  their result, and the debt introduced (or "none"). Fill in the pull request template.
- A human reviews and approves every pull request. Keep it small enough to review: one
  subject, ideally under 400 changed lines.

## Debt

- If you notice debt you are not fixing, open an issue labelled `tech-debt` or
  `security-debt` instead of fixing it outside the task.
- A known vulnerability comes before any refactoring.
