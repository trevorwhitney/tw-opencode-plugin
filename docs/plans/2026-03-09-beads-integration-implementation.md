# Beads Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Integrate beads issue tracking into tw-opencode-plugin with stealth-by-default, auto-initialization, and all upstream commands/agents.

**Architecture:** A self-contained `src/beads/` module exports functions that the main `src/index.ts` calls to register commands, agents, event handlers, and system prompt additions. Vendor files (command/agent markdown) are committed to the repo and copied to `dist/` during build.

**Tech Stack:** TypeScript ESM, `@opencode-ai/plugin` SDK, `@opencode-ai/sdk` types (transitive dep), `bd` CLI

**Note on two guidance constants:**
- `BEADS_AWARENESS` — short (4 lines), injected into the **system prompt** on every message. Tells the model beads exists and to use `--json` + delegate to the subagent. Always present regardless of whether beads is initialized.
- `BEADS_GUIDANCE` — full CLI reference + agent delegation rules, injected **per-session** alongside `bd prime` output in `<beads-context>` tags. Only appears when beads context is successfully injected. Contains the detailed command reference the model needs for actual operations.

**Note on auto-init:** The plugin silently runs `bd init --stealth --quiet` when beads isn't initialized in the project. This is intentional — the user explicitly opted into this behavior by choosing auto-init during design. Stealth mode ensures no files are committed to the repo, making it safe for shared repositories.

---

### Task 1: Copy Vendor Files and Update Build Script

**Files:**
- Create: `src/beads/vendor/agents/task-agent.md`
- Create: `src/beads/vendor/commands/*.md` (28 command files)
- Modify: `package.json` (build script)

**Step 1: Create vendor directory structure**

```bash
mkdir -p src/beads/vendor/agents src/beads/vendor/commands
```

**Step 2: Copy all vendor files from upstream opencode-beads v0.5.5**

Copy every file from the upstream repo's `vendor/` directory into `src/beads/vendor/`. These are markdown files with YAML frontmatter. Copy them verbatim except for `init.md`.

Command files (29 total): `audit.md`, `blocked.md`, `close.md`, `comments.md`, `compact.md`, `create.md`, `decision.md`, `delete.md`, `dep.md`, `epic.md`, `export.md`, `import.md`, `init.md`, `label.md`, `list.md`, `prime.md`, `quickstart.md`, `ready.md`, `rename-prefix.md`, `reopen.md`, `restore.md`, `search.md`, `show.md`, `stats.md`, `sync.md`, `template.md`, `update.md`, `version.md`, `workflow.md`

Agent file: `task-agent.md`

**Step 3: Modify `init.md` for stealth default**

Replace the body of `src/beads/vendor/commands/init.md` with stealth-first instructions:

```markdown
---
description: Initialize beads in the current project
argument-hint: [prefix]
---

Initialize beads issue tracking in the current directory.

**Default behavior:** Use `--stealth` mode unless the user explicitly requests standard (non-stealth) initialization. Stealth mode keeps beads data local-only without committing .beads/ files to the repository.

If a prefix is provided as $1, use it as the issue prefix (e.g., "myproject" creates issues like myproject-1, myproject-2). If not provided, the default is the current directory name.

Use the bash tool to run: `bd init --stealth --quiet [prefix]`

If the user explicitly asks for non-stealth mode, omit the `--stealth` flag:
`bd init --quiet [prefix]`

After initialization, run `bd prime` to verify and show the user the initial state.
```

**Step 4: Update build script to copy vendor files to dist**

The vendor `.md` files are not TypeScript and won't be emitted by `tsc`. The `vendor.ts` file uses `import.meta.url` to resolve a `vendor/` directory relative to itself (pattern from upstream: `path.join(__dirname, "..", "vendor")`). At runtime, `vendor.js` lives in `dist/beads/`, so `../vendor` resolves to `dist/vendor/` — the vendor files must exist there.

Update `package.json` build script:
```json
"build": "tsc && cp -r src/beads/vendor dist/beads/vendor"
```

**Step 5: Verify vendor files copy correctly**

```bash
rm -rf dist && npm run build
ls dist/beads/vendor/commands/  # Should list all 29 .md files
ls dist/beads/vendor/agents/    # Should list task-agent.md
```

---

### Task 2: Create TypeScript Modules

**Files:**
- Create: `src/beads/vendor.ts`
- Create: `src/beads/context.ts`
- Create: `src/beads/index.ts`

**Reuse:**
- `src/review/pipeline.ts:1` — demonstrates that `@opencode-ai/sdk` types already resolve as a transitive dependency. Use `import type { Config } from "@opencode-ai/sdk"` in `vendor.ts`.
- `src/review/pipeline.ts:4` — `ReturnType<typeof createOpencodeClient>` pattern for typing the client.
- Upstream `opencode-beads/src/vendor.ts` — port `parseMarkdownWithFrontmatter()`, `readVendorFile()`, `listVendorFiles()`, `loadCommands()`, `loadAgent()`, and all string constants (`BEADS_CLI_USAGE`, `BEADS_SUBAGENT_CONTEXT`, `BEADS_GUIDANCE`).
- Upstream `opencode-beads/src/plugin.ts` — port `injectBeadsContext()`, `getSessionContext()`, session dedup logic.

#### 2a: Create `src/beads/vendor.ts`

This file loads vendor markdown files and exports config/guidance:

