import type { createOpencodeClient, TextPart } from "@opencode-ai/sdk";
import type { PhaseResult, PromptSet, LabeledReview } from "./types.js";
import type { ReviewConfig } from "../shared/config.js";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

/** Alphabet labels: index 0 → "A", 1 → "B", 2 → "C", etc. */
function reviewerLabel(index: number): string {
  return `Reviewer ${String.fromCharCode(65 + index)}`;
}

const RETRY_DELAY_MS = 5_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSubagent(
  client: OpencodeClient,
  parentID: string,
  agent: string,
  title: string,
  prompt: string,
  timeoutMs: number,
): Promise<PhaseResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let sessionId: string | undefined;
    try {
      const session = await client.session.create({
        body: { parentID, title },
      });
      sessionId = session.data!.id;
      const result = await client.session.prompt({
        path: { id: sessionId },
        body: {
          agent,
          parts: [{ type: "text" as const, text: prompt }],
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = result.data!.parts
        .filter((p): p is TextPart => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      return { text };
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
      const message = isTimeout
        ? `timed out after ${Math.round(timeoutMs / 1000)}s`
        : err instanceof Error ? err.message : String(err);

      // Best-effort abort so the session doesn't keep running in the background
      if (sessionId && isTimeout) {
        client.session.abort({ path: { id: sessionId } }).catch(() => {});
      }

      if (attempt === 0) {
        // Don't retry timeouts — if it timed out once, it'll likely time out again
        if (isTimeout) {
          console.warn(`[review] ${agent} ${message} — degrading gracefully`);
          return { text: "", error: message };
        }
        console.warn(`[review] ${agent} failed (${message}), retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      console.warn(`[review] ${agent} failed after retry: ${message} — degrading gracefully`);
      return { text: "", error: message };
    }
  }
  // unreachable, but satisfies TypeScript
  return { text: "", error: "unexpected" };
}

export async function runReviewPipeline(
  client: OpencodeClient,
  sessionID: string,
  target: string,
  prompts: PromptSet,
  config: ReviewConfig,
): Promise<string> {
  const agents = config.agents;
  const labels = agents.map((_, i) => reviewerLabel(i));

  const { timeoutMs } = config;

  // Phase 1: parallel independent reviews
  const round1Results = await Promise.all(
    agents.map((agent, i) =>
      runSubagent(
        client,
        sessionID,
        agent,
        `Round 1 — ${labels[i]}`,
        prompts.round1(labels[i], target),
        timeoutMs,
      ),
    ),
  );

  // Identify which reviewers produced usable output for Round 2
  const activeIndices = round1Results
    .map((r, i) => (r.text ? i : -1))
    .filter((i) => i >= 0);

  // Phase 2: parallel cross-reviews (each sees all other Round 1 outputs)
  const round2Results: PhaseResult[] = new Array(agents.length).fill({ text: "", error: "skipped — no Round 1 output" });

  const round2Promises = activeIndices.map((i) => {
    const otherReviews: LabeledReview[] = activeIndices
      .filter((j) => j !== i)
      .map((j) => ({ label: labels[j], text: round1Results[j].text }));

    return runSubagent(
      client,
      sessionID,
      agents[i],
      `Round 2 — ${labels[i]}`,
      prompts.round2(labels[i], round1Results[i].text, otherReviews),
      timeoutMs,
    ).then((result) => {
      round2Results[i] = result;
    });
  });

  await Promise.all(round2Promises);

  // Build synthesis input — only include reviewers that participated in at least Round 1
  const synthesisInput = activeIndices.map((i) => ({
    label: labels[i],
    round1: round1Results[i].text,
    round2: round2Results[i].text || "(no cross-review — agent unavailable)",
  }));

  // Note any degraded reviewers in the synthesis prompt
  const degraded = agents
    .map((agent, i) => (!round1Results[i].text ? `${labels[i]} (${agent}): ${round1Results[i].error}` : null))
    .filter(Boolean);

  let synthesis = prompts.synthesis(synthesisInput);

  if (degraded.length > 0) {
    synthesis +=
      "\n\nNote: The following reviewer(s) were unavailable and did not participate:\n" +
      degraded.map((d) => `- ${d}`).join("\n");
  }

  return synthesis;
}
