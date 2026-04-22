import type { PhaseResult, PromptSet, LabeledReview, RunSubagent } from "./types.js";
import type { ReviewConfig } from "../shared/config.js";

/** Alphabet labels: index 0 → "A", 1 → "B", 2 → "C", etc. */
function reviewerLabel(index: number): string {
  return `Reviewer ${String.fromCharCode(65 + index)}`;
}

export async function runReviewPipeline(
  runSubagent: RunSubagent,
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