1. `getVendorDir()` — uses `import.meta.url` to resolve `../vendor` relative to itself (same pattern as upstream, works because build copies vendor to `dist/beads/vendor/`)
2. `parseMarkdownWithFrontmatter(content)` — parses YAML frontmatter + body from markdown strings
3. `readVendorFile(relativePath)` / `listVendorFiles(relativePath)` — fs helpers
4. `BEADS_CLI_USAGE` — full CLI command reference string (same content as upstream)
5. `BEADS_SUBAGENT_CONTEXT` — subagent behavior instructions (same as upstream)
6. `BEADS_GUIDANCE` — wraps CLI usage + agent delegation rules in `<beads-guidance>` tags (same as upstream)
7. `loadCommands()` → `Config["command"]` — reads `vendor/commands/*.md`, parses frontmatter, returns entries with `beads:` prefix. Description includes `argument-hint` if present.
8. `loadAgent()` → `Config["agent"]` — reads `vendor/agents/task-agent.md`, prepends `BEADS_CLI_USAGE` + `BEADS_SUBAGENT_CONTEXT` to body, returns `{ "beads-task-agent": { description, prompt, mode: "subagent" } }`

Imports: `node:fs/promises`, `node:path`, `node:url`, `type { Config } from "@opencode-ai/sdk"`.

#### 2b: Create `src/beads/context.ts`

This file handles auto-init and context injection:

1. `createBeadsContextManager(client, $)` — factory returning `{ handleChatMessage, handleCompactionEvent }`. Closes over `Set<string>` for session tracking.

2. Internal `getSessionContext(client, sessionID)` — mirrors upstream: fetches last 50 messages, finds most recent user message's model/agent. Returns `{ model?, agent? } | undefined`.

3. Internal `tryAutoInit($)` — runs `bd init --stealth --quiet`. Returns `true` on success. If `bd` command is not found (ENOENT/exit 127), returns `false` without retry. If `bd` exists but init fails for another reason, returns `false`.

4. Internal `injectBeadsContext(client, $, sessionID, context)` — runs `bd prime`, checks for non-empty output, wraps in `<beads-context>` tags + appends `BEADS_GUIDANCE`, injects via `client.session.prompt()` with `noReply: true`, `synthetic: true` parts, and passes `context.model`/`context.agent` to prevent mode switching.

5. `handleChatMessage(input, output)` — the `chat.message` hook:
   - Skip if session already in `injectedSessions` set
   - Check existing messages for `<beads-context>` (handles plugin reload)
   - Mark session as injected
   - Try `injectBeadsContext()`
   - If `bd prime` fails/empty: call `tryAutoInit($)`, on success retry `injectBeadsContext()`
   - All failures silently swallowed (wrapped in try/catch)
   - Uses `output.message.model` and `output.message.agent` for context passthrough

6. `handleCompactionEvent(event)` — for `session.compacted`:
   - Extract `sessionID` from `event.properties`
   - Get session context via `getSessionContext()`
   - Call `injectBeadsContext()`

Imports: `type { PluginInput } from "@opencode-ai/plugin"`, `{ BEADS_GUIDANCE } from "./vendor.js"`.

Type the client as `PluginInput["client"]` and shell as `PluginInput["$"]`.

#### 2c: Create `src/beads/index.ts`

Barrel export + `BEADS_AWARENESS` constant:

```typescript
export { loadCommands, loadAgent } from "./vendor.js";
export { createBeadsContextManager } from "./context.js";

export const BEADS_AWARENESS = `<beads-task-tracking>
## Task Tracking (beads)

This environment has beads (bd) available for task tracking. Use the bash tool
to run bd commands with --json for structured output. For multi-step beads work
(status overviews, working through issues), delegate to the beads-task-agent
subagent. Beads defaults to stealth mode (local-only, no git commits).
</beads-task-tracking>`;
```

---

### Task 3: Integrate into Main Plugin, Build, and Verify

**Files:**
- Modify: `src/index.ts`

**Reuse:**
- Existing hook patterns in `src/index.ts:53-104` — system prompt transform, event handler, tool registration. All existing behavior must be preserved unchanged.

**Step 1: Add imports**

At the top of `src/index.ts`, add:
```typescript
import {
  loadCommands,
  loadAgent,
  createBeadsContextManager,
  BEADS_AWARENESS,
} from "./beads/index.js";
```

**Step 2: Initialize beads in plugin factory**

Inside `TwOpenCodePlugin`, before the return statement:
```typescript
const [beadsCommands, beadsAgents] = await Promise.all([
  loadCommands(),
  loadAgent(),
]);
const beads = createBeadsContextManager(client, $);
```

**Step 3: Add BEADS_AWARENESS to system prompt**

In `experimental.chat.system.transform`, add after the existing `TOOL_PRIORITY_RULES` push:
```typescript
output.system.push(BEADS_AWARENESS);
```

**Step 4: Add chat.message handler**

New hook in the returned object:
```typescript
"chat.message": async (_input, output) => {
  await beads.handleChatMessage(_input, output);
},
```

**Step 5: Extend event handler with compaction case**

Add to the existing switch in `event`:
```typescript
case "session.compacted":
  await beads.handleCompactionEvent(event);
  break;
```

**Step 6: Add config handler**

New hook in the returned object:
```typescript
config: async (config) => {
  config.command = { ...config.command, ...beadsCommands };
  config.agent = { ...config.agent, ...beadsAgents };
},
```

**Step 7: Build and verify**

```bash
rm -rf dist && npm run build
```

Expected: Clean build. `dist/beads/` contains `index.js`, `context.js`, `vendor.js` (+ `.d.ts` + `.map` files), and `vendor/` directory with all markdown files.

**Step 8: Deploy**

```bash
npm run deploy
```

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: integrate beads issue tracking with stealth-by-default"
```
