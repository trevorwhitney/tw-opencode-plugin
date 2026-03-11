# Sigil Content Capture with Secret Redaction

**Goal:** Send rich conversation data (system prompts, user prompts, assistant responses, tool calls/results) to Sigil for agent versioning, evaluation, and debugging — while preventing credential leakage through client-side redaction.

**Approach:** Hybrid redaction — tool content gets full pattern-based redaction, assistant text gets lightweight high-confidence-only redaction, system prompts and user prompts pass through unredacted.

---

## Architecture Overview

```
chat.message hook                    message.updated event
  |                                        |
  v                                        v
Store pending generation:            Fetch assistant parts via REST:
  - systemPrompt                       session.message(sessionID, msgID)
  - userParts (TextParts)                  |
  - tools map                             v
  |                                  Combine pending + assistant parts
  |                                        |
  +----------> PendingGeneration <---------+
                                           |
                                           v
                                     Map to Sigil format
                                     Apply redaction per tier
                                           |
                                           v
                                     SigilRecorder.record()
                                     (strips content if contentCapture=false)
                                           |
                                           v
                                     Sigil SDK (startGeneration + setResult)
```

---

## Section 1: Data Capture

### Sources

| Data | Source | When |
|---|---|---|
| System prompt | `chat.message` hook → `output.message.system` | Before LLM call |
| User prompt text | `chat.message` hook → `output.parts` (TextParts) | Before LLM call |
| Tool definitions | `chat.message` hook → `output.message.tools` | Before LLM call |
| Assistant parts | REST: `session.message(sessionID, msgID)` → `parts` | After `message.updated` |

### Pending Generation Store

A `Map<string, PendingGeneration>` keyed by `sessionID`, stored in the hooks module:

```typescript
type PendingGeneration = {
  systemPrompt: string | undefined;
  userParts: Part[];
  tools: Record<string, boolean> | undefined;
};
```

Populated by the `chat.message` hook handler. Consumed and cleaned up when `message.updated` fires for the terminal assistant message.

### Async Coordination

Event handlers are `await`ed by the opencode runtime (`src/index.ts:110`), so `session.idle` cannot fire until the `message.updated` handler (including the REST fetch) completes. No additional coordination or promise tracking is needed.

If this assumption proves wrong, a simple pending-count guard can be added to the flush path. Not included in v1.

### REST Fetch Fallback

If `session.message()` fails, fall back to the current metadata-only behavior (`output: []`, no `input`). Sigil recording reliability is preserved — failures never break the plugin.

---

## Section 2: Redaction Engine

### Design

A `Redactor` class in `src/sigil/redact.ts` with two public methods:

- `redact(text: string): string` — full redaction (all patterns + entropy heuristics)
- `redactLightweight(text: string): string` — high-confidence patterns only

Replacements use the format `[REDACTED:<type>]` to preserve debugging value.

### Pattern Source: Gitleaks

