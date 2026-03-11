# Sigil Content Capture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Send rich conversation data to Sigil with client-side secret redaction, enabling agent versioning, evaluation, and debugging.

**Architecture:** A `chat.message` hook eagerly captures user-side data (system prompt, user text, tool names). When an assistant message completes, the plugin fetches full assistant parts via REST, runs hybrid redaction (full on tool content, lightweight on assistant text), and records via the Sigil SDK. The `contentCapture` config toggle strips content at the SDK call boundary when disabled.

**Tech Stack:** TypeScript, Vitest (new), ~20 hand-curated secret patterns (sourced from Gitleaks), @grafana/sigil-sdk-js, @opencode-ai/sdk

**Design spec:** `docs/plans/2026-03-11-sigil-content-capture-design.md`

---

### Task 0: Set up Vitest test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

**Reuse:** None — no test infrastructure exists. Vitest chosen to match the Sigil SDK's own test setup.

**Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

**Step 2: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 3: Add test script to package.json**

Add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Run vitest to verify setup**

Run: `npx vitest run`
Expected: 0 test files found, clean exit

**Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest test infrastructure"
```

---

### Task 1: Add `contentCapture` config field

**Files:**
- Modify: `src/shared/config.ts:11-17`

**Reuse:** Follow the existing `SigilConfig` type pattern with optional fields.

**Step 1: Add the field to SigilConfig**

In `src/shared/config.ts`, add `contentCapture` to the `SigilConfig` type:

```typescript
export type SigilConfig = {
  enabled: boolean;
  endpoint: string;
  auth: SigilAuthConfig;
  agentName?: string;
  agentVersion?: string;
  contentCapture?: boolean; // default: true
};
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/shared/config.ts
git commit -m "feat(sigil): add contentCapture config option"
```

---

### Task 2: Build the redaction engine

**Files:**
- Create: `src/sigil/redact.ts`
- Create: `src/sigil/redact.test.ts`

**Reuse:** None — greenfield. Patterns hand-curated from [Gitleaks gitleaks.toml](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml).

Start with ~20 high-confidence patterns covering the credential types the user actually encounters. More patterns can be added later when concrete misses appear. **No entropy detection** — too many false positives on AI conversation text (base64 content, hashes, long identifiers).

**Step 1: Write the failing test for the Redactor**

Create `src/sigil/redact.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Redactor } from "./redact.js";

