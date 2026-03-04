---
name: git-worktree
description: Manage git worktrees for parallel AI agent tasks with isolated working directories.
---

# Git Worktree Management

Use this skill when you need to work on multiple branches simultaneously using git worktrees, particularly useful for parallel AI agent tasks.

## When to Use

- Working on multiple features/fixes in parallel
- Need isolated working directories for different branches
- Want to avoid stash/switch context overhead

## Key Commands

```bash
git worktree add <path> <branch>
git worktree list
git worktree remove <path>
git worktree prune
```

## Workflow

1. **Create worktree** — `git worktree add ../my-feature feature-branch`
2. **Work in isolation** — Each worktree has its own working directory
3. **Clean up** — `git worktree remove ../my-feature` when done

## Best Practices

- Use a consistent naming convention for worktree paths (e.g., `../<repo>-<branch>`)
- Clean up worktrees when branches are merged
- Run `git worktree prune` periodically to clean stale entries
- Remember: worktrees share the same `.git` objects — they're lightweight
