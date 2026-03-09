# Beads Integration Design

**Date:** 2026-03-09
**Status:** Approved

## Summary

Port the [opencode-beads](https://github.com/joshuadavidthomas/opencode-beads) plugin (v0.5.5) into `src/beads/` within tw-opencode-plugin. This adds beads issue tracking to the plugin with stealth-by-default behavior, auto-initialization, and system prompt awareness.

## Decisions

- **Approach:** Direct port (upstream author encourages forking/copying)
- **Command prefix:** `beads:*` (e.g., `/beads:create`, `/beads:list`)
- **Auto-init:** If `bd prime` fails, automatically run `bd init --stealth --quiet`
- **Stealth default:** Both auto-init and `/beads:init` command default to `--stealth`
- **Task agent:** Registered programmatically from `src/beads/vendor/agents/task-agent.md`
- **Vendor strategy:** Commit vendor files to repo, update manually or via sync script
- **System prompt:** Minimal beads awareness note; full guidance comes via context injection

## File Structure

```
src/beads/
├── index.ts          # Public API: exports integration functions
├── context.ts        # Auto-init, bd prime, context injection
├── vendor.ts         # Vendor file loaders (commands, agents, guidance strings)
└── vendor/
    ├── agents/
    │   └── task-agent.md           # Copied from upstream
    └── commands/
        ├── audit.md                # All 28 command files copied from upstream
        ├── blocked.md
        ├── close.md
        ├── comments.md
        ├── compact.md
        ├── create.md
        ├── decision.md
        ├── delete.md
        ├── dep.md
        ├── epic.md
        ├── export.md
        ├── import.md
        ├── init.md                 # Modified: stealth default in template body
        ├── label.md
        ├── list.md
        ├── prime.md
        ├── quickstart.md
        ├── ready.md
        ├── rename-prefix.md
        ├── reopen.md
        ├── restore.md
        ├── search.md
        ├── show.md
        ├── stats.md
        ├── sync.md
        ├── template.md
        ├── update.md
        ├── version.md
        └── workflow.md
```

## Architecture

### Integration with Main Plugin

`src/index.ts` is the single plugin entry point. It imports from `./beads` and merges beads functionality into the plugin return object:

```
TwOpenCodePlugin (index.ts)
  ├── experimental.chat.system.transform
  │   ├── TOOL_PRIORITY_RULES (existing)
  │   └── BEADS_AWARENESS (new, ~4 lines)
  ├── chat.message
  │   └── beads context injection (auto-init + bd prime)
  ├── event
  │   ├── workmux status handlers (existing)
  │   └── session.compacted → re-inject beads context
  ├── config
  │   ├── command: beads:* commands (28 commands)
  │   └── agent: beads-task-agent
  └── tool
      └── review-pipeline (existing)
```

### Module Responsibilities

**`src/beads/index.ts`** — Public API
- Exports `getBeadsConfig()` → returns `{ command, agent }` for config hook
- Exports `handleBeadsChatMessage()` → chat.message handler
- Exports `handleBeadsEvent()` → event handler (compaction)
- Exports `BEADS_AWARENESS` → system prompt string constant

**`src/beads/context.ts`** — Context Injection
- `injectBeadsContext(client, $, sessionID, context)` — runs `bd prime`, wraps in `<beads-context>` tags, injects via `client.session.prompt()` with `noReply: true` and `synthetic: true`
- `tryAutoInit($)` — if `bd prime` fails, runs `bd init --stealth --quiet`, returns boolean success
- Tracks injected sessions via `Set<string>` to avoid duplicates
- Checks existing messages for `<beads-context>` to handle plugin reload
- `getSessionContext(client, sessionID)` — finds most recent user message's model/agent for context passthrough

**`src/beads/vendor.ts`** — Vendor File Loaders
- `loadCommands()` → parses all `vendor/commands/*.md` files, returns `Config["command"]` with `beads:` prefix
- `loadAgent()` → parses `vendor/agents/task-agent.md`, returns `Config["agent"]` with CLI usage guide and subagent context prepended
- `BEADS_GUIDANCE` — CLI usage reference + agent delegation rules (injected with context)
- `parseMarkdownWithFrontmatter()` — shared parser for vendor `.md` files
- Stealth override for `init.md` — modifies the loaded init command template to default to `--stealth`

### Auto-Init Flow

```
Session starts → chat.message fires
  ├── Already injected this session? → skip
  ├── Existing <beads-context> in messages? → mark injected, skip
  └── Run bd prime
      ├── Success (non-empty output) → inject context
      └── Failure
          ├── bd not installed → silent skip (no error)
          └── bd installed but not initialized
              ├── Run bd init --stealth --quiet
              │   ├── Success → retry bd prime → inject context
              │   └── Failure → silent skip
              └── (Detection: check exit code / error message)
```

### Stealth Default Behavior

1. **Auto-init:** Always uses `bd init --stealth --quiet`
2. **`/beads:init` command:** Template body modified to instruct the agent to pass `--stealth` by default unless the user explicitly requests standard mode
3. **System prompt note:** Mentions stealth mode so the agent knows the configuration

### System Prompt Addition

Appended to `output.system` alongside `TOOL_PRIORITY_RULES`:

```
<beads-task-tracking>
## Task Tracking (beads)

This environment has beads (bd) available for task tracking. Use the bash tool
to run bd commands with --json for structured output. For multi-step beads work
(status overviews, working through issues), delegate to the beads-task-agent
subagent. Beads defaults to stealth mode (local-only, no git commits).
</beads-task-tracking>
```

### Context Injection Content

On session start and after compaction, injects:

```
<beads-context>
{output of bd prime}
</beads-context>

<beads-guidance>
## CLI Usage
{full CLI command reference}

## Agent Delegation
{when to use beads-task-agent vs direct CLI}
</beads-guidance>
```

### Changes to Existing Files

**`src/index.ts`** — Modified
- Import `{ getBeadsConfig, handleBeadsChatMessage, handleBeadsEvent, BEADS_AWARENESS }` from `./beads/index.js`
- Add `BEADS_AWARENESS` to system prompt transform
- Add `chat.message` handler calling `handleBeadsChatMessage`
- Extend `event` handler to also call `handleBeadsEvent` for `session.compacted`
- Add `config` handler merging beads commands and agents

**No other existing files change.**

### Dependencies

No new npm dependencies. The beads module uses:
- `node:fs/promises` and `node:path` (already available)
- `node:url` for `import.meta.url` resolution (already available)
- `@opencode-ai/plugin` types (already a dependency)
- `@opencode-ai/sdk` types — **need to add as dependency** (for `Config` type used by vendor.ts)

### Sync Strategy

Vendor files are committed to the repo. To update from upstream beads:
1. Copy the upstream `sync-beads.sh` script to `scripts/sync-beads.sh` (adapted for `src/beads/vendor/` path)
2. Run manually when desired: `bash scripts/sync-beads.sh`
3. Review changes, commit

## Out of Scope

- MCP server integration (beads-mcp) — CLI-only approach
- Beads-specific skills — the upstream guidance is sufficient
- Tests — consistent with project's existing approach
- Changes to deploy.sh — the beads module is compiled into `dist/` with the rest of the plugin
