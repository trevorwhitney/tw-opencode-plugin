---
name: github
description: Interact with GitHub for PRs, issues, releases, actions, and repo management. Always prefer the gh CLI before falling back to GitHub MCP tools.
---

# GitHub

Use this skill when you need to interact with GitHub — pull requests, issues, releases, actions, repository management, or any other GitHub operation.

## Priority

**Always use the `gh` CLI first** before falling back to GitHub MCP tools. The `gh` CLI is faster, supports richer output formats, and keeps operations in the terminal. Only use GitHub MCP tools when:

- `gh` fails or returns an error for the specific operation
- The operation is not supported by `gh` (rare)
- The user explicitly asks you to use a specific MCP tool

## Common Operations

### Pull Requests

```bash
# List open PRs
gh pr list

# View a specific PR
gh pr view <number>

# Create a PR
gh pr create --title "title" --body "body"

# Review a PR
gh pr review <number> --approve
gh pr review <number> --request-changes --body "feedback"

# Check PR status (CI, reviews, merge state)
gh pr checks <number>
gh pr status

# Merge a PR
gh pr merge <number> --squash
```

### Issues

```bash
# List issues
gh issue list
gh issue list --label "bug" --state open

# View an issue
gh issue view <number>

# Create an issue
gh issue create --title "title" --body "body" --label "bug"

# Close an issue
gh issue close <number>
```

### Releases

```bash
# List releases
gh release list

# View a release
gh release view <tag>

# Create a release
gh release create <tag> --title "title" --notes "notes"
```

### Actions / Workflows

```bash
# List workflow runs
gh run list

# View a specific run
gh run view <run-id>

# View run logs
gh run view <run-id> --log
gh run view <run-id> --log-failed

# Re-run a failed workflow
gh run rerun <run-id>

# Watch a run in progress
gh run watch <run-id>
```

### Repository

```bash
# View repo info
gh repo view

# Clone a repo
gh repo clone <owner/repo>

# Fork a repo
gh repo fork <owner/repo>
```

### General API Access

For anything not covered by a dedicated subcommand, use `gh api`:

```bash
# GET request
gh api repos/{owner}/{repo}/commits

# POST request
gh api repos/{owner}/{repo}/issues -f title="title" -f body="body"

# GraphQL
gh api graphql -f query='{ viewer { login } }'

# With jq filtering
gh api repos/{owner}/{repo}/pulls --jq '.[].title'
```

## Output Formatting

Use `--json` with `--jq` for structured, parseable output:

```bash
# Get PR titles and URLs as JSON
gh pr list --json title,url

# Filter with jq
gh pr list --json title,state --jq '.[] | select(.state == "OPEN") | .title'
```

## Common Mistakes to Avoid

- **Using GitHub MCP first** — always try `gh` before reaching for MCP tools
- **Missing `--json`** — use `--json` with `--jq` when you need structured output for further processing
- **Forgetting `gh api`** — if a dedicated subcommand doesn't exist, `gh api` can hit any GitHub REST or GraphQL endpoint
