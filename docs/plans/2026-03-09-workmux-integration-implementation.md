# Workmux Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Fully integrate workmux into tw-opencode-plugin — status handling with clear-on-new-session/exit, vendored commands under `workmux:` prefix, and deploy script cleanup.

**Architecture:** A `src/workmux/` module with vendor markdown files (the 5 upstream skills) and a command loader. Status handling is inlined in `src/index.ts`'s event handler. Shared vendor-loading utilities extracted to `src/shared/vendor-utils.ts`. Build script copies vendor files to `dist/`.

**Tech Stack:** TypeScript ESM, `@opencode-ai/plugin` SDK, `workmux` CLI

**Note on skill-to-command conversion:** The upstream workmux skills all have `disable-model-invocation: true`, meaning the model cannot invoke them mid-conversation — they're only triggered by user commands. The current `commands/*.md` wrappers are thin stubs that just say "Invoke the skill named X." Converting the skill body content directly into command templates produces identical behavior with less indirection. The model receives the full skill content when the user runs the command, exactly as before.

**Note on event names:** `session.status`, `session.idle`, `session.created`, and `global.disposed` are all present in the `@opencode-ai/sdk` v2 type definitions (`node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts`). The upstream `workmux-status.ts` already uses `session.status` and `session.idle`. Since the v1 Event union type doesn't include all v2 events, `event.type` is cast to `string` (existing pattern at `src/index.ts:80`).

---

### Task 1: Extract Shared Vendor Utilities

**Files:**
- Create: `src/shared/vendor-utils.ts`
- Modify: `src/beads/vendor.ts`

**Reuse:**
- `src/beads/vendor.ts:10-70` — the exact functions being extracted

Both `beads/vendor.ts` and the new `workmux/index.ts` need identical vendor-loading utilities. Extract them now rather than duplicate 90 lines.

**Step 1: Create `src/shared/vendor-utils.ts`**

Extract these 4 functions from `src/beads/vendor.ts`:

```typescript
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Markdown + frontmatter parsing
// ---------------------------------------------------------------------------

export interface ParsedMarkdown {
  frontmatter: Record<string, string | undefined>;
  body: string;
}

export function parseMarkdownWithFrontmatter(
  content: string,
): ParsedMarkdown | null {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  if (!match) return null;
  const frontmatterStr = match[1];
  const body = match[2];
  if (frontmatterStr === undefined || body === undefined) return null;
  const frontmatter: Record<string, string | undefined> = {};
  for (const line of frontmatterStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value === "[]") value = "";
    frontmatter[key] = value;
  }
  return { frontmatter, body: body.trim() };
}

// ---------------------------------------------------------------------------
// Vendor directory filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Create vendor file helpers scoped to a module's directory.
 * Pass `import.meta.url` from the calling module; vendor files are
 * resolved relative to `<module-dir>/vendor/`.
 */
export function createVendorHelpers(importMetaUrl: string) {
  const vendorDir = path.join(
    path.dirname(fileURLToPath(importMetaUrl)),
    "vendor",
  );

  async function readVendorFile(
    relativePath: string,
  ): Promise<string | null> {
    try {
      return await readFile(path.join(vendorDir, relativePath), "utf-8");
    } catch {
      return null;
    }
  }

  async function listVendorFiles(relativePath: string): Promise<string[]> {
    try {
      return await readdir(path.join(vendorDir, relativePath));
    } catch {
      return [];
    }
  }

  return { vendorDir, readVendorFile, listVendorFiles };
}
```

**Step 2: Update `src/beads/vendor.ts` to use shared utilities**

Replace the local implementations with imports:

- Remove `getVendorDir()`, `ParsedMarkdown` interface, `parseMarkdownWithFrontmatter()`, `readVendorFile()`, `listVendorFiles()` (lines 1-71)
- Add imports from shared module
- Replace `getVendorDir()` calls with `vendorDir` from the factory

