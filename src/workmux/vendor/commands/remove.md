---
description: Remove the current worktree, tmux window, and branch without merging.
---

Remove the current worktree using `workmux rm`.

**Arguments:** `$ARGUMENTS`

Check the arguments for flags:

- `--force`, `-f` → pass `--force` to `workmux rm` (skip confirmation, ignore uncommitted changes)
- `--keep-branch`, `-k` → pass `--keep-branch` to `workmux rm` (keep the local branch)
- `--gone` → pass `--gone` to `workmux rm` (remove worktrees whose upstream branch was deleted)
- `--all` → pass `--all` to `workmux rm` (remove all worktrees except main)

Strip all flags from arguments.

## Pre-flight checks

Before removing, check for uncommitted work:

```bash
git status --porcelain
```

If there are uncommitted changes and `--force` was NOT passed:

1. Warn the user about uncommitted changes
2. Ask whether to proceed, commit first, or abort
3. Do NOT continue until the user confirms

## Remove the worktree

Run `workmux rm` with no name argument (defaults to current worktree) and any
flags from above:

```bash
workmux rm [--force] [--keep-branch]
```

If `--gone` or `--all` was passed, use those instead:

```bash
workmux rm --gone [--force]
workmux rm --all [--force]
```

The command will remove the worktree directory, close the tmux window, and
delete the local branch (unless `--keep-branch` is used).
