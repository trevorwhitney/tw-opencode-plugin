# Sigil Plugin Extraction Design

## Goal

Extract the Sigil AI telemetry integration from `tw-opencode-plugin` into a standalone OpenCode plugin (`opencode-sigil`) that registers its own hooks, owns its config, and can be installed independently via the `plugin` config block or a local deploy script.

## Context

The Sigil integration in `tw-opencode-plugin` records every AI generation (LLM call) during OpenCode sessions and exports them to a Sigil backend for analytics, cost tracking, and prompt analysis. It currently lives as a subdirectory (`src/sigil/`) within the larger personal plugin, which also contains review pipeline, beads task tracking, and workmux integrations.

Extracting Sigil into its own plugin:
- Enables installation by anyone, not just users of `tw-opencode-plugin`
- Allows eventual publishing under `@grafana` on npm
- Cleanly separates concerns -- Sigil telemetry has no dependency on the other features

## Architecture

The new plugin is a standalone OpenCode plugin that directly registers `chat.message` and `event` hooks with OpenCode. It reads its own config file (`~/.config/opencode/opencode-sigil.json`), creates a `SigilClient` from the vendored SDK (bundled into the output via esbuild), and records generations using the same two-phase pattern as today. `tw-opencode-plugin` removes all Sigil code and has no dependency on the new plugin.

## Tech Stack

- TypeScript (ES2022, ESM)
- `@opencode-ai/plugin` (peer dependency, provided by OpenCode runtime)
- `@opencode-ai/sdk` (types only, externalized by esbuild, provided by OpenCode runtime at install time)
- `@grafana/sigil-sdk-js` v0.1.0 (vendored tarball, bundled into dist via esbuild)
- esbuild (bundler -- produces single self-contained output)
- vitest (testing)

---

## New Plugin: `opencode-sigil`

### Repository

`~/workspace/opencode-sigil/opencode-sigil` (git repo already initialized)

### Directory Structure

```
opencode-sigil/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── scripts/
│   ├── build.sh              # tsc --noEmit + esbuild bundle
│   └── deploy.sh             # Symlink into ~/.config/opencode/plugins/ (local dev)
├── vendor/
│   └── grafana-sigil-sdk-js-0.1.0.tgz
├── skills/
│   └── sigil/SKILL.md
└── src/
    ├── index.ts              # Plugin entry point
    ├── config.ts             # Config types + loader
    ├── client.ts             # SigilClient factory
    ├── hooks.ts              # Event handlers (two-phase recording)
    ├── mappers.ts            # OpenCode -> Sigil type mappers
    ├── mappers.test.ts
    ├── redact.ts             # Secret redaction engine
    └── redact.test.ts
```

### package.json

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
  "dependencies": {},
  "devDependencies": {
    "@grafana/sigil-sdk-js": "file:vendor/grafana-sigil-sdk-js-0.1.0.tgz",
    "@opencode-ai/plugin": "^1.2.16",
    "@opencode-ai/sdk": "^0.0.1",
    "@types/node": "^22.13.9",
    "esbuild": "^0.25.0",
    "typescript": "^5.8.2",
    "vitest": "^4.0.18"
  }
}
```

Key decisions:
- `@grafana/sigil-sdk-js` is a **devDependency** only -- esbuild bundles it into the output
- `@opencode-ai/plugin` is both a peerDep (for consumers) and devDep (for local development)
- `files` includes `skills/` so deploy scripts can copy the skill definition
- No runtime `dependencies` -- the bundle is self-contained

### Build (`scripts/build.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Type-check
tsc --noEmit

# Bundle for distribution -- single ESM file with SDK inlined
# External: @opencode-ai/plugin and @opencode-ai/sdk (provided by OpenCode runtime)
npx esbuild src/index.ts \
  --bundle \
  --format=esm \
  --platform=node \
  --target=es2022 \
  --outfile=dist/index.js \
  --external:@opencode-ai/plugin \
  --external:@opencode-ai/sdk

