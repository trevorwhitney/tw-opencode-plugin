# Dual-Reviewer Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Add `/code-review` and `/plan-review` commands to tw-opencode-plugin that orchestrate a 3-phase dual-reviewer pipeline using the OpenCode SDK.

**Architecture:** The plugin intercepts commands via `command.execute.before`, creates child sessions for two reviewer agents, runs them through parallel independent reviews then parallel cross-reviews, and injects a synthesis prompt back into the main session.

**Tech Stack:** TypeScript, `@opencode-ai/plugin` SDK, ESM (ES2022 target)

---

### Task 1: Create the types module

**Files:**
- Create: `src/review/types.ts`

**Reuse:** None -- greenfield.

**Step 1: Create the types file**

```typescript
// src/review/types.ts

export type ReviewConfig = {
  agentA: string;
  agentB: string;
};

export type PromptSet = {
  round1A: (target: string) => string;
  round1B: (target: string) => string;
  round2A: (round1A: string, round1B: string) => string;
  round2B: (round1A: string, round1B: string) => string;
  synthesis: (r1a: string, r1b: string, r2a: string, r2b: string) => string;
};

export type PhaseResult = {
  text: string;
  error?: string;
};

export type PipelineResults = {
  round1A: PhaseResult;
  round1B: PhaseResult;
  round2A: PhaseResult;
  round2B: PhaseResult;
};
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
git add src/review/types.ts
git commit -m "feat(review): add types for dual-reviewer pipeline"
```

---

### Task 2: Create the config module

**Files:**
- Create: `src/review/config.ts`

**Reuse:** None -- greenfield.

**Step 1: Create the config file**

This reads agent configuration from `~/.config/opencode/tw-plugin.json`. Falls back to defaults if the file doesn't exist or is malformed.

```typescript
// src/review/config.ts
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { ReviewConfig } from "./types.js";

const CONFIG_PATH = join(homedir(), ".config", "opencode", "tw-plugin.json");

const DEFAULTS: ReviewConfig = {
  agentA: "critic-codex",
  agentB: "critic-opus",
};

export async function loadReviewConfig(): Promise<ReviewConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      agentA: parsed?.review?.agentA ?? DEFAULTS.agentA,
      agentB: parsed?.review?.agentB ?? DEFAULTS.agentB,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
git add src/review/config.ts
git commit -m "feat(review): add config loader with agent defaults"
```

---

### Task 3: Create shared prompt fragments

**Files:**
- Create: `src/review/prompts/shared.ts`

**Reuse:** None -- greenfield.

**Step 1: Create shared prompt fragments**

These are the discussion rules and verification instructions shared across code-review and plan-review Round 2 prompts.

```typescript
// src/review/prompts/shared.ts

export const DISCUSSION_RULES = `\
Before agreeing or conceding, verify the claim against actual code. \
No performative agreement -- don't say things like "great point" or \
"you're absolutely right." If you change your mind, state what you \
checked and why you were wrong. If the other reviewer is wrong, show \
the code that proves it.`;

export const CROSS_REVIEW_INSTRUCTIONS_A = `\
Respond as a peer:
- Where do you agree with Reviewer B?
- Where do you disagree, and why? Provide evidence (file paths, line numbers, code).
- Did Reviewer B catch something you missed? Acknowledge it.
- Did they miss something important? Point it out.
- Where severity assessments differ, explain your reasoning.

The goal is accuracy, not winning. Re-read the code if needed.

${DISCUSSION_RULES}`;

