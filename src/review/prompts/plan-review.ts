import type { PromptSet, LabeledReview, ReviewerLabel } from "../types.js";

const PLAN_REVIEW_INSTRUCTIONS = `\
Your prime directive: THE SIMPLEST PLAN THAT SOLVES THE TASK IS THE BEST PLAN.

Focus areas:
- **Bloat**: Identify steps, sections, or details unnecessary to solve the stated task. Flag anything removable without losing capability.
- **Scope creep**: Does the plan stay laser-focused on the stated goal, or gold-plate with nice-to-haves?
- **YAGNI violations**: Is it building abstractions, extensibility, or features not yet needed?
- **Complexity**: Could any multi-step sequence be replaced with something simpler? Over-engineered solutions to simple problems?
- **Missing steps**: Gaps, unstated assumptions, or implicit dependencies?
- **Ordering & dependencies**: Steps in wrong order? Prerequisites implicit rather than explicit?
- **Verification gaps**: How will you know each step succeeded? Is success criteria defined?
- **Risk & failure modes**: What could go wrong? Points of no return without rollback?
- **Feasibility**: Are all steps actually achievable given the stated context and constraints?
- **Duplication / Reuse failures**: Does the plan create anything that likely already exists in the codebase? Does it introduce parallel abstractions instead of extending existing ones? Are there tasks missing a Reuse section that should have one?

Be specific: reference section names, step numbers, and quote the plan. Explain WHY each issue matters and suggest a concrete fix (usually: delete it, simplify it, or restructure it).

Bias toward REMOVING things. A shorter plan that solves the task is always better than a thorough plan that over-delivers.`;

const PLAN_DISCUSSION_RULES = `\
No performative agreement -- don't say things like "great point" or "you're absolutely right." If you change your mind, state what convinced you. If another critic is wrong, quote the plan to prove it.`;

function planCrossReviewInstructions(otherReviews: LabeledReview[]): string {
  const otherLabels = otherReviews.map((r) => r.label).join(", ");
  return `\
Respond as a peer:
- Where do you agree with ${otherLabels}?
- Where do you disagree, and why? Provide evidence (quote the plan).
- Did any of them catch something you missed? Acknowledge it.
- Did they miss something important? Point it out.
- Where severity assessments differ, explain your reasoning.

The goal is accuracy, not winning.

${PLAN_DISCUSSION_RULES}`;
}

function formatOtherCritiques(otherReviews: LabeledReview[]): string {
  return otherReviews
    .map((r) => `${r.label}'s critique:\n\n${r.text}`)
    .join("\n\n");
}

export const planReviewPrompts: PromptSet = {
  round1(label: ReviewerLabel, target: string): string {
    return (
      `You are ${label} — an experienced engineer performing an independent plan critique.\n\n` +
      PLAN_REVIEW_INSTRUCTIONS +
      "\n\nPlan to critique:\n" +
      target
    );
  },

  round2(label: ReviewerLabel, ownReview: string, otherReviews: LabeledReview[]): string {
    const otherCount = otherReviews.length;
    const otherLabels = otherReviews.map((r) => r.label).join(" and ");
    return (
      `You are ${label}. You and ${otherCount} other experienced engineer${otherCount > 1 ? "s" : ""} (${otherLabels}) independently critiqued the same plan. Now compare notes.\n\n` +
      "Your critique:\n\n" +
      ownReview +
      "\n\n" +
      formatOtherCritiques(otherReviews) +
      "\n\n" +
      planCrossReviewInstructions(otherReviews)
    );
  },

  synthesis(results): string {
    const rounds = results
      .map(
        (r) =>
          `Round 1 — ${r.label} (independent critique): ${r.round1}\n` +
          `Round 2 — ${r.label} (cross-review): ${r.round2}`,
      )
      .join("\n");

    return (
      `You have the complete discussion between ${results.length} experienced engineers who independently critiqued the plan and then compared notes.\n\n` +
      rounds +
      "\n\nSynthesize into a final plan critique. Include ONLY findings where the critics reached agreement or where the evidence clearly supports the finding.\n\n" +
      "## Part 1: Surviving Findings\n\n" +
      "For each finding:\n" +
      "- Category (bloat/scope-creep/yagni/complexity/duplication/missing-step/ordering/verification/risk/feasibility)\n" +
      "- Severity (critical/high/medium/low)\n" +
      "- Location (section/step reference)\n" +
      "- Description and recommendation\n\n" +
      "Drop anything that was resolved through discussion.\n\n" +
      "## Part 2: Revised Plan\n\n" +
      "Produce a REVISED PLAN that incorporates all surviving recommendations. This must be the simplest possible version that still fully solves the stated task.\n\n" +
      "If the original plan is already lean and correct, say so explicitly and suggest only minor tweaks."
    );
  },
};
