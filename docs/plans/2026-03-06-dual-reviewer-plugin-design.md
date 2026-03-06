# Dual-Reviewer Plugin Design

## Problem

The subtask2 plugin's orchestration of multi-agent code review workflows is unreliable: agents fire in wrong order, prompts get mangled, and sessions duplicate. We need a simple, deterministic orchestration that does exactly what we want.

## Solution

Add `/code-review` and `/plan-review` commands to the existing `tw-opencode-plugin`. The plugin intercepts these commands via the `command.execute.before` hook and runs a 3-phase review pipeline using the OpenCode SDK's synchronous session API.

## Pipeline

```
Phase 1: Independent Reviews (parallel)
  |-- Session A (agent-a) --> Round 1-A result
  |-- Session B (agent-b) --> Round 1-B result

Phase 2: Cross-Review (parallel, depends on Phase 1)
  |-- Session A sees Round 1-B --> Round 2-A result
  |-- Session B sees Round 1-A --> Round 2-B result

Phase 3: Synthesis (main session)
  |-- All 4 results injected as output.parts text
  |-- Main session LLM produces final report
```

Two parallel stages, then synthesis. No sequential dependencies between A and B within the same phase.

## File Structure

```
src/
  index.ts                  -- plugin entry, exports TwOpenCodePlugin
  review/
    pipeline.ts             -- runReviewPipeline() orchestrator
    prompts/
      code-review.ts        -- code review prompt builders
      plan-review.ts        -- plan review prompt builders
      shared.ts             -- shared prompt fragments (discussion rules, etc.)
    config.ts               -- agent config loading
    types.ts                -- ReviewResult, PromptSet, ReviewConfig types
```

## Key Design Decisions

### Command interception via `command.execute.before`

The hook receives `(input, output)` where `input` has `{ command, sessionID, arguments }` and `output` has `{ parts: Part[] }`. We run the full pipeline (async, blocking), then set `output.parts` to a single text part containing the synthesis prompt with all 4 round results inlined. The main session LLM then produces the final synthesis.

### Synchronous session API

We use `client.session.prompt()` which blocks until the LLM finishes. No event polling. `Promise.all([promptA, promptB])` gives us parallelism within each phase.

### Prompts as imports

Prompt templates live in dedicated files under `src/review/prompts/`. Each exports builder functions that accept the review target and prior results, returning a string. The pipeline code stays clean — it calls prompt functions, not string templates.

### Configurable agents

Agent names read from `~/.config/opencode/tw-plugin.json`:

```json
{
  "review": {
    "agentA": "critic-codex",
    "agentB": "critic-opus"
  }
}
```

Falls back to `critic-codex` / `critic-opus` if not configured.

### Embedded review instructions

Code review instructions (from `code-review-instructions.md`) and plan review instructions are embedded in the prompt files. No runtime file reads.

### Error handling

If a subagent session errors, the pipeline logs the error and continues. The synthesis prompt notes which reviewer failed. Partial results are still useful.

## Types

```typescript
type ReviewConfig = {
  agentA: string;
  agentB: string;
};

type PromptSet = {
  round1A: (target: string) => string;
  round1B: (target: string) => string;
  round2A: (round1A: string, round1B: string) => string;
  round2B: (round1A: string, round1B: string) => string;
  synthesis: (r1a: string, r1b: string, r2a: string, r2b: string) => string;
};

type PhaseResult = {
  text: string;
  error?: string;
};

type PipelineResults = {
  round1A: PhaseResult;
  round1B: PhaseResult;
  round2A: PhaseResult;
  round2B: PhaseResult;
};
```

## Pipeline Pseudocode

```typescript
async function runReviewPipeline(
  client: OpencodeClient,
  sessionID: string,
  target: string,
  prompts: PromptSet,
  config: ReviewConfig,
): Promise<string> {
  // Phase 1: parallel independent reviews
  const [r1a, r1b] = await Promise.all([
    runSubagent(client, sessionID, config.agentA, prompts.round1A(target)),
    runSubagent(client, sessionID, config.agentB, prompts.round1B(target)),
  ]);

  // Phase 2: parallel cross-reviews
  const [r2a, r2b] = await Promise.all([
    runSubagent(client, sessionID, config.agentA, prompts.round2A(r1a.text, r1b.text)),
    runSubagent(client, sessionID, config.agentB, prompts.round2B(r1a.text, r1b.text)),
  ]);

  // Phase 3: build synthesis prompt
  return prompts.synthesis(r1a.text, r1b.text, r2a.text, r2b.text);
}

async function runSubagent(
  client: OpencodeClient,
  parentID: string,
  agent: string,
  prompt: string,
): Promise<PhaseResult> {
  const session = await client.session.create({
    body: { parentID },
  });
  const result = await client.session.prompt({
    path: { id: session.data.id },
    body: {
      agent,
      parts: [{ type: "text", text: prompt }],
    },
  });
  // Extract text from response parts
  const text = result.data.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n");
  return { text };
}
```