The file should start with:
```typescript
import type { Config } from "@opencode-ai/sdk";
import {
  parseMarkdownWithFrontmatter,
  createVendorHelpers,
} from "../shared/vendor-utils.js";

const { readVendorFile, listVendorFiles } = createVendorHelpers(
  import.meta.url,
);
```

Everything from `BEADS_CLI_USAGE` onward stays unchanged.

**Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: Clean compilation.

---

### Task 2: Copy Vendor Files and Create Workmux Command Loader

**Files:**
- Create: `src/workmux/vendor/commands/coordinator.md`
- Create: `src/workmux/vendor/commands/merge.md`
- Create: `src/workmux/vendor/commands/open-pr.md`
- Create: `src/workmux/vendor/commands/rebase.md`
- Create: `src/workmux/vendor/commands/worktree.md`
- Create: `src/workmux/index.ts`

**Reuse:**
- `src/shared/vendor-utils.ts` — shared vendor parsing/loading
- `src/beads/vendor.ts:147-162` — `loadCommands()` pattern

**Step 1: Create vendor directory and copy skill files**

```bash
mkdir -p src/workmux/vendor/commands
```

Copy the 5 SKILL.md files from the upstream workmux repo (`~/.config/opencode/workmux/skills/*/SKILL.md` or `https://github.com/raine/workmux/tree/main/skills`). Copy body content verbatim. Replace the skill-specific frontmatter with command-compatible frontmatter (only `description` is needed):

```markdown
---
description: <description from upstream SKILL.md frontmatter>
---

<body content from upstream SKILL.md, verbatim>
```

The 5 files:
1. `coordinator.md` — from `skills/coordinator/SKILL.md`
2. `merge.md` — from `skills/merge/SKILL.md`
3. `open-pr.md` — from `skills/open-pr/SKILL.md`
4. `rebase.md` — from `skills/rebase/SKILL.md`
5. `worktree.md` — from `skills/worktree/SKILL.md`

**Step 2: Create `src/workmux/index.ts`**

```typescript
import type { Config } from "@opencode-ai/sdk";
import {
  parseMarkdownWithFrontmatter,
  createVendorHelpers,
} from "../shared/vendor-utils.js";

const { readVendorFile, listVendorFiles } = createVendorHelpers(
  import.meta.url,
);

export async function loadCommands(): Promise<Config["command"]> {
  const files = await listVendorFiles("commands");
  const commands: Config["command"] = {};
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const content = await readVendorFile(`commands/${file}`);
    if (!content) continue;
    const parsed = parseMarkdownWithFrontmatter(content);
    if (!parsed) continue;
    const name = `workmux:${file.replace(".md", "")}`;
    const description = parsed.frontmatter.description ?? name;
    commands[name] = { description, template: parsed.body };
  }
  return commands;
}
```

**Step 3: Update build script to copy vendor files**

Replace the current `package.json` build script with a build shell script for readability.

Create `scripts/build.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

# Compile TypeScript
tsc

# Copy vendor markdown files that tsc doesn't emit
for module in beads workmux; do
  rm -rf "dist/${module}/vendor"
  mkdir -p "dist/${module}"
  cp -r "src/${module}/vendor" "dist/${module}/vendor"
done
```

Update `package.json`:
```json
"build": "bash scripts/build.sh"
```

**Step 4: Verify it compiles and vendor files copy**

```bash
rm -rf dist && npm run build
ls dist/workmux/vendor/commands/  # Should list 5 .md files
ls dist/beads/vendor/commands/    # Should still list 29 .md files
```

---

### Task 3: Integrate into Main Plugin

**Files:**
- Modify: `src/index.ts`

**Reuse:**
- `src/index.ts:60-65` — existing pattern of loading commands in plugin factory
- `src/index.ts:126-129` — existing config hook that merges beads commands

**Step 1: Add import**

At the top of `src/index.ts`, add:
```typescript
import { loadCommands as loadWorkmuxCommands } from "./workmux/index.js";
```

**Step 2: Load workmux commands in plugin factory**

Update the existing `Promise.all` at lines 61-64:

```typescript
const [beadsCommands, beadsAgents, workmuxCommands] = await Promise.all([
  loadCommands(),
  loadAgent(),
  loadWorkmuxCommands(),
]);
```

