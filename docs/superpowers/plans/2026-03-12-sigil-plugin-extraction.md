# Sigil Plugin Extraction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Sigil AI telemetry integration from `tw-opencode-plugin` into a standalone OpenCode plugin at `~/workspace/opencode-sigil/opencode-sigil`.

**Architecture:** The new plugin registers `chat.message` and `event` hooks directly with OpenCode, reads its own config file (`~/.config/opencode/opencode-sigil.json`), and bundles the vendored Sigil SDK via esbuild. `tw-opencode-plugin` removes all Sigil code afterward.

**Tech Stack:** TypeScript (ES2022/ESM), esbuild (bundler), vitest (tests), `@opencode-ai/plugin` (peer dep), `@grafana/sigil-sdk-js` v0.1.0 (vendored, bundled)

**Spec:** `docs/superpowers/specs/2026-03-12-sigil-plugin-extraction-design.md`

**Source repo:** `~/workspace/tw-opencode-plugin/tw-opencode-plugin` (referred to as `$SRC` below)
**Target repo:** `~/workspace/opencode-sigil/opencode-sigil` (referred to as `$TGT` below)

---

## File Structure

### New files in `$TGT`

| File | Responsibility |
|------|---------------|
| `package.json` | Package manifest with peer deps, esbuild bundling |
| `tsconfig.json` | TypeScript config (ES2022, strict, bundler resolution) |
| `vitest.config.ts` | Test runner config |
| `.gitignore` | Ignore node_modules and dist |
| `scripts/build.sh` | Type-check + esbuild bundle |
| `scripts/deploy.sh` | Local dev symlink into `~/.config/opencode/plugins/` |
| `vendor/grafana-sigil-sdk-js-0.1.0.tgz` | Vendored SDK (copied from $SRC) |
| `skills/sigil/SKILL.md` | AI agent skill definition (moved from $SRC) |
| `src/index.ts` | Plugin entry point -- exports `SigilPlugin` |
| `src/config.ts` | `SigilConfig` types + `loadSigilConfig()` |
| `src/client.ts` | `createSigilClient()`, `resolveEnvVars()` |
| `src/hooks.ts` | `createSigilHooks()` factory + event handlers |
| `src/mappers.ts` | OpenCode -> Sigil type mappers |
| `src/mappers.test.ts` | Mapper tests (12 tests) |
| `src/redact.ts` | Secret redaction engine |
| `src/redact.test.ts` | Redaction tests (15 tests) |

### Files modified in `$SRC`

| File | Change |
|------|--------|
| `src/index.ts` | Remove sigil imports, initialization, and hook calls |
| `src/shared/config.ts` | Remove `SigilConfig`, `SigilAuthConfig`, `parseSigilConfig`, sigil field from `PluginConfig` |
| `package.json` | Remove `@grafana/sigil-sdk-js` dependency |

### Files deleted from `$SRC`

- `src/sigil/` (entire directory)
- `skills/sigil/` (entire directory)
- `vendor/grafana-sigil-sdk-js-0.1.0.tgz`

---

## Task 1: Scaffold and populate the new plugin