# Generate declaration files
tsc --emitDeclarationOnly --declaration --declarationMap --outDir dist
```

### Deploy (`scripts/deploy.sh`)

For local development before npm publishing:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
OPENCODE_DIR="${HOME}/.config/opencode"
PLUGINS_TARGET="${OPENCODE_DIR}/plugins"
SKILLS_TARGET="${OPENCODE_DIR}/skills"

echo "Deploying opencode-sigil..."

# Plugin JS
mkdir -p "$PLUGINS_TARGET"
ln -sf "${PLUGIN_DIR}/dist/index.js" "${PLUGINS_TARGET}/opencode-sigil.js"
echo "  [link] opencode-sigil.js"

# Skill
mkdir -p "$SKILLS_TARGET"
if [ -d "${PLUGIN_DIR}/skills/sigil" ]; then
  rm -rf "${SKILLS_TARGET}/sigil"
  cp -R "${PLUGIN_DIR}/skills/sigil" "${SKILLS_TARGET}/sigil"
  echo "  [copy] sigil skill"
fi

echo "Done. Restart OpenCode to pick up changes."
```

### Plugin Entry Point (`src/index.ts`)

```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { loadSigilConfig } from "./config.js";
import { createSigilHooks, type SigilHooks } from "./hooks.js";

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

When disabled or misconfigured, returns empty hooks object -- complete no-op.

### Config (`src/config.ts`)

Reads `~/.config/opencode/opencode-sigil.json`. Consolidates all config types previously split across `src/shared/config.ts` and `src/sigil/index.ts`:

```typescript
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export type SigilAuthConfig =
  | { mode: "bearer"; bearerToken: string }
  | { mode: "tenant"; tenantId: string }
  | { mode: "basic"; tenantId: string; token: string }
  | { mode: "none" };

export type SigilConfig = {
  enabled: boolean;
  endpoint: string;
  auth: SigilAuthConfig;
  agentName?: string;
  agentVersion?: string;
  contentCapture?: boolean;
};

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

