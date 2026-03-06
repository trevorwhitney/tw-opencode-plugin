import type { createOpencodeClient, TextPart } from "@opencode-ai/sdk";
import type { PhaseResult, PromptSet, ReviewConfig } from "./types.js";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

async function runSubagent(
  client: OpencodeClient,
  parentID: string,
  agent: string,
  title: string,
  prompt: string,
): Promise<PhaseResult> {
  try {
    const session = await client.session.create({
      body: { parentID, title },
    });
    const sessionId = session.data!.id;
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        agent,
        parts: [{ type: "text" as const, text: prompt }],
      },
    });
    const text = result.data!.parts
      .filter((p): p is TextPart => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    return { text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: "", error: message };
  }
}

export async function runReviewPipeline(
  client: OpencodeClient,
  sessionID: string,
  target: string,
  prompts: PromptSet,
  config: ReviewConfig,
  onProgress?: (status: string) => void,
): Promise<string> {
  // Helper to build status string
  function status(round: string, a: string, b: string): string {
    return `${round}: ${a} Reviewer A, ${b} Reviewer B`;
  }

  const PENDING = "⧖";
  const DONE = "✓";

  // Phase 1: parallel independent reviews
  let r1aState = PENDING, r1bState = PENDING;
  onProgress?.(status("Round 1", r1aState, r1bState));

  const [r1a, r1b] = await Promise.all([
    runSubagent(client, sessionID, config.agentA, "Round 1 — Reviewer A", prompts.round1A(target))
      .then(r => { r1aState = DONE; onProgress?.(status("Round 1", r1aState, r1bState)); return r; }),
    runSubagent(client, sessionID, config.agentB, "Round 1 — Reviewer B", prompts.round1B(target))
      .then(r => { r1bState = DONE; onProgress?.(status("Round 1", r1aState, r1bState)); return r; }),
  ]);

  // Phase 2: parallel cross-reviews (each sees the other's Round 1)
  let r2aState = PENDING, r2bState = PENDING;
  onProgress?.(status("Round 2", r2aState, r2bState));

  const [r2a, r2b] = await Promise.all([
    runSubagent(client, sessionID, config.agentA, "Round 2 — Reviewer A", prompts.round2A(r1a.text, r1b.text))
      .then(r => { r2aState = DONE; onProgress?.(status("Round 2", r2aState, r2bState)); return r; }),
    runSubagent(client, sessionID, config.agentB, "Round 2 — Reviewer B", prompts.round2B(r1a.text, r1b.text))
      .then(r => { r2bState = DONE; onProgress?.(status("Round 2", r2aState, r2bState)); return r; }),
  ]);

  // Phase 3: build synthesis prompt
  onProgress?.("Building synthesis...");
  return prompts.synthesis(r1a.text, r1b.text, r2a.text, r2b.text);
}