**Prerequisite:** `$TGT` directory exists and is a git repository. Verify with `ls $TGT/.git`.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Copy: `vendor/grafana-sigil-sdk-js-0.1.0.tgz` from `$SRC`
- Copy: `skills/sigil/SKILL.md` from `$SRC`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "opencode-sigil",
  "version": "0.1.0",
  "description": "OpenCode plugin for Grafana Sigil AI telemetry",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "skills"],
  "scripts": {
    "build": "bash scripts/build.sh",
    "typecheck": "tsc --noEmit",
    "deploy": "bash scripts/deploy.sh",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "^1.2.16"
  },
  "devDependencies": {
    "@grafana/sigil-sdk-js": "file:vendor/grafana-sigil-sdk-js-0.1.0.tgz",
    "@opencode-ai/plugin": "^1.2.16",
    "@opencode-ai/sdk": "^1.2.16",
    "@types/node": "^22.13.9",
    "esbuild": "^0.25.0",
    "typescript": "^5.8.2",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Match `$SRC/tsconfig.json` exactly (ES2022, strict, bundler resolution, declaration, declarationMap, sourceMap).

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
```

- [ ] **Step 5: Copy vendor tarball and skill**

```bash
mkdir -p $TGT/vendor $TGT/skills/sigil
cp $SRC/vendor/grafana-sigil-sdk-js-0.1.0.tgz $TGT/vendor/
cp $SRC/skills/sigil/SKILL.md $TGT/skills/sigil/SKILL.md
```

- [ ] **Step 6: Install dependencies**

```bash
cd $TGT && npm install
```

Expected: clean install, no errors.

---

## Task 2: Create config module (new file)

**Files:**
- Create: `src/config.ts`

This consolidates `SigilConfig`, `SigilAuthConfig`, `parseSigilConfig` from `$SRC/src/shared/config.ts` and adds a new `loadSigilConfig()` function that reads `~/.config/opencode/opencode-sigil.json`.

- [ ] **Step 1: Write src/config.ts**

Types: copy `SigilAuthConfig` and `SigilConfig` type definitions verbatim from `$SRC/src/shared/config.ts`.

`parseSigilConfig()`: copy verbatim from `$SRC/src/shared/config.ts`.

`loadSigilConfig()`: new function -- reads `~/.config/opencode/opencode-sigil.json`, calls `parseSigilConfig()` on the parsed JSON, returns a `DISABLED` sentinel config on failure.

```typescript
const CONFIG_PATH = join(homedir(), ".config", "opencode", "opencode-sigil.json");

const DISABLED: SigilConfig = {
  enabled: false,
  endpoint: "",
  auth: { mode: "none" },
};

export async function loadSigilConfig(): Promise<SigilConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parseSigilConfig(parsed) ?? DISABLED;
  } catch {
    return DISABLED;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

---

## Task 3: Copy source modules with import path fixes

**Files:**
- Create: `src/client.ts` (from `$SRC/src/sigil/client.ts`)
- Create: `src/redact.ts` (from `$SRC/src/sigil/redact.ts`)
- Create: `src/redact.test.ts` (from `$SRC/src/sigil/redact.test.ts`)
- Create: `src/mappers.ts` (from `$SRC/src/sigil/mappers.ts`)
- Create: `src/mappers.test.ts` (from `$SRC/src/sigil/mappers.test.ts`)

- [ ] **Step 1: Copy files**

```bash
cp $SRC/src/sigil/client.ts    $TGT/src/client.ts
cp $SRC/src/sigil/redact.ts    $TGT/src/redact.ts
cp $SRC/src/sigil/redact.test.ts $TGT/src/redact.test.ts
cp $SRC/src/sigil/mappers.ts   $TGT/src/mappers.ts
cp $SRC/src/sigil/mappers.test.ts $TGT/src/mappers.test.ts
```

- [ ] **Step 2: Fix import paths in client.ts**

In `src/client.ts`, change:
- `import type { SigilConfig, SigilAuthConfig } from "../shared/config.js"` -> `import type { SigilConfig, SigilAuthConfig } from "./config.js"`

No other changes needed. `redact.ts`, `mappers.ts`, and test files have no imports from `../shared/` and need no changes.

- [ ] **Step 3: Run tests**

```bash
cd $TGT && npx vitest run
```

Expected: 27 tests PASS (15 redact + 12 mappers)

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

---

## Task 4: Create hooks module (merge two files)

**Files:**
- Create: `src/hooks.ts`

Merge `$SRC/src/sigil/hooks.ts` (handler functions) and `$SRC/src/sigil/index.ts` (factory + types) into a single `src/hooks.ts`.

- [ ] **Step 1: Write src/hooks.ts**

Start from `$SRC/src/sigil/hooks.ts` as the base. Apply these changes:

**Imports:**
- Replace `import type { SigilConfig } from "../shared/config.js"` with `import type { SigilConfig } from "./config.js"`
- Add `import { createSigilClient } from "./client.js"` (was in index.ts)
- Add `import { Redactor } from "./redact.js"` (was in index.ts)
- Keep existing imports from `@grafana/sigil-sdk-js`, `@opencode-ai/sdk`, `@opencode-ai/plugin`, `./mappers.js`

**Functions:**
- Change `handleChatMessage`, `handleEvent`, `handleLifecycle` from `export function` to plain `function` (they become internal)

**Append from `$SRC/src/sigil/index.ts`:**
- Copy the `SigilHooks` type definition (export it)
- Copy the `createSigilHooks` async function (export it)
- In `createSigilHooks`, inline the function body -- it already references `handleEvent`, `handleLifecycle`, `handleChatMessage` which are now in the same file

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

---

## Task 5: Create plugin entry point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write src/index.ts**

```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { loadSigilConfig } from "./config.js";
import { createSigilHooks } from "./hooks.js";

export const SigilPlugin: Plugin = async ({ client }) => {
  const config = await loadSigilConfig();
  if (!config.enabled) return {};

  const hooks = await createSigilHooks(config, client);
  if (!hooks) return {};

  return {
    "chat.message": async (input, output) => {
      hooks.chatMessage(input, output);
    },
    event: async ({ event }) => {
      await hooks.event({
        event: event as { type: string; properties: unknown },
      });
    },
  };
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

---

## Task 6: Create build and deploy scripts

**Files:**
- Create: `scripts/build.sh`
- Create: `scripts/deploy.sh`

- [ ] **Step 1: Write scripts/build.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

tsc --noEmit

npx esbuild src/index.ts \
  --bundle \
  --format=esm \
  --platform=node \
  --target=es2022 \
  --outfile=dist/index.js \
  --external:@opencode-ai/plugin \
  --external:@opencode-ai/sdk

tsc --emitDeclarationOnly --declaration --declarationMap --outDir dist
```

- [ ] **Step 2: Write scripts/deploy.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
OPENCODE_DIR="${HOME}/.config/opencode"

echo "Deploying opencode-sigil..."

mkdir -p "${OPENCODE_DIR}/plugins" "${OPENCODE_DIR}/skills"

ln -sf "${PLUGIN_DIR}/dist/index.js" "${OPENCODE_DIR}/plugins/opencode-sigil.js"
echo "  [link] opencode-sigil.js"

if [ -d "${PLUGIN_DIR}/skills/sigil" ]; then
  rm -rf "${OPENCODE_DIR}/skills/sigil"
  cp -R "${PLUGIN_DIR}/skills/sigil" "${OPENCODE_DIR}/skills/sigil"
  echo "  [copy] sigil skill"
fi

echo "Done. Restart OpenCode to pick up changes."
```

- [ ] **Step 3: Make scripts executable**

```bash
chmod +x scripts/build.sh scripts/deploy.sh
```

---

## Task 7: Build, test, and commit the new plugin

- [ ] **Step 1: Run full build**

```bash
cd $TGT && npm run build
```

Expected: typecheck passes, esbuild produces `dist/index.js`, declarations emitted to `dist/`

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: 27 tests PASS (15 redact + 12 mappers)

- [ ] **Step 3: Verify dist output**

```bash
ls -la dist/index.js dist/index.d.ts
```

Expected: both files exist

- [ ] **Step 4: Commit everything in the new plugin repo**

```bash
cd $TGT
git add package.json tsconfig.json vitest.config.ts .gitignore \
       vendor/ skills/ scripts/ src/
git commit -m "feat: initial opencode-sigil plugin (extracted from tw-opencode-plugin)"
```

---

## Task 8: Remove sigil from tw-opencode-plugin

**Files:**
- Delete: `src/sigil/`, `skills/sigil/`, `vendor/grafana-sigil-sdk-js-0.1.0.tgz`
- Modify: `src/index.ts`, `src/shared/config.ts`, `package.json`

- [ ] **Step 1: Delete sigil source, skills, and vendor tarball**

```bash
cd $SRC
rm -rf src/sigil/ skills/sigil/ vendor/grafana-sigil-sdk-js-0.1.0.tgz
```

- [ ] **Step 2: Update src/index.ts**

Remove by content pattern (do NOT rely on line numbers):
- Remove the `import { loadPluginConfig } from "./shared/config.js"` line
- Remove the `import { createSigilHooks } from "./sigil/index.js"` line
- Remove the `const pluginConfig = await loadPluginConfig()` line
- Remove the `const sigilHooks = await createSigilHooks(...)` block (the call that passes `pluginConfig.sigil`)
- In the `"chat.message"` hook, remove the `sigilHooks?.chatMessage?.(_input, output)` call. The hook body becomes just `await beads.handleChatMessage(_input, output)`
- In the `event` hook, remove the `await sigilHooks?.event?.(...)` call at the end of the function (after the switch statement)

Keep `import type { EventSessionCompacted } from "@opencode-ai/sdk"` -- it's used by the beads compaction handler.

- [ ] **Step 3: Update src/shared/config.ts**

Remove by content pattern:
- Remove the `SigilAuthConfig` type definition
- Remove the `SigilConfig` type definition
- Remove the `sigil?: SigilConfig` field from the `PluginConfig` type
- Remove the `parseSigilConfig()` function
- In `loadPluginConfig()`, remove `sigil: parseSigilConfig(parsed?.sigil)` from the return object

- [ ] **Step 4: Update package.json**

Remove `"@grafana/sigil-sdk-js": "file:vendor/grafana-sigil-sdk-js-0.1.0.tgz"` from the `dependencies` object.

- [ ] **Step 5: Reinstall and verify**

```bash
cd $SRC
npm install
npm run typecheck   # Expected: PASS
npm test            # Expected: PASS (sigil tests gone, remaining tests pass)
npm run build       # Expected: PASS
```

- [ ] **Step 6: Commit**

```bash
cd $SRC
git add src/index.ts src/shared/config.ts package.json package-lock.json
git rm -r src/sigil/ skills/sigil/ vendor/grafana-sigil-sdk-js-0.1.0.tgz
git commit -m "refactor: remove sigil integration (extracted to opencode-sigil plugin)"
```

---

## Task 9: Deploy and verify both plugins

- [ ] **Step 1: Deploy the new sigil plugin**

```bash
cd $TGT && npm run deploy
```

Expected: symlink at `~/.config/opencode/plugins/opencode-sigil.js`, sigil skill copied

- [ ] **Step 2: Deploy the updated tw-opencode-plugin**

```bash
cd $SRC && npm run deploy
```

Expected: deploys without the sigil skill

- [ ] **Step 3: Verify plugin files exist**

```bash
ls -la ~/.config/opencode/plugins/opencode-sigil.js
ls -la ~/.config/opencode/plugins/tw-opencode-plugin.js
ls -d ~/.config/opencode/skills/sigil
```

Expected: all three exist

**Post-extraction note:** The user must manually create `~/.config/opencode/opencode-sigil.json` by copying the `sigil` block from `~/.config/opencode/tw-plugin.json` and promoting it to a top-level JSON object. Remove the `sigil` key from `tw-plugin.json` afterward.