**Step 3: Expand the event handler**

Replace the event handler (lines 79-93). Changes from current code:
- Added `session.status` (busy→working) and `session.idle` (→done) from upstream `workmux-status.ts`
- Added `session.created` and `global.disposed` (→clear) for new-session and exit cleanup
- Removed `permission.replied`/`question.replied` → working (model immediately goes idle after reply, making this transition invisible)
- Added `.nothrow()` so the plugin doesn't crash when workmux CLI isn't installed

```typescript
event: async ({ event }) => {
  const type = event.type as string;
  switch (type) {
    case "session.status": {
      const props = event.properties as
        | { status?: { type?: string } }
        | undefined;
      if (props?.status?.type === "busy") {
        await $`workmux set-window-status working`.quiet().nothrow();
      }
      break;
    }
    case "permission.asked":
    case "question.asked":
      await $`workmux set-window-status waiting`.quiet().nothrow();
      break;
    case "session.idle":
      await $`workmux set-window-status done`.quiet().nothrow();
      break;
    case "session.created":
    case "global.disposed":
      await $`workmux set-window-status clear`.quiet().nothrow();
      break;
    case "session.compacted":
      await beads.handleCompactionEvent(event as EventSessionCompacted);
      break;
  }
},
```

**Step 4: Merge workmux commands in config hook**

Update the config hook (lines 126-129):

```typescript
config: async (config) => {
  config.command = { ...config.command, ...beadsCommands, ...workmuxCommands };
  config.agent = { ...config.agent, ...beadsAgents };
},
```

**Step 5: Delete the old patch comment at lines 13-16**

The comment about v1 SDK event names is outdated. The code is self-explanatory.

**Step 6: Build and verify**

```bash
rm -rf dist && npm run build
```

Expected: Clean build. `dist/workmux/index.js` exists. `dist/shared/vendor-utils.js` exists.

---

### Task 4: Clean Up Deploy Script and Command Wrappers

**Files:**
- Modify: `scripts/deploy.sh`
- Delete: `commands/coordinator.md`
- Delete: `commands/merge.md`
- Delete: `commands/open-pr.md`
- Delete: `commands/rebase.md`
- Delete: `commands/worktree.md`

**Step 1: Remove the entire Workmux section from deploy.sh**

Delete lines 168-195 (the `# ── Workmux ───` section): repo clone/pull, plugin symlink, skills copy.

Replace with a one-time cleanup block in the same location:

```bash
# ── Workmux (legacy cleanup) ─────────────────────────────────
# Workmux status and commands are now integrated into tw-opencode-plugin.
# Clean up artifacts from the previous deploy approach.
if [ -L "${PLUGINS_TARGET}/workmux-status.ts" ]; then
	echo "  [remove] legacy workmux-status.ts plugin"
	rm "${PLUGINS_TARGET}/workmux-status.ts"
fi
if [ -d "${SKILLS_TARGET}/workmux" ]; then
	echo "  [remove] legacy workmux skills directory"
	rm -rf "${SKILLS_TARGET}/workmux"
fi
```

**Step 2: Delete the 5 command wrapper files**

These are replaced by plugin-registered `workmux:*` commands:

```bash
rm commands/coordinator.md commands/merge.md commands/open-pr.md commands/rebase.md commands/worktree.md
```

**Step 3: Deploy and verify**

```bash
npm run deploy
ls ~/.config/opencode/plugins/     # tw-opencode-plugin.js, superpowers.js — no workmux-status.ts
ls ~/.config/opencode/skills/      # No workmux/ directory
ls ~/.config/opencode/command/     # No coordinator.md, merge.md, etc.
```

**Step 4: Commit**

```bash
git add src/shared/ src/workmux/ src/beads/vendor.ts src/index.ts \
       scripts/build.sh scripts/deploy.sh package.json \
       docs/plans/2026-03-09-workmux-*
git add -u commands/  # stages deletions
git commit -m "feat: integrate workmux status and commands, remove upstream plugin dependency"
```