export function parseSigilConfig(raw: unknown): SigilConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.enabled !== true) return undefined;
  if (typeof obj.endpoint !== "string" || !obj.endpoint) {
    console.warn("[sigil] enabled but endpoint is missing -- disabling");
    return undefined;
  }
  if (!obj.auth || typeof obj.auth !== "object") {
    console.warn("[sigil] enabled but auth config is missing -- disabling");
    return undefined;
  }
  return raw as SigilConfig;
}
```

### Hooks (`src/hooks.ts`)

Combines the current `src/sigil/index.ts` (the `createSigilHooks` factory) and `src/sigil/hooks.ts` (the handlers). The `SigilHooks` type becomes internal to this module (not exported from the plugin's public API). Import path changes:
- `SigilConfig` import: `../shared/config.js` -> `./config.js`
- `PluginInput` import: unchanged (from `@opencode-ai/plugin`)
- `UserMessage`, `Part` imports: unchanged (from `@opencode-ai/sdk`)
- `createSigilClient` import: unchanged (`./client.js`)
- `Redactor` import: unchanged (`./redact.js`)
- `handleEvent`, `handleLifecycle`, `handleChatMessage`: these are defined in the same file now (no import needed)

### Other Source Files

Moved with import path adjustments noted:
- **`client.ts`**: Both `SigilConfig` and `SigilAuthConfig` imports change from `../shared/config.js` to `./config.js`
- **`mappers.ts`**: No changes (imports from `@opencode-ai/sdk` and `@grafana/sigil-sdk-js` unchanged)
- **`redact.ts`**: No changes (no external imports)
- **`mappers.test.ts`**: No changes
- **`redact.test.ts`**: No changes

---

## Changes to `tw-opencode-plugin`

### Files to Delete

- `src/sigil/` (entire directory -- index.ts, client.ts, hooks.ts, mappers.ts, mappers.test.ts, redact.ts, redact.test.ts)
- `skills/sigil/` (entire directory)
- `vendor/grafana-sigil-sdk-js-0.1.0.tgz`

### Files to Modify

**`src/index.ts`**:
- Remove `import { createSigilHooks } from "./sigil/index.js"`
- Remove `import { loadPluginConfig } from "./shared/config.js"` -- `pluginConfig` was only used for sigil; the review pipeline loads its own config via `loadReviewConfig()` which calls `loadPluginConfig()` internally
- Keep `import type { EventSessionCompacted } from "@opencode-ai/sdk"` -- it is used by the beads compaction handler at line 112
- Remove `const pluginConfig = await loadPluginConfig()` and `const sigilHooks = await createSigilHooks(...)` initialization
- Remove `sigilHooks?.chatMessage?.(_input, output)` from `chat.message` hook
- Remove `await sigilHooks?.event?.(...)` from `event` hook
- The `chat.message` hook body simplifies to just `await beads.handleChatMessage(_input, output)`

**`src/shared/config.ts`**:
- Remove `SigilAuthConfig` type
- Remove `SigilConfig` type
- Remove `sigil?: SigilConfig` from `PluginConfig`
- Remove `parseSigilConfig()` function
- Remove `sigil: parseSigilConfig(parsed?.sigil)` from `loadPluginConfig()`

**`package.json`**:
- Remove `@grafana/sigil-sdk-js` from `dependencies`

**`scripts/deploy.sh`**:
- No changes needed. The generic `for skill_dir in "${PLUGIN_DIR}/skills"/*/` loop will naturally stop deploying the sigil skill once `skills/sigil/` is deleted.

---

## Installation

### Local Development (before npm publish)

1. Build: `cd ~/workspace/opencode-sigil/opencode-sigil && npm run build`
2. Deploy: `npm run deploy` (symlinks into `~/.config/opencode/plugins/`)
3. Create config: `~/.config/opencode/opencode-sigil.json`
4. Restart OpenCode

### Via npm (after publishing as `@grafana/opencode-sigil`)

Add to `opencode.json`:
```json
{
  "plugin": ["@grafana/opencode-sigil"]
}
```

Create config file `~/.config/opencode/opencode-sigil.json`:
```json
{
  "enabled": true,
  "endpoint": "https://your-sigil-endpoint/api/v1/generations:export",
  "auth": { "mode": "bearer", "bearerToken": "${SIGIL_API_TOKEN}" },
  "agentName": "opencode",
  "agentVersion": "0.1.0",
  "contentCapture": true
}
```

---

## Verification

After extraction, run these commands to confirm both plugins work:

```bash
# New plugin
cd ~/workspace/opencode-sigil/opencode-sigil
npm install
npm run build    # tsc --noEmit + esbuild bundle
npm test         # vitest run (mappers + redact tests)

# Old plugin (sigil removed)
cd ~/workspace/tw-opencode-plugin/tw-opencode-plugin
npm install
npm run typecheck  # tsc --noEmit (should pass with no sigil references)
npm test           # vitest run (remaining tests, if any)
npm run build      # full build
```

## Testing

All existing tests (`mappers.test.ts`, `redact.test.ts`) move to the new plugin unchanged. Run with `vitest run`. No integration test changes needed -- the tests are unit tests that don't depend on the plugin framework.

## Notes

- **Environment variable interpolation**: Auth config values support `${VAR_NAME}` syntax (e.g., `"token": "${SIGIL_API_TOKEN}"`). This is handled by `resolveEnvVars()` in `client.ts`, which expands env vars at client initialization time. This function moves as-is.
- **Skills**: `skills/sigil/SKILL.md` moves as-is. It references Sigil SDK paths and patterns that are generic to Sigil instrumentation, not specific to the plugin location.

## Migration Risk

Low. The sigil code is cleanly isolated:
- No other code in `tw-opencode-plugin` imports from `src/sigil/`
- The sigil code's only dependency on the parent plugin is the config types in `src/shared/config.ts`, which are being moved
- The two hook points (`chat.message` and `event`) are additive -- removing them from `tw-opencode-plugin` doesn't affect other hook logic
