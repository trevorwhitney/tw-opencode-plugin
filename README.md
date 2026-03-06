# tw-opencode-plugin

Personal OpenCode plugin — central home for skills, commands, and custom tools.

## Structure

```
tw-opencode-plugin/
├── src/index.ts          # Plugin entry point (custom tools & hooks)
├── skills/               # SKILL.md files (deployed to ~/.config/opencode/skills/)
│   ├── github/
│   ├── grafana/
│   ├── fix-correctness-bug/
│   ├── explain-correctness-failure/
│   ├── debug-ci-failure/
│   ├── git-worktree/
│   ├── tdd-workflow/
│   ├── test-correctness-hypothesis/
│   └── security-review/
├── commands/             # Slash command markdown files
└── scripts/deploy.sh    # Symlinks skills into OpenCode config
```

## Installation

### 1. Install dependencies and build

```bash
npm install
npm run build
```

### 2. Register the plugin

Add the local path to the `plugin` array in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "file:/Users/twhitney/workspace/tw-opencode-plugin",
    "oh-my-opencode@latest"
  ]
}
```

### 3. Register in the Claude plugin DB

OpenCode discovers slash commands from plugins registered in the Claude Code plugin database. Add an entry for `tw` in `~/.claude/plugins/installed_plugins.json` so that the `commands/` directory is picked up:

```json
{
  "version": 2,
  "plugins": {
    "tw": [
      {
        "scope": "user",
        "installPath": "/Users/twhitney/workspace/tw-opencode-plugin",
        "version": "0.1.0",
        "installedAt": "2026-03-04T19:40:00.000Z",
        "lastUpdated": "2026-03-04T19:40:00.000Z"
      }
    ]
  }
}
```

The `"tw"` key must match the `name` field in `.claude-plugin/plugin.json`. Once registered, commands in `commands/` are available as `/tw:<command-name>` (e.g. `/tw:code-review`).

### 4. Restart OpenCode

Restart OpenCode to pick up the plugin and skill changes.

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

Command template that the agent receives when `/command-name` is invoked.
Use `$ARGUMENTS` to reference the user's input.
```

### Skill frontmatter reference

| Field            | Type       | Description                                      |
|------------------|------------|--------------------------------------------------|
| `name`           | string     | Skill identifier (matches directory name)        |
| `description`    | string     | Shown in the skill picker                        |
| `model`          | string?    | Override the model used when skill is active      |
| `agent`          | string?    | Restrict to a specific agent                     |
| `argument-hint`  | string?    | Hint shown when skill accepts arguments          |
| `allowed-tools`  | string[]?  | Restrict which tools the skill can use           |
| `subtask`        | boolean?   | Whether this skill runs as a subtask             |

## Useful commands

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
npm run typecheck  # Type-check without emitting
```
