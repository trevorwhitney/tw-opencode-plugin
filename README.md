# tw-plugin

Personal coding agent plugin — skills, commands, agents, and tools for OpenCode and Claude Code.

## Structure

```
tw-plugin/
├── .claude-plugin/plugin.json  # Claude Code plugin manifest
├── CLAUDE.md                   # Tool-priority rules for Claude Code
├── src/index.ts                # OpenCode plugin entry point (custom tools & hooks)
├── skills/                     # Shared skills (both platforms)
│   ├── github/
│   ├── grafana/
│   ├── fix-correctness-bug/
│   ├── explain-correctness-failure/
│   ├── debug-ci-failure/
│   ├── tdd-workflow/
│   ├── writing-plans/
│   ├── subagent-driven-development/
│   └── security-review/
├── commands/                   # Shared slash commands (both platforms)
├── agents/                     # Shared agent definitions (both platforms)
└── scripts/deploy.sh           # Deploys to both OpenCode and Claude Code configs
```

## Installation

### OpenCode

#### 1. Install dependencies and build

```bash
npm install
npm run build
```

#### 2. Restart OpenCode

Restart OpenCode to pick up the plugin and skill changes.

### Claude Code

Two approaches are available:

**Development/testing** — pass the plugin directory at startup:

```bash
claude --plugin-dir /path/to/tw-plugin
```

**Persistent install** — run the deploy script, which registers the plugin in `~/.claude/plugins/installed_plugins.json` and enables it in `~/.claude/settings.json`:

```bash
npm run deploy
# or
bash scripts/deploy.sh
```

After install, skills are available as slash commands prefixed with `/tw:` (e.g. `/tw:code-review`).

## Platform differences

| Feature                        | OpenCode                    | Claude Code                             |
| ------------------------------ | --------------------------- | --------------------------------------- |
| Skills                         | Yes                         | Yes                                     |
| Commands (slash)               | Yes                         | Yes (prefixed `/tw:`)                   |
| Agents                         | Yes                         | Yes                                     |
| Custom tools (review pipeline) | Yes                         | No (requires JS plugin SDK)             |
| Beads integration              | Yes                         | No (requires JS hooks)                  |
| Workmux status                 | Yes                         | No (separate CC hooks in settings.json) |
| Tool-priority rules            | Via system prompt injection | Via CLAUDE.md                           |

## Development

### Adding a new skill

Create `skills/<skill-name>/SKILL.md` with YAML frontmatter:

```markdown
---
name: my-skill
description: Short description shown in the skill picker.
---

# My Skill

Detailed instructions for the agent when this skill is loaded.
```

### Adding a custom tool

Edit `src/index.ts`:

```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

export default (async (_ctx) => {
  return {
    tool: {
      "my-tool": tool({
        description: "Does something useful",
        args: {
          input: tool.schema.string().describe("The input value"),
        },
        async execute(args) {
          return `Result: ${args.input}`;
        },
      }),
    },
  };
}) satisfies Plugin;
```

Then rebuild: `npm run build`.

### Adding a slash command

Create `commands/<command-name>.md` with YAML frontmatter:

```markdown
---
description: Short description of the command.
argument-hint: "<required-arg>"
---

Command template that the agent receives when `/command-name` is invoked. Use `$ARGUMENTS` to reference the user's input.
```

### Skill frontmatter reference

| Field           | Type      | Description                                  |
| --------------- | --------- | -------------------------------------------- |
| `name`          | string    | Skill identifier (matches directory name)    |
| `description`   | string    | Shown in the skill picker                    |
| `model`         | string?   | Override the model used when skill is active |
| `agent`         | string?   | Restrict to a specific agent                 |
| `argument-hint` | string?   | Hint shown when skill accepts arguments      |
| `allowed-tools` | string[]? | Restrict which tools the skill can use       |
| `subtask`       | boolean?  | Whether this skill runs as a subtask         |

## Configuration

The review pipeline (used by `/code-review`, `/plan-review`, `/spec-review`) is configured via `~/.config/opencode/tw-plugin.json`.

### Review critics

Choose which critic agents participate in reviews by listing them in the `review.agents` array. Available critics:

- `critic-codex` — OpenAI Codex
- `critic-opus` — Anthropic Opus
- `critic-gemini` — Google Gemini
- `critic-sonnet` — Anthropic Sonnet

Example config:

```json
{
  "review": {
    "agents": ["critic-sonnet", "critic-opus", "critic-codex"]
  }
}
```

If no config file is present, the defaults are used:

```json
{
  "review": {
    "agents": ["critic-codex", "critic-opus", "critic-gemini"],
    "timeoutMs": 300000
  }
}
```

| Field              | Type       | Default                                        | Description                          |
| ------------------ | ---------- | ---------------------------------------------- | ------------------------------------ |
| `review.agents`    | `string[]` | `["critic-codex", "critic-opus", "critic-gemini"]` | Critic agents to use in reviews  |
| `review.timeoutMs` | `number`   | `300000` (5 min)                               | Per-agent timeout in milliseconds    |

## Useful commands

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
npm run typecheck  # Type-check without emitting
npm run deploy     # Deploy to OpenCode and Claude Code configs
```