describe("Redactor", () => {
  const redactor = new Redactor();

  describe("redact (full — tier 1 + tier 2)", () => {
    it("redacts Grafana Cloud tokens", () => {
      const input = "token: glc_abcdefghijklmnopqrstuvwxyz1234";
      const result = redactor.redact(input);
      expect(result).not.toContain("glc_abcdefghijklmnopqrstuvwxyz1234");
      expect(result).toContain("[REDACTED:");
    });

    it("redacts Grafana service account tokens", () => {
      const input = "glsa_abcdefghijklmnopqrstuvwxyz1234";
      const result = redactor.redact(input);
      expect(result).not.toContain("glsa_");
      expect(result).toContain("[REDACTED:");
    });

    it("redacts AWS access keys", () => {
      const input = "aws_access_key_id = AKIAIOSFODNN7REALKEY";
      const result = redactor.redact(input);
      expect(result).not.toContain("AKIAIOSFODNN7REALKEY");
      expect(result).toContain("[REDACTED:");
    });

    it("redacts GitHub personal access tokens", () => {
      const input = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
      const result = redactor.redact(input);
      expect(result).not.toContain("ghp_");
      expect(result).toContain("[REDACTED:");
    });

    it("redacts PEM private keys", () => {
      const input = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy5AhEiS0C5
-----END RSA PRIVATE KEY-----`;
      const result = redactor.redact(input);
      expect(result).not.toContain("MIIEpAIBAAKCAQ");
      expect(result).toContain("[REDACTED:");
    });

    it("redacts connection strings with passwords", () => {
      const input = "postgres://admin:s3cretP4ss@db.example.com:5432/mydb";
      const result = redactor.redact(input);
      expect(result).not.toContain("s3cretP4ss");
      expect(result).toContain("[REDACTED:");
    });

    it("redacts Anthropic API keys", () => {
      const input = "sk-ant-api03-" + "a".repeat(93) + "AA";
      const result = redactor.redact(input);
      expect(result).not.toContain("sk-ant-api03-");
      expect(result).toContain("[REDACTED:");
    });

    it("redacts env file secret values (tier 2)", () => {
      const input = "DATABASE_PASSWORD=hunter2secret123";
      const result = redactor.redact(input);
      expect(result).toContain("DATABASE_PASSWORD=");
      expect(result).not.toContain("hunter2secret123");
      expect(result).toContain("[REDACTED:");
    });

    it("redacts bearer tokens in headers", () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = redactor.redact(input);
      expect(result).toContain("[REDACTED:");
    });

    it("does NOT redact normal text", () => {
      const input = "The function returns a list of users from the database.";
      expect(redactor.redact(input)).toBe(input);
    });

    it("does NOT redact UUIDs", () => {
      const input = "session-id: 550e8400-e29b-41d4-a716-446655440000";
      expect(redactor.redact(input)).toBe(input);
    });

    it("handles empty string", () => {
      expect(redactor.redact("")).toBe("");
    });

    it("handles multiple secrets in one string", () => {
      const input = "key=AKIAIOSFODNN7REALKEY token=glc_abcdefghijklmnopqrstuvwxyz1234";
      const result = redactor.redact(input);
      expect(result).not.toContain("AKIAIOSFODNN7REALKEY");
      expect(result).not.toContain("glc_abcdefghijklmnopqrstuvwxyz1234");
    });
  });

  describe("redactLightweight (tier 1 only)", () => {
    it("redacts Grafana Cloud tokens", () => {
      const input = "I found the token: glc_abcdefghijklmnopqrstuvwxyz1234";
      const result = redactor.redactLightweight(input);
      expect(result).not.toContain("glc_abcdefghijklmnopqrstuvwxyz1234");
      expect(result).toContain("[REDACTED:");
    });

    it("does NOT redact env file patterns (tier 2 only)", () => {
      const input = "The file contains DATABASE_PASSWORD=hunter2secret123";
      const result = redactor.redactLightweight(input);
      expect(result).toContain("hunter2secret123");
    });

    it("does NOT redact normal text", () => {
      const input = "The API key configuration is stored in the settings panel.";
      expect(redactor.redactLightweight(input)).toBe(input);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sigil/redact.test.ts`
Expected: FAIL — module `./redact.js` not found

**Step 3: Implement the Redactor**

Create `src/sigil/redact.ts`:

```typescript
/**
 * Secret redaction engine for Sigil content capture.
 *
 * ~20 high-confidence patterns hand-curated from Gitleaks
 * (https://github.com/gitleaks/gitleaks). Two tiers:
 *   - Tier 1: definite secret formats — used by both redact() and redactLightweight()
 *   - Tier 2: heuristic env patterns — used only by redact()
 *
 * Add more patterns when concrete unredacted secrets are observed.
 */

interface SecretPattern {
  id: string;
  regex: RegExp;
  tier: 1 | 2;
}

// --- Tier 1: High-confidence patterns (definite secret formats) ---
const TIER1_PATTERNS: SecretPattern[] = [
  // Grafana
  { id: "grafana-cloud-token", regex: /\bglc_[A-Za-z0-9_-]{20,}/g, tier: 1 },
  { id: "grafana-service-account-token", regex: /\bglsa_[A-Za-z0-9_-]{20,}/g, tier: 1 },
  // AWS
  { id: "aws-access-token", regex: /\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/g, tier: 1 },
  // GitHub
  { id: "github-pat", regex: /\bghp_[A-Za-z0-9_]{36,}/g, tier: 1 },
  { id: "github-oauth", regex: /\bgho_[A-Za-z0-9_]{36,}/g, tier: 1 },
  { id: "github-app-token", regex: /\bghs_[A-Za-z0-9_]{36,}/g, tier: 1 },
  { id: "github-fine-grained-pat", regex: /\bgithub_pat_[A-Za-z0-9_]{82}/g, tier: 1 },
  // Anthropic
  { id: "anthropic-api-key", regex: /\bsk-ant-api03-[a-zA-Z0-9_-]{93}AA/g, tier: 1 },
  { id: "anthropic-admin-key", regex: /\bsk-ant-admin01-[a-zA-Z0-9_-]{93}AA/g, tier: 1 },
  // OpenAI
  { id: "openai-api-key", regex: /\bsk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20}/g, tier: 1 },
  // GCP
  { id: "gcp-api-key", regex: /\bAIza[A-Za-z0-9_-]{35}/g, tier: 1 },
  // PEM private keys
  { id: "private-key", regex: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g, tier: 1 },
  // Connection strings with embedded credentials
  { id: "connection-string", regex: /(?:postgres|mysql|mongodb|redis|amqp):\/\/[^\s'"]+@[^\s'"]+/g, tier: 1 },
  // Bearer tokens in Authorization headers
  { id: "bearer-token", regex: /[Bb]earer\s+[A-Za-z0-9_.\-~+/]{20,}={0,3}/g, tier: 1 },
  // Slack tokens
  { id: "slack-token", regex: /\bxox[bporas]-[A-Za-z0-9-]{10,}/g, tier: 1 },
  // Stripe keys
  { id: "stripe-key", regex: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}/g, tier: 1 },
  // SendGrid
  { id: "sendgrid-api-key", regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, tier: 1 },
  // Twilio
  { id: "twilio-api-key", regex: /\bSK[a-f0-9]{32}/g, tier: 1 },
  // npm tokens
  { id: "npm-token", regex: /\bnpm_[A-Za-z0-9]{36}/g, tier: 1 },
  // PyPI tokens
  { id: "pypi-token", regex: /\bpypi-[A-Za-z0-9_-]{50,}/g, tier: 1 },
];

// --- Tier 2: Heuristic patterns (env file values) ---
const TIER2_PATTERNS: SecretPattern[] = [
  {
    id: "env-secret-value",
    regex: /(?<=(?:PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL|API_KEY|PRIVATE_KEY|ACCESS_KEY)\s*[=:]\s*)\S+/gi,
    tier: 2,
  },
];

export class Redactor {
  private tier1 = TIER1_PATTERNS;
  private tier2 = TIER2_PATTERNS;

  /** Full redaction: tier 1 + tier 2. Use for tool call args and tool results. */
  redact(text: string): string {
    let result = text;
    for (const pattern of this.tier1) {
      pattern.regex.lastIndex = 0;
      result = result.replace(pattern.regex, `[REDACTED:${pattern.id}]`);
    }
    for (const pattern of this.tier2) {
      pattern.regex.lastIndex = 0;
      result = result.replace(pattern.regex, `[REDACTED:${pattern.id}]`);
    }
    return result;
  }

  /** Lightweight redaction: tier 1 only. Use for assistant text and reasoning. */
  redactLightweight(text: string): string {
    let result = text;
    for (const pattern of this.tier1) {
      pattern.regex.lastIndex = 0;
      result = result.replace(pattern.regex, `[REDACTED:${pattern.id}]`);
    }
    return result;
  }
}
```

**Important notes:**
- All regexes use the `g` flag since `String.replace` without `g` only replaces the first match.
- Reset `lastIndex` before each `replace` call — stateful `g`-flagged regexes retain position between calls.
- The `env-secret-value` pattern uses lookbehind (`(?<=...)`) which is supported in ES2018+ (our target is ES2022).
- More patterns can be added to `TIER1_PATTERNS` from the Gitleaks rule set as needs arise.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sigil/redact.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/sigil/redact.ts src/sigil/redact.test.ts
git commit -m "feat(sigil): add secret redaction engine with curated patterns"
```

---

### Task 3: Update mappers for content capture

**Files:**
- Modify: `src/sigil/mappers.ts`
- Create: `src/sigil/mappers.test.ts`

**Reuse:**
- Existing `mapGeneration()` and `mapError()` in `src/sigil/mappers.ts` — extend, don't replace
- SDK types: `Message`, `MessagePart`, `ToolCallPart`, `ToolResultPart`, `ToolDefinition`, `GenerationResult` from `@grafana/sigil-sdk-js`
- opencode types: `Part` from `@opencode-ai/sdk`
- `src/sigil/redact.ts:Redactor` — from Task 2

**Step 1: Write the failing test**

Create `src/sigil/mappers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mapGeneration, mapInputMessages, mapOutputMessages, mapToolDefinitions } from "./mappers.js";
import { Redactor } from "./redact.js";
import type { AssistantMessage, Part } from "@opencode-ai/sdk";

const redactor = new Redactor();

function makeAssistantMsg(overrides?: Partial<AssistantMessage>): AssistantMessage {
  return {
    id: "msg-1",
    sessionID: "sess-1",
    role: "assistant",
    parentID: "parent-1",
    modelID: "claude-opus-4-20250514",
    providerID: "anthropic",
    mode: "code",
    path: { cwd: "/tmp", root: "/tmp" },
    cost: 0.01,
    tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 5, write: 3 } },
    time: { created: Date.now(), completed: Date.now() + 1000 },
    finish: "end_turn",
    ...overrides,
  } as AssistantMessage;
}

describe("mapInputMessages", () => {
  it("maps TextParts to Sigil user messages", () => {
    const parts = [
      { id: "p1", sessionID: "s1", messageID: "m1", type: "text" as const, text: "hello world" },
    ] as Part[];
    const result = mapInputMessages(parts);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].parts?.[0]).toEqual({ type: "text", text: "hello world" });
  });

  it("skips non-text parts", () => {
    const parts = [
      { id: "p1", sessionID: "s1", messageID: "m1", type: "file" as const, mime: "image/png", url: "..." },
    ] as Part[];
    expect(mapInputMessages(parts)).toHaveLength(0);
  });
});

describe("mapOutputMessages", () => {
  it("maps TextParts with lightweight redaction", () => {
    const parts = [
      { id: "p1", sessionID: "s1", messageID: "m1", type: "text" as const, text: "The result is 42" },
    ] as Part[];
    const result = mapOutputMessages(parts, redactor);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].parts?.[0]).toEqual({ type: "text", text: "The result is 42" });
  });

  it("redacts secrets in tool output but not in assistant text (lightweight)", () => {
    const secretToken = "glc_abcdefghijklmnopqrstuvwxyz1234";
    const textParts = [
      { id: "p1", sessionID: "s1", messageID: "m1", type: "text" as const, text: `Found token: ${secretToken}` },
    ] as Part[];
    const result = mapOutputMessages(textParts, redactor);
    // Tier 1 patterns fire even in lightweight mode
    expect(result[0].parts?.[0]).toHaveProperty("type", "text");
    const textContent = (result[0].parts?.[0] as any).text;
    expect(textContent).not.toContain(secretToken);
    expect(textContent).toContain("[REDACTED:");
  });

  it("maps completed ToolParts to tool_call + tool_result with full redaction", () => {
    const parts = [
      {
        id: "p1", sessionID: "s1", messageID: "m1", type: "tool" as const,
        callID: "call-1", tool: "bash",
        state: {
          status: "completed" as const,
          input: { command: "echo test" },
          output: "test output",
          title: "Run bash",
          metadata: {},
          time: { start: 1000, end: 2000 },
        },
      },
    ] as Part[];
    const result = mapOutputMessages(parts, redactor);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("assistant");
    expect(result[0].parts?.[0].type).toBe("tool_call");
    expect(result[1].role).toBe("tool");
    expect(result[1].parts?.[0].type).toBe("tool_result");
  });

  it("maps error ToolParts with is_error flag", () => {
    const parts = [
      {
        id: "p1", sessionID: "s1", messageID: "m1", type: "tool" as const,
        callID: "call-1", tool: "bash",
        state: {
          status: "error" as const,
          input: { command: "fail" },
          error: "command failed",
          metadata: {},
          time: { start: 1000, end: 2000 },
        },
      },
    ] as Part[];
    const result = mapOutputMessages(parts, redactor);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("tool");
    const toolResult = (result[0].parts?.[0] as any).toolResult;
    expect(toolResult.isError).toBe(true);
  });
});