Patterns are sourced from the [Gitleaks](https://github.com/gitleaks/gitleaks) rule set (~200 rules), the same patterns Grafana's `loki.secretfilter` uses. We pull in the full set as our baseline and only exclude rules that cause obvious false positives in conversation text (e.g., patterns that match every UUID).

This avoids depending on unmaintained npm redaction libraries while leveraging battle-tested patterns that cover:

- Grafana Cloud tokens (`glc_*`, `glsa_*`)
- AWS access keys (`AKIA*`), secret keys
- GCP service account JSON, API keys
- GitHub tokens (`ghp_*`, `ghs_*`, `gho_*`)
- Azure client secrets, connection strings
- Slack, Stripe, SendGrid, Twilio, and many more service-specific tokens
- Database connection strings (postgres://, mysql://, mongodb://)
- PEM-encoded private keys
- Generic high-entropy strings
- JWT tokens
- And ~180+ more patterns

### Tier Split

**Tier 1 — High-confidence patterns** (used by both `redact` and `redactLightweight`):
- All Gitleaks patterns that match definite secret formats (prefix-based tokens, structured keys, PEM blocks, connection strings with credentials)

**Tier 2 — Heuristic patterns** (used only by `redact`, i.e., tool content):
- Environment variable secret values: `(PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL|API_KEY)\s*[=:]\s*\S+` — redacts the value, preserves the key name
- Shannon entropy detection: strings 20+ chars with entropy > 4.5
- Long base64 blobs with entropy check

### Content-to-Tier Mapping

| Content Type | Redaction Level | Rationale |
|---|---|---|
| System prompts | None (pass-through) | User-controlled, no credentials |
| User prompt text | None (pass-through) | User confirmed no credentials in prompts |
| Tool definitions | None (pass-through) | Static schemas |
| Assistant text | `redactLightweight` (tier 1) | Natural language, low risk, but catch verbatim echoes |
| Reasoning/thinking | `redactLightweight` (tier 1) | Same as assistant text |
| Tool call arguments | `redact` (tier 1 + 2) | AI passes secrets to commands |
| Tool results/output | `redact` (tier 1 + 2) | Raw file contents, command output — primary threat vector |
| Tool errors | `redact` (tier 1 + 2) | Error messages may contain sensitive context |

### Implementation Notes

- Patterns compiled once at module load, not per-call
- Entropy calculation: Shannon entropy function (~10 lines)
- `env_secret_value` pattern preserves key names (e.g., `PASSWORD=[REDACTED:env_secret_value]`)
- PEM block redaction replaces entire BEGIN-to-END block

---

## Section 3: Mapper Changes and Sigil SDK Integration

### SigilRecorder Wrapper

A new `SigilRecorder` class wraps the Sigil SDK client. It receives full content on every call but strips it at the SDK boundary if `contentCapture` is false:

```typescript
class SigilRecorder {
  constructor(
    private client: SigilClient,
    private contentCapture: boolean,
    private redactor: Redactor,
  ) {}

  record(seed: GenerationSeed, result: GenerationResult) {
    const start = this.contentCapture
      ? seed
      : omit(seed, ['systemPrompt', 'tools']);
    const res = this.contentCapture
      ? result
      : { ...result, input: undefined, output: [] };
    // single SDK call path: startGeneration(start) → recorder.setResult(res)
  }
}
```

This creates one logical code path in the hooks and mappers. The `contentCapture` decision is made in exactly one place.

### GenerationStart Seed

Add to existing seed fields:

```typescript
{
  // ...existing: conversationId, agentName, agentVersion, model, startedAt
  systemPrompt: pending.systemPrompt,
  tools: mapToolDefinitions(pending.tools),
}
```

`mapToolDefinitions` converts the opencode `{ [toolName: string]: boolean }` map to Sigil's `ToolDefinition[]`. Only tool names and enabled status are available — not full schemas. Sufficient for agent versioning (sha256 hash).

### GenerationResult Mapping

Updated mapper signature:

```typescript
function mapGeneration(
  msg: AssistantMessage,
  userParts: Part[],
  assistantParts: Part[],
  redactor: Redactor,
): GenerationResult
```

**Input messages** (from `userParts`):
- `TextPart` → Sigil `Message { role: "user", parts: [{ text }] }` — no redaction

**Output messages** (from `assistantParts`):
- `TextPart` → `Message { role: "assistant", parts: [{ text: redactLightweight(text) }] }`
- `ReasoningPart` → `Message { role: "assistant", parts: [{ thinking: redactLightweight(text) }] }`
- `ToolPart` (completed) → two Sigil messages:
  1. `Message { role: "assistant", parts: [{ tool_call: { name, input_json: redact(args) } }] }`
  2. `Message { role: "tool", parts: [{ tool_result: { name, content: redact(output) } }] }`
- `ToolPart` (error) → `Message { role: "tool", parts: [{ tool_result: { name, content: redact(error), is_error: true } }] }`
- Other part types (`SubtaskPart`, `StepStartPart`, etc.) → skipped. No clean Sigil mapping, not needed for core use cases.

### File Changes

| File | Change |
|---|---|
| `src/sigil/redact.ts` | **New.** `Redactor` class with Gitleaks-sourced pattern registry |
| `src/sigil/recorder.ts` | **New.** `SigilRecorder` wrapper handling `contentCapture` toggle |
| `src/sigil/mappers.ts` | **Modified.** Updated `mapGeneration` + new `mapToolDefinitions`, `mapInputMessages`, `mapOutputMessages` |
| `src/sigil/hooks.ts` | **Modified.** Add pending store, `chat.message` handler, REST fetch in recording path |
| `src/sigil/index.ts` | **Modified.** Instantiate `Redactor` and `SigilRecorder`, export `chat.message` handler |
| `src/index.ts` | **Modified.** Wire `chat.message` hook to sigil hooks alongside beads |
| `src/shared/config.ts` | **Modified.** Add `contentCapture?: boolean` to `SigilConfig` |

---

## Section 4: Configuration

### Config Changes

Add one optional field to `SigilConfig`:

```typescript
type SigilConfig = {
  enabled: boolean;
  endpoint: string;
  auth: SigilAuthConfig;
  agentName?: string;
  agentVersion?: string;
  contentCapture?: boolean;  // default: true
};
```

When `contentCapture` is `false`, the `SigilRecorder` wrapper strips all content at the SDK boundary, preserving the v1 metadata-only behavior. The hooks, mappers, and redaction still execute the same code path — only the final SDK call differs.

### No Other Config Changes

- No user-configurable pattern list in v1 (Gitleaks patterns are the baseline)
- No redaction audit log toggle
- No per-content-type opt-in/out

---

## Section 5: Testing

### Redactor Unit Tests (`src/sigil/redact.test.ts`)

- Each Gitleaks-sourced pattern: known secret → correctly replaced with `[REDACTED:<type>]`
- Tier 2 heuristics: env file content, high-entropy strings → correctly replaced
- **False positive tests**: UUIDs, base64-encoded images, long variable names, code snippets with `key` in the name → NOT redacted
- `redactLightweight` triggers tier 1 only
- Empty/null input handling
- Multiple secrets in the same string
- Multi-line secrets (PEM blocks)

### Mapper Unit Tests (`src/sigil/mappers.test.ts`)

- `mapGeneration` with full parts → correct Sigil message structure
- Tool parts (completed/error) → correct tool_call + tool_result messages
- Redactor integration: tool content through `redact`, assistant text through `redactLightweight`
- Graceful handling of missing/empty parts

### Recorder Unit Tests (`src/sigil/recorder.test.ts`)

- `contentCapture: true` → full content passed to SDK
- `contentCapture: false` → content stripped, metadata preserved

### Integration Tests

- `chat.message` hook stores pending generation correctly
- `message.updated` → REST fetch → recording flow end-to-end
- REST fetch failure → fallback to metadata-only recording

---

## Assumptions and Known Limitations

1. **Event serialization**: We assume opencode dispatches events serially (awaiting each handler). If this is wrong, a pending-count guard on flush is the fix.
2. **Pattern-based redaction is not perfect**: Novel secret formats not in the Gitleaks set can slip through. The entropy heuristic catches some of these for tool content but not for assistant text.
3. **Tool definitions are name-only**: opencode's `UserMessage.tools` is a `{ name: boolean }` map, not full schemas. Sufficient for agent versioning but not for Sigil's full `ToolDefinition` model.
4. **Skipped part types**: `SubtaskPart`, `StepStartPart`, `StepFinishPart`, `SnapshotPart`, `PatchPart`, `AgentPart`, `RetryPart`, `CompactionPart` are not mapped to Sigil messages. Can be added later.
5. **No server-side redaction**: Sigil stores whatever we send. All sanitization is client-side.
