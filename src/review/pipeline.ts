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
): Promise<string> {
  // Phase 1: parallel independent reviews
  const [r1a, r1b] = await Promise.all([
    runSubagent(client, sessionID, config.agentA, "Round 1 — Reviewer A", prompts.round1A(target)),
    runSubagent(client, sessionID, config.agentB, "Round 1 — Reviewer B", prompts.round1B(target)),
  ]);

  // Phase 2: parallel cross-reviews (each sees the other's Round 1)
  const [r2a, r2b] = await Promise.all([
    runSubagent(client, sessionID, config.agentA, "Round 2 — Reviewer A", prompts.round2A(r1a.text, r1b.text)),
    runSubagent(client, sessionID, config.agentB, "Round 2 — Reviewer B", prompts.round2B(r1a.text, r1b.text)),
  ]);

  // Phase 3: build synthesis prompt
  return prompts.synthesis(r1a.text, r1b.text, r2a.text, r2b.text);
}
