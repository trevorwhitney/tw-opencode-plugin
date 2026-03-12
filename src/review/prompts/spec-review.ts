import type { PromptSet } from "../types.js";

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
No performative agreement -- don't say things like "great point" or "you're absolutely right." If you change your mind, state what convinced you. If the other reviewer is wrong, quote the spec to prove it.`;

const SPEC_CROSS_REVIEW_INSTRUCTIONS_A = `\
Respond as a peer:
- Where do you agree with Reviewer B?
- Where do you disagree, and why? Provide evidence (quote the spec).
- Did Reviewer B catch something you missed? Acknowledge it.
- Did they miss something important? Point it out.
- Where severity assessments differ, explain your reasoning.

The goal is accuracy, not winning.

${SPEC_DISCUSSION_RULES}`;

const SPEC_CROSS_REVIEW_INSTRUCTIONS_B = `\
Respond as a peer:
- Where do you agree with Reviewer A?
- Where do you disagree, and why? Provide evidence (quote the spec).
- Did Reviewer A catch something you missed? Acknowledge it.
- Did they miss something important? Point it out.
- Where severity assessments differ, explain your reasoning.

The goal is accuracy, not winning.

${SPEC_DISCUSSION_RULES}`;

export const specReviewPrompts: PromptSet = {
  round1A(target: string): string {
    return (
      "You are Reviewer A — an experienced engineer performing an independent spec review.\n\n" +
      SPEC_REVIEW_INSTRUCTIONS +
      "\n\nSpec to review:\n" +
      target
    );
  },

  round1B(target: string): string {
    return (
      "You are Reviewer B — an experienced engineer performing an independent spec review.\n\n" +
      SPEC_REVIEW_INSTRUCTIONS +
      "\n\nSpec to review:\n" +
      target
    );
  },

  round2A(r1a: string, r1b: string): string {
    return (
      "You are Reviewer A. You and another experienced engineer (Reviewer B) independently reviewed the same spec. Now compare notes.\n\n" +
      "Your review:\n\n" +
      r1a +
      "\n\nReviewer B's review:\n\n" +
      r1b +
      "\n\n" +
      SPEC_CROSS_REVIEW_INSTRUCTIONS_A
    );
  },

  round2B(r1a: string, r1b: string): string {
    return (
      "You are Reviewer B. You and another experienced engineer (Reviewer A) independently reviewed the same spec. Now compare notes.\n\n" +
      "Your review:\n\n" +
      r1b +
      "\n\nReviewer A's review:\n\n" +
      r1a +
      "\n\n" +
      SPEC_CROSS_REVIEW_INSTRUCTIONS_B
    );
  },

  synthesis(r1a: string, r1b: string, r2a: string, r2b: string): string {
    return (
      "You have the complete discussion between two experienced engineers who independently reviewed the spec and then compared notes.\n\n" +
      "Round 1 — Reviewer A (independent review): " +
      r1a +
      "\nRound 1 — Reviewer B (independent review): " +
      r1b +
      "\nRound 2 — Reviewer A (cross-review): " +
      r2a +
      "\nRound 2 — Reviewer B (cross-review): " +
      r2b +
      "\n\nSynthesize into a final spec review report. Include ONLY findings where the reviewers reached agreement or where the evidence clearly supports the finding.\n\n" +
      "## Spec Review\n\n" +
      "**Status:** ✅ Approved | ❌ Issues Found\n\n" +
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
