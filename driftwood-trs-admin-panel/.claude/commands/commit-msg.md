Analyze the staged git changes and produce a single, ready-to-use commit message. Do NOT commit anything.

## Steps

1. Run `git diff --staged` to get all staged changes.
2. Run `git diff --staged --stat` for a file-level summary.
3. Run `git log --oneline -10` to learn the project's existing commit style (if any).

## Rules for the commit message

Follow the **Conventional Commits 1.0** spec combined with the seven rules of a great commit message:

### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Types (choose exactly one)

- `feat` — new feature for the user
- `fix` — bug fix for the user
- `docs` — documentation only
- `style` — formatting, missing semicolons, etc. (no logic change)
- `refactor` — code restructuring with no feature or fix
- `perf` — performance improvement
- `test` — adding or correcting tests
- `chore` — build process, dependency, tooling changes
- `ci` — CI/CD configuration changes
- `revert` — reverts a prior commit

### Subject line rules

- Use the **imperative mood** ("add", "fix", "remove" — not "added" or "fixes")
- Max **72 characters** for the entire first line (type + scope + subject)
- **No period** at the end
- Lowercase after the colon

### Body (include when the diff is non-trivial)

- Separate from subject with a **blank line**
- Wrap at **72 characters per line**
- Explain **what** changed and **why**, not how
- Use bullet points (`-`) for multiple distinct changes

### Footer (include when relevant)

- Breaking changes: `BREAKING CHANGE: <description>`
- Issue references: `Closes #123` or `Refs #456`

### Scope

- Derive from the primary module/package/directory changed (e.g., `auth`, `users`, `db`, `api`)
- Omit scope only if the change spans the entire codebase with no clear owner

## Output

Print **only** the final commit message — no explanation, no preamble, no markdown fences. The output should be copy-paste ready for `git commit -m "..."` or a `HEREDOC`.

If there are no staged changes, print exactly: `No staged changes found.`
