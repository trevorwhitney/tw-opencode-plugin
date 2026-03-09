# Workmux Status Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace the separate workmux-status.ts plugin with integrated status handling in tw-opencode-plugin, adding clear-on-new-session and clear-on-exit behavior.

**Architecture:** A self-contained `src/workmux/` module exports a factory function that the main `src/index.ts` calls to create an event handler. The handler maps OpenCode events to `workmux set-window-status` CLI calls.

**Tech Stack:** TypeScript ESM, `@opencode-ai/plugin` SDK, `workmux` CLI

---

### Task 1: Create `src/workmux/index.ts`

**Files:**
- Create: `src/workmux/index.ts`

**Reuse:**
- `src/beads/context.ts:1` — same pattern of factory function receiving `$` from plugin input
- `src/index.ts:84` — existing `$\`workmux set-window-status ...\`.quiet()` call pattern

**Step 1: Create the workmux directory**

```bash
mkdir -p src/workmux
```

**Step 2: Write `src/workmux/index.ts`**

```typescript
import type { PluginInput } from "@opencode-ai/plugin";

type Shell = PluginInput["$"];

/**
 * Creates a workmux window status handler that maps OpenCode events
 * to workmux set-window-status CLI calls.
 *
 * Replaces the standalone workmux-status.ts plugin with integrated logic
 * that adds clear-on-new-session and clear-on-exit behavior.
 *
 * Event mapping:
 *   session.status (busy)    → working (🤖)
 *   permission.asked         → waiting (💬)
 *   question.asked           → waiting (💬)
 *   session.idle             → done    (✅)
 *   session.created          → clear   (resets icon for new session)
 *   global.disposed          → clear   (resets icon on exit)
 *
 * Dropped from upstream: permission.replied/question.replied → working.
 * That transition is invisible — the model immediately goes idle after
 * a reply, so the 🤖 flashes for a split second then becomes ✅.
 */
export function createWorkmuxStatusHandler($: Shell) {
  async function setStatus(status: "working" | "waiting" | "done" | "clear") {
    await $`workmux set-window-status ${status}`.quiet().nothrow();
  }

  return {
    async handleEvent({ event }: { event: { type: string; properties?: Record<string, unknown> } }) {
      const type = event.type as string;
      switch (type) {
        case "session.status": {
          const props = event.properties as { status?: { type?: string } } | undefined;
          if (props?.status?.type === "busy") {
            await setStatus("working");
          }
          break;
        }
        case "permission.asked":
        case "question.asked":
          await setStatus("waiting");
          break;
        case "session.idle":
          await setStatus("done");
          break;
        case "session.created":
        case "global.disposed":
          await setStatus("clear");
          break;
      }
    },
  };
}
```

**Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: Clean compilation, no errors.

---

### Task 2: Integrate into Main Plugin

**Files:**
- Modify: `src/index.ts`

**Reuse:**
- `src/index.ts:65` — existing pattern of creating a handler in plugin factory, then calling it in event hook
- `src/index.ts:79-93` — existing event handler to be refactored

**Step 1: Add import**

At the top of `src/index.ts`, add:
```typescript
import { createWorkmuxStatusHandler } from "./workmux/index.js";
```

**Step 2: Create handler in plugin factory**

Inside `TwOpenCodePlugin`, after the beads initialization (line 65), add:
```typescript
const workmux = createWorkmuxStatusHandler($);
```

**Step 3: Replace event handler**

Replace the entire `event` handler (lines 79-93) with:
```typescript
event: async (input) => {
  await workmux.handleEvent(input);
  const type = input.event.type as string;
  if (type === "session.compacted") {
    await beads.handleCompactionEvent(
      input.event as EventSessionCompacted,
    );
  }
},
```

**Step 4: Remove the old comment**

Remove lines 13-16 (the patch comment about v1 SDK event names). Replace with:
```typescript
// Workmux window status is handled by src/workmux/index.ts, replacing
// the standalone workmux-status.ts plugin with integrated logic that
// adds clear-on-new-session and clear-on-exit behavior.
```

**Step 5: Build and verify**

```bash
rm -rf dist && npm run build
```

Expected: Clean build. `dist/workmux/index.js` exists alongside `dist/beads/` and `dist/review/`.

---

### Task 3: Update Deploy Script

**Files:**
- Modify: `scripts/deploy.sh`

**Step 1: Remove workmux plugin symlink**

Remove lines 187-190 from `scripts/deploy.sh`:
```bash
# Register the workmux plugin (OpenCode discovers plugins from plugins/ plural)
link_item "${WORKMUX_DIR}/.opencode/plugin/workmux-status.ts" \
	"${PLUGINS_TARGET}/workmux-status.ts" \
	"workmux plugin"
```

Keep everything else in the Workmux section (repo clone/pull and skills copy).

**Step 2: Add cleanup for stale workmux plugin symlink**

After the existing cleanup loop at the bottom of deploy.sh, add a specific cleanup for the old symlink in case it exists from a previous deploy:
```bash
# Remove legacy workmux plugin (now integrated into tw-opencode-plugin)
if [ -e "${PLUGINS_TARGET}/workmux-status.ts" ]; then
	echo "  [remove] legacy workmux-status.ts plugin (now integrated)"
	rm "${PLUGINS_TARGET}/workmux-status.ts"
fi
```

This handles the transition: the existing stale-symlink cleanup only removes broken symlinks, but `workmux-status.ts` still points to a valid file in the workmux repo clone.

**Step 3: Deploy and verify**

```bash
npm run deploy
ls -la ~/.config/opencode/plugins/
```

Expected: `tw-opencode-plugin.js` and `superpowers.js` present. No `workmux-status.ts`.

---

### Task 4: Build, Deploy, and Commit

**Step 1: Full build**

```bash
rm -rf dist && npm run build
```

**Step 2: Deploy**

```bash
npm run deploy
```

**Step 3: Verify no workmux-status.ts plugin**

```bash
ls ~/.config/opencode/plugins/
```

Expected: `tw-opencode-plugin.js`, `superpowers.js` — no `workmux-status.ts`.

**Step 4: Verify workmux skills still present**

```bash
ls ~/.config/opencode/skills/workmux/
```

Expected: Workmux skill directories still present.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: integrate workmux status handling with clear-on-new-session and exit"
```
