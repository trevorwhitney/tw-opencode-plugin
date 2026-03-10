# Dual-Plugin Refactor: OpenCode + Claude Code

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Make this plugin serve both OpenCode and Claude Code from the same repo, sharing skills, commands, and agents.

**Architecture:** The repo root is the shared plugin root. `skills/`, `commands/`, and `agents/` stay at root level and are discovered by both platforms. OpenCode-specific JS code stays in `src/`. Claude Code discovers content via `.claude-plugin/plugin.json`. A `CLAUDE.md` at root provides the tool-priority rules that OpenCode injects via system prompt. `deploy.sh` is extended to register the plugin with Claude Code's `installed_plugins.json`.

**Tech Stack:** TypeScript (OpenCode plugin), Markdown (shared content), Bash (deploy), JSON (Claude Code manifest/registry)

---

### Task 1: Update `.claude-plugin/plugin.json` manifest

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Reuse:** None — the file already exists but is minimal.

**Step 1: Update the manifest**

Replace the current minimal manifest with the full version that includes metadata and explicitly declares component paths (even though they match defaults — being explicit helps readability and documents intent):

```json
{
  "name": "tw",
  "version": "0.1.0",
  "description": "Personal skills, commands, agents, and tools for OpenCode and Claude Code",
  "author": {
    "name": "Trevor Whitney"
  },
  "repository": "https://github.com/trevorwhitney/tw-opencode-plugin",
  "skills": "./skills/",
  "commands": "./commands/",
  "agents": "./agents/"
}
```

**Step 2: Verify Claude Code discovers the plugin**

Run: `claude --plugin-dir . --debug 2>&1 | head -30`

Look for lines showing the plugin loading and discovering skills/commands/agents. Then test:
```
/tw:code-review
```
Verify it appears as a valid command.

**Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "feat: flesh out claude code plugin manifest with component paths"
```

---

### Task 2: Create `CLAUDE.md` with tool-priority rules

The OpenCode plugin injects tool-priority rules into every system prompt via `experimental.chat.system.transform`. Claude Code has no equivalent hook, but it automatically reads `CLAUDE.md` files and injects them into the system prompt. This is the right place for these rules.

**Files:**
- Create: `CLAUDE.md`

**Reuse:**
- `src/index.ts:18-54` — the `TOOL_PRIORITY_RULES` constant contains the exact text to port

**Step 1: Create `CLAUDE.md`**

```markdown
# Tool Priority Rules

These rules override default tool selection. Follow them unconditionally.

## GitHub: prefer `gh` CLI over GitHub MCP tools

When performing ANY GitHub operation (PRs, issues, releases, actions, repo management):

1. **Always use the `gh` CLI via the Bash tool first.**
2. Only fall back to GitHub MCP tools (`github_*`) when:
   - `gh` fails or returns an error for the specific operation
   - The operation is genuinely not supported by `gh` (rare)
   - The user explicitly asks you to use a specific MCP tool

Common operations — use these instead of MCP tools:
- `gh pr view <number>` instead of `github_get_pull_request`
- `gh pr list` instead of `github_list_pull_requests`
- `gh pr diff <number>` instead of `github_get_pull_request_files`
- `gh pr checks <number>` instead of `github_get_pull_request_status`
- `gh pr create` instead of `github_create_pull_request`
- `gh pr review <number>` instead of `github_create_pull_request_review`
- `gh issue view <number>` instead of `github_get_issue`
- `gh issue list` instead of `github_list_issues`
- `gh issue create` instead of `github_create_issue`
- `gh api <endpoint>` for any REST/GraphQL call not covered above

## Grafana: prefer `grafana-assistant` CLI over Grafana MCP tools

When querying Grafana for metrics, logs, traces, alerts, or dashboards:

1. **Always try `grafana-assistant` CLI via the Bash tool first.**
2. Only fall back to Grafana MCP tools (`mcp-grafana_*`) when:
   - `grafana-assistant` fails or returns an error
   - You need an MCP-only operation (creating/updating dashboards, alert rules, or incidents)
   - The user explicitly asks you to use a specific MCP tool
```

**Step 2: Verify Claude Code reads it**

Run: `claude --plugin-dir . --print-system-prompt 2>&1 | grep -i "tool priority"` (or inspect manually)

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "feat: add CLAUDE.md with tool-priority rules for Claude Code"
```

---

### Task 3: Extend `deploy.sh` to register with Claude Code

**Files:**
- Modify: `scripts/deploy.sh`

**Reuse:**
- The existing `installed_plugins.json` format at `~/.claude/plugins/installed_plugins.json`
- The existing structure of `deploy.sh` (helper functions, section pattern)

**Step 1: Add a Claude Code deployment section to `deploy.sh`**

Add after the "Cleanup" section, before the final "Done" message. The logic:
1. Ensure `~/.claude/plugins/` exists
2. Read `installed_plugins.json` (or create it with `{"version": 2, "plugins": {}}`)
3. Use a small inline script (jq or node/bun) to upsert the `"tw"` entry pointing to `$PLUGIN_DIR`
4. Write back the file