describe("mapToolDefinitions", () => {
  it("maps tool name map to ToolDefinition array", () => {
    const tools = { bash: true, read: true, write: false };
    const result = mapToolDefinitions(tools);
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.name)).toContain("bash");
  });

  it("returns empty array for undefined", () => {
    expect(mapToolDefinitions(undefined)).toEqual([]);
  });
});

describe("mapGeneration (with content)", () => {
  it("includes input and output messages", () => {
    const msg = makeAssistantMsg();
    const userParts = [
      { id: "p1", sessionID: "s1", messageID: "m1", type: "text" as const, text: "hello" },
    ] as Part[];
    const assistantParts = [
      { id: "p2", sessionID: "s1", messageID: "m2", type: "text" as const, text: "hi there" },
    ] as Part[];
    const result = mapGeneration(msg, userParts, assistantParts, redactor);
    expect(result.input).toHaveLength(1);
    expect(result.output).toHaveLength(1);
    expect(result.usage?.inputTokens).toBe(100);
    expect(result.metadata?.cost).toBe(0.01);
  });

  it("preserves metadata fields from existing mapper", () => {
    const msg = makeAssistantMsg();
    const result = mapGeneration(msg, [], [], redactor);
    expect(result.responseModel).toBe("claude-opus-4-20250514");
    expect(result.stopReason).toBe("end_turn");
    expect(result.completedAt).toBeInstanceOf(Date);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sigil/mappers.test.ts`
Expected: FAIL — `mapInputMessages`, `mapOutputMessages`, `mapToolDefinitions` not exported

**Step 3: Update mappers.ts**

Extend `src/sigil/mappers.ts` — add new functions, update `mapGeneration` signature. Keep `mapError` unchanged.

The key changes:
- Add `mapInputMessages(parts: Part[]): Message[]` — filters TextParts, maps to Sigil user messages, no redaction
- Add `mapOutputMessages(parts: Part[], redactor: Redactor): Message[]` — maps text/reasoning/tool parts with appropriate redaction
- Add `mapToolDefinitions(tools): ToolDefinition[]` — converts name→boolean map to array
- Update `mapGeneration()` to accept parts and redactor, producing full input/output

```typescript
import type { AssistantMessage, Part } from "@opencode-ai/sdk";
import type {
  GenerationResult,
  Message,
  ToolDefinition,
} from "@grafana/sigil-sdk-js";
import type { Redactor } from "./redact.js";

export type { GenerationResult };

/** Map user-side parts to Sigil input messages. No redaction. */
export function mapInputMessages(parts: Part[]): Message[] {
  const messages: Message[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      messages.push({
        role: "user",
        parts: [{ type: "text", text: (part as { text: string }).text }],
      });
    }
  }
  return messages;
}

/** Map assistant-side parts to Sigil output messages with redaction. */
export function mapOutputMessages(parts: Part[], redactor: Redactor): Message[] {
  const messages: Message[] = [];
  for (const part of parts) {
    switch (part.type) {
      case "text": {
        const textPart = part as { text: string };
        messages.push({
          role: "assistant",
          parts: [{ type: "text", text: redactor.redactLightweight(textPart.text) }],
        });
        break;
      }
      case "reasoning": {
        const reasoningPart = part as { text: string };
        messages.push({
          role: "assistant",
          parts: [{ type: "thinking", thinking: redactor.redactLightweight(reasoningPart.text) }],
        });
        break;
      }
      case "tool": {
        const toolPart = part as {
          tool: string;
          callID: string;
          state: { status: string; input?: Record<string, unknown>; output?: string; error?: string };
        };
        const { state } = toolPart;
        if (state.status === "completed") {
          messages.push({
            role: "assistant",
            parts: [{
              type: "tool_call",
              toolCall: {
                id: toolPart.callID,
                name: toolPart.tool,
                inputJSON: redactor.redact(JSON.stringify(state.input ?? {})),
              },
            }],
          });
          messages.push({
            role: "tool",
            parts: [{
              type: "tool_result",
              toolResult: {
                toolCallId: toolPart.callID,
                name: toolPart.tool,
                content: redactor.redact(state.output ?? ""),
              },
            }],
          });
        } else if (state.status === "error") {
          messages.push({
            role: "tool",
            parts: [{
              type: "tool_result",
              toolResult: {
                toolCallId: toolPart.callID,
                name: toolPart.tool,
                content: redactor.redact(state.error ?? "unknown error"),
                isError: true,
              },
            }],
          });
        }
        break;
      }
    }
  }
  return messages;
}

/** Convert opencode tool name map to Sigil ToolDefinition array. */
export function mapToolDefinitions(
  tools: Record<string, boolean> | undefined,
): ToolDefinition[] {
  if (!tools) return [];
  return Object.keys(tools).map((name) => ({ name }));
}

/** Map an AssistantMessage + parts to a Sigil GenerationResult with content. */
export function mapGeneration(
  msg: AssistantMessage,
  userParts: Part[],
  assistantParts: Part[],
  redactor: Redactor,
): GenerationResult {
  return {
    input: mapInputMessages(userParts),
    output: mapOutputMessages(assistantParts, redactor),
    usage: {
      inputTokens: msg.tokens.input,
      outputTokens: msg.tokens.output,
      reasoningTokens: msg.tokens.reasoning,
      cacheReadInputTokens: msg.tokens.cache.read,
      cacheCreationInputTokens: msg.tokens.cache.write,
    },
    responseModel: msg.modelID,
    stopReason: msg.finish,
    completedAt: msg.time.completed ? new Date(msg.time.completed) : undefined,
    metadata: {
      cost: msg.cost,
    },
  };
}

export function mapError(
  error: NonNullable<AssistantMessage["error"]>,
): Error {
  switch (error.name) {
    case "ProviderAuthError":
      return new Error("provider_auth");
    case "APIError":
      return new Error(`api_error: ${error.data.statusCode ?? "unknown"}`);
    case "MessageOutputLengthError":
      return new Error("output_length_exceeded");
    case "MessageAbortedError":
      return new Error("aborted");
    case "UnknownError":
      return new Error("unknown_error");
    default: {
      const _exhaustive: never = error;
      return new Error("unknown_error");
    }
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run src/sigil/mappers.test.ts`
Expected: PASS

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/sigil/mappers.ts src/sigil/mappers.test.ts
git commit -m "feat(sigil): add content mapping with hybrid redaction"
```

---

### Task 4: Update hooks, sigil index, and plugin wiring (atomic)

This task is done atomically — hooks, index, and plugin wiring all change together so every commit is buildable.

**Files:**
- Modify: `src/sigil/hooks.ts`
- Modify: `src/sigil/index.ts`
- Modify: `src/index.ts`

**Reuse:**
- `src/sigil/hooks.ts` — existing `handleEvent()` and `handleLifecycle()` structure
- `src/sigil/mappers.ts` — updated mappers from Task 3
- `src/sigil/redact.ts:Redactor` — from Task 2
- `src/beads/context.ts:17-18` — pattern for `client.session.messages()` REST call
- `src/index.ts:79-81` — existing `chat.message` hook pattern (beads)

**Step 1: Update hooks.ts**

The hooks module needs:
1. A `PendingGeneration` store populated by a new `handleChatMessage()` export
2. `handleEvent()` updated to fetch assistant parts via REST, apply `contentCapture` toggle inline, and use new mappers
3. Lifecycle functions updated to accept `SigilClient` (unchanged interface)

Key design decisions:
- `contentCapture` conditional is applied inline in `handleEvent()` — no separate wrapper class
- `PendingGeneration` keyed by sessionID. In practice, opencode sessions process one user→assistant turn at a time, so overwrite on each `chat.message` is safe. If multi-turn overlap becomes an issue, switch to a FIFO queue per session.
- REST fetch timing: we fetch parts after `isTerminal` is true. If parts aren't fully populated yet, the REST response returns what's available. This is a known acceptable degradation — partial content is better than no content.

Update `src/sigil/hooks.ts`:

```typescript
import type { SigilClient } from "@grafana/sigil-sdk-js";
import type { AssistantMessage, UserMessage, Part } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk";
import type { SigilConfig } from "../shared/config.js";
import { Redactor } from "./redact.js";
import { mapGeneration, mapError, mapToolDefinitions } from "./mappers.js";

// Track recorded messages per session for dedup and cleanup
const recordedMessages = new Map<string, Set<string>>();

// Pending generation store: user-side data captured before assistant responds
type PendingGeneration = {
  systemPrompt: string | undefined;
  userParts: Part[];
  tools: Record<string, boolean> | undefined;
};
const pendingGenerations = new Map<string, PendingGeneration>();

function buildAgentName(prefix: string | undefined, mode: string | undefined): string {
  const base = prefix || "opencode";
  return mode ? `${base}:${mode}` : base;
}

/**
 * Called from the chat.message hook. Stores user-side data for later use
 * when the assistant message completes.
 */
export function handleChatMessage(
  input: { sessionID: string },
  output: { message: UserMessage; parts: Part[] },
): void {
  pendingGenerations.set(input.sessionID, {
    systemPrompt: (output.message as unknown as { system?: string }).system,
    userParts: output.parts,
    tools: (output.message as unknown as { tools?: Record<string, boolean> }).tools,
  });
}

export async function handleEvent(
  sigil: SigilClient,
  config: SigilConfig,
  client: OpencodeClient,
  redactor: Redactor,
  event: { type: string; properties: unknown },
): Promise<void> {
  if (event.type !== "message.updated") return;

  const properties = event.properties as { info?: { role?: string } } | undefined;
  const msg = properties?.info;
  if (!msg || msg.role !== "assistant") return;

  const assistantMsg = msg as AssistantMessage;

  // Only record terminal messages
  const isTerminal = assistantMsg.finish || assistantMsg.error || assistantMsg.time.completed;
  if (!isTerminal) return;

  // Dedup
  const sessionSet = recordedMessages.get(assistantMsg.sessionID) ?? new Set<string>();
  if (sessionSet.has(assistantMsg.id)) return;
  sessionSet.add(assistantMsg.id);
  recordedMessages.set(assistantMsg.sessionID, sessionSet);

  // Look up pending generation (user-side data)
  const pending = pendingGenerations.get(assistantMsg.sessionID);

  // Fetch assistant parts via REST
  let assistantParts: Part[] = [];
  try {
    const response = await client.session.message({
      path: { id: assistantMsg.sessionID, messageID: assistantMsg.id },
    });
    assistantParts = response.data?.parts ?? [];
  } catch {
    // REST fetch failed — fall back to metadata-only
  }

  const contentCapture = config.contentCapture ?? true;

  const seed = contentCapture
    ? {
        conversationId: assistantMsg.sessionID,
        agentName: buildAgentName(config.agentName, assistantMsg.mode),
        agentVersion: config.agentVersion,
        model: { provider: assistantMsg.providerID, name: assistantMsg.modelID },
        startedAt: new Date(assistantMsg.time.created),
        systemPrompt: pending?.systemPrompt,
        tools: mapToolDefinitions(pending?.tools),
      }
    : {
        conversationId: assistantMsg.sessionID,
        agentName: buildAgentName(config.agentName, assistantMsg.mode),
        agentVersion: config.agentVersion,
        model: { provider: assistantMsg.providerID, name: assistantMsg.modelID },
        startedAt: new Date(assistantMsg.time.created),
      };

  try {
    if (assistantMsg.error) {
      await sigil.startGeneration(seed, async (recorder) => {
        recorder.setCallError(mapError(assistantMsg.error!));
      });
    } else {
      const result = contentCapture
        ? mapGeneration(assistantMsg, pending?.userParts ?? [], assistantParts, redactor)
        : {
            output: [] as [],
            usage: {
              inputTokens: assistantMsg.tokens.input,
              outputTokens: assistantMsg.tokens.output,
              reasoningTokens: assistantMsg.tokens.reasoning,
              cacheReadInputTokens: assistantMsg.tokens.cache.read,
              cacheCreationInputTokens: assistantMsg.tokens.cache.write,
            },
            responseModel: assistantMsg.modelID,
            stopReason: assistantMsg.finish,
            completedAt: assistantMsg.time.completed ? new Date(assistantMsg.time.completed) : undefined,
            metadata: { cost: assistantMsg.cost },
          };
      await sigil.startGeneration(seed, async (recorder) => {
        recorder.setResult(result);
      });
    }
  } catch {
    // Sigil recording failure should never break the plugin
  }

  // Clean up pending generation
  pendingGenerations.delete(assistantMsg.sessionID);
}

export async function handleLifecycle(
  sigil: SigilClient,
  event: { type: string; properties: unknown },
): Promise<void> {
  const type = event.type as string;

  if (type === "session.idle") {
    try {
      await sigil.flush();
    } catch {
      // flush failure is non-fatal
    }
  }

  if (type === "session.deleted") {
    const properties = event.properties as { info?: { id?: string } } | undefined;
    const sessionId = properties?.info?.id;
    if (sessionId) {
      recordedMessages.delete(sessionId);
      pendingGenerations.delete(sessionId);
    }
  }

  if (type === "global.disposed") {
    try {
      await sigil.shutdown();
    } catch {
      // shutdown failure is non-fatal
    }
  }
}
```

**Step 2: Update src/sigil/index.ts**

The index needs to:
1. Instantiate the `Redactor`
2. Accept `client: OpencodeClient` parameter
3. Export a `chatMessage` handler
4. Pass `client` and `redactor` to `handleEvent`

```typescript
import type { SigilConfig } from "../shared/config.js";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { createSigilClient } from "./client.js";
import { handleEvent, handleLifecycle, handleChatMessage } from "./hooks.js";
import { Redactor } from "./redact.js";

export type { SigilConfig } from "../shared/config.js";

export type SigilHooks = {
  event: (input: { event: { type: string; properties: unknown } }) => Promise<void>;
  chatMessage: (
    input: { sessionID: string },
    output: { message: any; parts: any[] },
  ) => void;
};

export async function createSigilHooks(
  config: SigilConfig,
  client: OpencodeClient,
): Promise<SigilHooks | null> {
  if (!config.enabled) return null;

  if (!config.endpoint) {
    console.warn("[sigil] endpoint is required when enabled -- skipping Sigil initialization");
    return null;
  }

  const sigil = createSigilClient(config);
  if (!sigil) return null;

  const redactor = new Redactor();

  process.on("beforeExit", () => {
    sigil.shutdown().catch(() => {});
  });

  return {
    event: async (input) => {
      await handleEvent(sigil, config, client, redactor, input.event);
      await handleLifecycle(sigil, input.event);
    },
    chatMessage: (input, output) => {
      handleChatMessage(input, output);
    },
  };
}
```

**Step 3: Update src/index.ts**

Two changes:
1. Pass `client` to `createSigilHooks()`
2. Wire sigil `chatMessage` into the `chat.message` hook

In `src/index.ts`, change the sigil initialization (around line 67):

```typescript
const sigilHooks = await createSigilHooks(
  pluginConfig.sigil ?? { enabled: false, endpoint: "", auth: { mode: "none" } },
  client,
);
```

And update the `chat.message` hook (around line 79):

```typescript
"chat.message": async (_input, output) => {
  await beads.handleChatMessage(_input, output);
  sigilHooks?.chatMessage?.(_input, output);
},
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 6: Build**

Run: `npm run build`
Expected: Clean build to `dist/`

**Step 7: Commit**

```bash
git add src/sigil/hooks.ts src/sigil/index.ts src/index.ts
git commit -m "feat(sigil): wire content capture into plugin hooks with REST fetch"
```

**Step 8: Deploy and verify**

Run: `npm run deploy`

If sigil is configured in `~/.config/opencode/tw-plugin.json`, start an opencode session, send a message, and verify in the Sigil UI that the recording includes content. Verify a message containing a fake secret pattern (e.g., `glc_test_abc...`) shows `[REDACTED:grafana-cloud-token]`.

```bash
git push
```

---

## Known Assumptions and Risks

1. **Event serialization:** We assume opencode awaits each event handler before dispatching the next. If wrong, add a pending-count guard on the flush path.
2. **PendingGeneration keying:** Keyed by sessionID, overwritten on each `chat.message`. Safe for single-turn-at-a-time sessions. If multi-turn overlap occurs, switch to a FIFO queue.
3. **REST fetch timing:** Parts may not be fully populated when `isTerminal` is true. Partial content is accepted as better than none. If this proves problematic, add a small delay before fetching.
4. **Pattern coverage:** Starting with ~20 patterns. Add more from Gitleaks when concrete unredacted secrets are observed. The design supports this with zero structural changes.