export const CROSS_REVIEW_INSTRUCTIONS_B = `\
Respond as a peer:
- Where do you agree with Reviewer A?
- Where do you disagree, and why? Provide evidence (file paths, line numbers, code).
- Did Reviewer A catch something you missed? Acknowledge it.
- Did they miss something important? Point it out.
- Where severity assessments differ, explain your reasoning.

The goal is accuracy, not winning. Re-read the code if needed.

${DISCUSSION_RULES}`;
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
git add src/review/prompts/shared.ts
git commit -m "feat(review): add shared prompt fragments for discussion rules"
```

---

### Task 4: Create code-review prompts

**Files:**
- Create: `src/review/prompts/code-review.ts`

**Reuse:** `src/review/prompts/shared.ts` -- import `CROSS_REVIEW_INSTRUCTIONS_A`, `CROSS_REVIEW_INSTRUCTIONS_B`

**Step 1: Create the code-review prompts file**

This embeds the full code review instructions (from `code-review-instructions.md`) and exports a `PromptSet`.

The file is long because it contains the full review instructions. The structure is:
- `CODE_REVIEW_INSTRUCTIONS` constant -- the full instructions document
- Five exported prompt builder functions assembled into a `PromptSet`

Embed the full content of `/Users/twhitney/.config/opencode/command/code-review-instructions.md` (98 lines) as the `CODE_REVIEW_INSTRUCTIONS` constant. Then build the 5 prompt functions:

- `round1A(target)` / `round1B(target)`: "You are Reviewer A/B..." + instructions + review target
- `round2A(r1a, r1b)` / `round2B(r1a, r1b)`: "You are Reviewer A/B. You and another engineer..." + both reviews + cross-review instructions from shared.ts
- `synthesis(r1a, r1b, r2a, r2b)`: "You have the complete conversation..." + all 4 results + synthesis instructions

Import `PromptSet` from `../types.js` and export `codeReviewPrompts: PromptSet`.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
git add src/review/prompts/code-review.ts
git commit -m "feat(review): add code-review prompt templates"
```

---

### Task 5: Create plan-review prompts

**Files:**
- Create: `src/review/prompts/plan-review.ts`

**Reuse:** `src/review/prompts/shared.ts` -- import shared fragments (adapt discussion rules for plan context)

**Step 1: Create the plan-review prompts file**

Same structure as code-review but with plan-focused instructions. Pull the plan review focus areas from the existing `plan-review.md` command file (bloat, scope creep, YAGNI, complexity, missing steps, ordering, verification gaps, risk, feasibility, duplication/reuse).

Key differences from code-review:
- Round 1: "Critic" instead of "Reviewer", plan-specific focus areas, bias toward removing things
- Round 2: Same cross-review structure but references plan sections instead of code
- Synthesis: Includes "Part 2: Revised Plan" section

Import `PromptSet` from `../types.js` and export `planReviewPrompts: PromptSet`.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
git add src/review/prompts/plan-review.ts
git commit -m "feat(review): add plan-review prompt templates"
```

---

### Task 6: Create the prompts barrel export

**Files:**
- Create: `src/review/prompts/index.ts`

**Step 1: Create the barrel export**

```typescript
// src/review/prompts/index.ts
export { codeReviewPrompts } from "./code-review.js";
export { planReviewPrompts } from "./plan-review.js";
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
git add src/review/prompts/index.ts
git commit -m "feat(review): add prompts barrel export"
```

---

### Task 7: Create the pipeline orchestrator

**Files:**
- Create: `src/review/pipeline.ts`

**Reuse:**
- `src/review/types.ts` -- `PromptSet`, `PhaseResult`, `ReviewConfig`
- `src/review/config.ts` -- `loadReviewConfig()`
- `src/review/prompts/index.ts` -- prompt sets

**Step 1: Create the pipeline file**

The pipeline has two functions:

`runSubagent(client, parentID, agent, prompt): Promise<PhaseResult>` -- Creates a child session, sends a synchronous prompt, extracts text from response parts. Wraps in try/catch to return error results instead of throwing.

`runReviewPipeline(client, sessionID, target, prompts, config): Promise<string>` -- Orchestrates the 3 phases:
1. `Promise.all` for Round 1 (A and B in parallel)
2. `Promise.all` for Round 2 (A and B in parallel, each receiving the other's Round 1)
3. Returns the synthesis prompt string with all 4 results injected

The `client` parameter type is `ReturnType<typeof createOpencodeClient>` from `@opencode-ai/sdk`. Import it as a type.

Key implementation details:
- `runSubagent` creates a session with `client.session.create({ body: { parentID } })`
- Sends prompt via `client.session.prompt({ path: { id }, body: { agent, parts: [{ type: "text", text: prompt }] } })`
- Extracts text by filtering response parts for `type === "text"` and joining
- Error handling: catch block returns `{ text: "", error: e.message }`, pipeline continues with partial results
- Synthesis prompt includes "[REVIEWER FAILED]" markers for any errored phases

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
git add src/review/pipeline.ts
git commit -m "feat(review): add pipeline orchestrator with parallel phases"
```