Using `jq` (already common on macOS/Linux):

```bash
# ── Claude Code Plugin ────────────────────────────────────────
CLAUDE_PLUGINS_DIR="${HOME}/.claude/plugins"
CLAUDE_PLUGINS_JSON="${CLAUDE_PLUGINS_DIR}/installed_plugins.json"

echo ""
echo "Claude Code:"
mkdir -p "$CLAUDE_PLUGINS_DIR"

if [ ! -f "$CLAUDE_PLUGINS_JSON" ]; then
    echo '{"version": 2, "plugins": {}}' > "$CLAUDE_PLUGINS_JSON"
    echo "  [create] installed_plugins.json"
fi

if command -v jq &>/dev/null; then
    TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
    PLUGIN_VERSION="$(jq -r '.version // "0.1.0"' "${PLUGIN_DIR}/.claude-plugin/plugin.json")"

    jq --arg path "$PLUGIN_DIR" \
       --arg version "$PLUGIN_VERSION" \
       --arg ts "$TIMESTAMP" \
       '.plugins.tw = [{
         "scope": "user",
         "installPath": $path,
         "version": $version,
         "installedAt": $ts,
         "lastUpdated": $ts
       }]' "$CLAUDE_PLUGINS_JSON" > "${CLAUDE_PLUGINS_JSON}.tmp" \
    && mv "${CLAUDE_PLUGINS_JSON}.tmp" "$CLAUDE_PLUGINS_JSON"
    echo "  [register] tw plugin (${PLUGIN_DIR})"
else
    echo "  [skip] jq not found, cannot register Claude Code plugin"
fi
```

**Step 2: Also ensure the plugin is enabled in `~/.claude/settings.json`**

Claude Code requires `enabledPlugins` in settings. Add a second jq block:

```bash
CLAUDE_SETTINGS="${HOME}/.claude/settings.json"
if [ -f "$CLAUDE_SETTINGS" ] && command -v jq &>/dev/null; then
    if ! jq -e '.enabledPlugins.tw // false' "$CLAUDE_SETTINGS" >/dev/null 2>&1; then
        jq '.enabledPlugins.tw = true' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp" \
        && mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"
        echo "  [enable] tw in settings.json"
    else
        echo "  [skip] tw already enabled in settings.json"
    fi
fi
```

**Step 3: Test the deploy**

Run: `bash scripts/deploy.sh`

Verify:
- `~/.claude/plugins/installed_plugins.json` has a `"tw"` entry
- `~/.claude/settings.json` has `"enabledPlugins": { "tw": true, ... }`

**Step 4: Commit**

```bash
git add scripts/deploy.sh
git commit -m "feat: extend deploy.sh to register plugin with Claude Code"
```

---

### Task 4: Update README to document both platforms

**Files:**
- Modify: `README.md`

**Reuse:** Existing README structure

**Step 1: Update the README**

Key changes:
- Update the title/description to mention both OpenCode and Claude Code
- Update the structure diagram to show the dual-purpose layout
- Add a "Claude Code" section under Installation explaining `--plugin-dir` for dev and `deploy.sh` for persistent install
- Document what Claude Code gets (skills, commands, agents, CLAUDE.md) vs what's OpenCode-only (JS plugin with custom tools, beads, workmux integration)
- Keep the existing OpenCode installation instructions

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README to document dual OpenCode + Claude Code plugin"
```

---

### Task 5: Verify end-to-end with Claude Code

This is a manual verification task, not automated.

**Step 1: Test with `--plugin-dir`**

```bash
claude --plugin-dir /Users/twhitney/workspace/tw-opencode-plugin
```

Verify:
- `/tw:code-review` is recognized
- `/tw:plan-review` is recognized
- Skills appear (check `/help` or `/skills`)
- Agents appear in `/agents`

**Step 2: Test with persistent install**

```bash
bash scripts/deploy.sh
claude
```

Verify same as above without `--plugin-dir`.

**Step 3: Verify OpenCode still works**

Restart OpenCode and confirm:
- Skills load correctly
- `/code-review` and `/plan-review` work
- Beads context injection works
- Workmux status integration works
- Review pipeline tool works

**Step 4: Commit any fixes**

If any issues were found and fixed, commit them.

---

## What's NOT in scope (OpenCode-only features)

These features have no Claude Code equivalent and remain OpenCode-only:

| Feature | Why no CC equivalent |
|---|---|
| `review-pipeline` custom tool | CC plugins can't define custom tools (tools come from MCP only) |
| Beads context injection (`chat.message`) | CC has no chat message hook |
| System prompt transform | Partially covered by `CLAUDE.md`, but not identical |
| Workmux status events | Already handled by your existing CC hooks in `~/.claude/settings.json` |
| Dynamic config registration (beads/workmux commands) | CC discovers commands from files, no dynamic registration |
