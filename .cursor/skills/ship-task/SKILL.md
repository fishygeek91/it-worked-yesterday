---
name: ship-task
description: >-
  Ships one TASKS.md task on a new branch, pull request, and merge back to main.
  Use when starting, finishing, or planning a ⬜/⏳ task, or when the user says
  ship, PR, branch, or next task.
---

# Ship one TASKS.md task

Standing workflow for this repo: **branch → implement → PR → merge → main**. Do not commit task work to `main`.

Read [AGENTS.md](../../../AGENTS.md), [docs/design.md](../../../docs/design.md), then the current ⬜ or ⏳ task in [TASKS.md](../../../TASKS.md).

## Start

```bash
git checkout main
git pull
git checkout -b task/<id>-<slug>
```

Examples: `task/9-win-card`, `task/10-tutorial`. Slug is the task title, lowercase, hyphens.

If work already landed on `main` uncommitted, move it onto the new branch before committing (`git checkout -b`, then commit there).

## Implement

- One `TASKS.md` task only. Finish its acceptance criteria. Stop.
- Quality gates must stay green: `npm test`, `npm run typecheck`, `npm run lint`.
- Mark the task ✅ in `TASKS.md` when AC pass.
- Do not weaken tests. Do not enable Pages.

## Commit

Follow the repo commit protocol (no `--no-verify`, no amend unless the commit rules allow it). Message: why this task, not a file list.

```bash
git add …
git commit -m "$(cat <<'EOF'
Short why for TASK N.

EOF
)"
```

## PR

```bash
git push -u origin HEAD
gh pr create --title "TASK N — Title from TASKS.md" --body "$(cat <<'EOF'
## Summary
- What the task delivered

## Test plan
- [x] npm test
- [x] npm run typecheck
- [x] npm run lint

EOF
)"
```

Return the PR URL.

## Merge

Opening the task PR **is** merge permission for this workflow. Confirm CI is green (`gh pr checks`), then:

```bash
gh pr merge --merge --delete-branch
git checkout main
git pull
git fetch --prune
```

Delete the local feature branch if it remains. Stop. Print the next ⬜ task id and title. Do not start it on this branch.

## Do not

- Commit or merge leftover work onto `main` directly
- Stack a second task on the same branch
- `gh repo create` or enable GitHub Pages unless the human asked
- Merge some other PR under this skill (use the close-pr skill; that still needs an explicit ask)