---

### Task 8: Wire up the command hook in index.ts

**Files:**
- Modify: `src/index.ts`

**Reuse:**
- `src/review/pipeline.ts` -- `runReviewPipeline()`
- `src/review/config.ts` -- `loadReviewConfig()`
- `src/review/prompts/index.ts` -- `codeReviewPrompts`, `planReviewPrompts`

**Step 1: Add the command.execute.before hook**

Modify the existing `TwOpenCodePlugin` to add a `"command.execute.before"` hook alongside the existing `event` hook. The hook:

1. Checks if `input.command` is `"code-review"` or `"plan-review"` -- returns early if not
2. Loads config via `loadReviewConfig()`
3. Selects the prompt set based on command name
4. Calls `runReviewPipeline(client, input.sessionID, input.arguments, promptSet, config)`
5. Sets `output.parts = [{ type: "text", text: synthesisPrompt }]`

The plugin function needs access to `client` from the plugin input, so destructure it alongside `$`.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
git add src/index.ts
git commit -m "feat(review): wire command hook for /code-review and /plan-review"
```

---

### Task 9: Build, deploy, and smoke test

**Files:**
- No new files

**Step 1: Build**

Run: `npm run build`
Expected: Clean compilation, `dist/` populated with all modules

**Step 2: Deploy**

Run: `npm run deploy`
Expected: `dist/index.js` symlinked to `~/.config/opencode/plugins/tw-opencode-plugin.js`

**Step 3: Verify file structure**

Run: `ls -la dist/`
Expected: `index.js`, `index.d.ts`, plus `review/` subdirectory with all modules

Run: `ls -la dist/review/`
Expected: `types.js`, `config.js`, `pipeline.js`, plus `prompts/` subdirectory

**Step 4: Commit (if any build adjustments were needed)**

```
git add -A
git commit -m "chore: build and verify deployment"
```

---

### Task 10: Remove old subtask2 command files

**Files:**
- Delete: `commands/code-review.md` (replaced by plugin logic)

**Reuse:** None

**Step 1: Remove the old command file**

The `/code-review` command is now handled by the plugin's `command.execute.before` hook. The old markdown command file would conflict. Remove it.

Note: Keep `~/.config/opencode/command/plan-review.md` removal for after we verify the plugin works. The deploy script copies commands from the `commands/` directory.

**Step 2: Check if there's a plan-review.md in the commands directory too**

If `commands/plan-review.md` exists, remove it as well.

**Step 3: Commit**

```
git add -A
git commit -m "chore: remove old subtask2 command files replaced by plugin"
```

---

### Notes

**No tests are included in this plan.** The project has no test infrastructure. The orchestration logic depends heavily on the OpenCode SDK client which would require mocking the entire session API. The best verification is a live smoke test.

**Deploy workflow:** Every commit triggers `scripts/deploy.sh` via the post-commit husky hook, which symlinks `dist/index.js` into `~/.config/opencode/plugins/`. However, the build step (`tsc`) is NOT automatic -- you must run `npm run build` before committing for changes to take effect.

**The `command.execute.before` hook is async.** The entire pipeline runs inside the hook before returning. This blocks the main session from processing the command until all subagents complete, which is the desired behavior.
