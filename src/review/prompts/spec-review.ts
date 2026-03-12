import type { PromptSet, LabeledReview, ReviewerLabel } from "../types.js";

const SPEC_REVIEW_INSTRUCTIONS = `\
Your prime directive: A SPEC WITH HOLES WILL PRODUCE A BAD PLAN. Find the holes.

Focus areas:
- **Completeness**: TODOs, placeholders, "TBD", incomplete sections, sections saying "to be defined later" or "will spec when X is done."
- **Coverage**: Missing error handling, edge cases, integration points, failure modes.
- **Consistency**: Internal contradictions, conflicting requirements, sections that disagree with each other.
- **Clarity**: Ambiguous requirements that could be interpreted multiple ways. If you can read a requirement two different ways, flag it.
- **YAGNI**: Unrequested features, over-engineering, premature abstraction, extensibility points not yet needed.
- **Scope**: Is this focused enough for a single implementation plan, or does it cover multiple independent subsystems that should be separate specs?
- **Architecture**: Units with clear boundaries, well-defined interfaces, independently understandable and testable. Can you understand what each unit does without reading its internals?

Look especially hard for:
- Sections noticeably less detailed than others
- Units that lack clear boundaries or interfaces
- Implicit assumptions that aren't stated

Be specific: reference section names, quote the spec. Explain WHY each issue matters and suggest a concrete fix.

Bias toward flagging incompleteness. A shorter, complete spec is always better than a longer spec with gaps.`;

const SPEC_DISCUSSION_RULES = `\
No performative agreement -- don't say things like "great point" or "you're absolutely right." If you change your mind, state what convinced you. If another reviewer is wrong, quote the spec to prove it.`;

function specCrossReviewInstructions(otherReviews: LabeledReview[]): string {
  const otherLabels = otherReviews.map((r) => r.label).join(", ");
  return `\
Respond as a peer:
- Where do you agree with ${otherLabels}?
- Where do you disagree, and why? Provide evidence (quote the spec).
- Did any of them catch something you missed? Acknowledge it.
- Did they miss something important? Point it out.
- Where severity assessments differ, explain your reasoning.

The goal is accuracy, not winning.

${SPEC_DISCUSSION_RULES}`;
}

function formatOtherReviews(otherReviews: LabeledReview[]): string {
  return otherReviews
    .map((r) => `${r.label}'s review:\n\n${r.text}`)
    .join("\n\n");
}

export const specReviewPrompts: PromptSet = {
  round1(label: ReviewerLabel, target: string): string {
    return (
      `You are ${label} — an experienced engineer performing an independent spec review.\n\n` +
      SPEC_REVIEW_INSTRUCTIONS +
      "\n\nSpec to review:\n" +
      target
    );
  },

  round2(label: ReviewerLabel, ownReview: string, otherReviews: LabeledReview[]): string {
    const otherCount = otherReviews.length;
    const otherLabels = otherReviews.map((r) => r.label).join(" and ");
    return (
      `You are ${label}. You and ${otherCount} other experienced engineer${otherCount > 1 ? "s" : ""} (${otherLabels}) independently reviewed the same spec. Now compare notes.\n\n` +
      "Your review:\n\n" +
      ownReview +
      "\n\n" +
      formatOtherReviews(otherReviews) +
      "\n\n" +
      specCrossReviewInstructions(otherReviews)
    );
  },

  synthesis(results): string {
    const rounds = results
      .map(
        (r) =>
          `Round 1 — ${r.label} (independent review): ${r.round1}\n` +
          `Round 2 — ${r.label} (cross-review): ${r.round2}`,
      )
      .join("\n");

    return (
      `You have the complete discussion between ${results.length} experienced engineers who independently reviewed the spec and then compared notes.\n\n` +
      rounds +
      "\n\nSynthesize into a final spec review report. Include ONLY findings where the reviewers reached agreement or where the evidence clearly supports the finding.\n\n" +
      "## Spec Review\n\n" +
      "**Status:** Approved | Issues Found\n\n" +
      "**Surviving Findings (if any):**\n" +
      "For each finding:\n" +
      "- Category (completeness/coverage/consistency/clarity/yagni/scope/architecture)\n" +
      "- Severity (critical/high/medium/low)\n" +
      "- Location (section reference)\n" +
      "- Description and recommendation\n\n" +
      "Drop anything that was resolved through discussion.\n\n" +
      "**Recommendations (advisory, don't block approval):**\n" +
      "- Suggestions that improve the spec but aren't required for approval"
    );
  },
};
