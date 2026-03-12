import type { LabeledReview } from "../types.js";

export const DISCUSSION_RULES = `\
Before agreeing or conceding, verify the claim against actual code. \
No performative agreement -- don't say things like "great point" or \
"you're absolutely right." If you change your mind, state what you \
checked and why you were wrong. If another reviewer is wrong, show \
the code that proves it.`;

/**
 * Build a cross-review prompt section listing the other reviewers' work.
 */
export function formatOtherReviews(otherReviews: LabeledReview[]): string {
  return otherReviews
    .map((r) => `${r.label}'s review:\n\n${r.text}`)
    .join("\n\n");
}

/**
 * Build cross-review instructions that reference all other reviewers by label.
 */
export function crossReviewInstructions(
  otherReviews: LabeledReview[],
): string {
  const otherLabels = otherReviews.map((r) => r.label).join(", ");
  return `\
Respond as a peer:
- Where do you agree with ${otherLabels}?
- Where do you disagree, and why? Provide evidence (file paths, line numbers, code).
- Did any of them catch something you missed? Acknowledge it.
- Did they miss something important? Point it out.
- Where severity assessments differ, explain your reasoning.

The goal is accuracy, not winning. Re-read the code if needed.

${DISCUSSION_RULES}`;
}
