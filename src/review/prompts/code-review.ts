import { CROSS_REVIEW_INSTRUCTIONS_A, CROSS_REVIEW_INSTRUCTIONS_B } from "./shared.js";
import type { PromptSet } from "../types.js";

export const CODE_REVIEW_INSTRUCTIONS = `\
# Code Review Instructions

Read this file before performing your review. Follow these instructions precisely.

## Review Focus Areas

Examine the code for each of the following. Do not skip any category.

**Bugs & Logic Errors:**
- Incorrect control flow, off-by-one, nil/null dereference
- Race conditions, deadlocks, resource leaks
- Edge cases that produce wrong results

**Security:**
- Injection (SQL, command, template)
- Authentication/authorization gaps
- Secrets in code, insecure defaults
- Input validation missing or insufficient

**Performance:**
- Unnecessary allocations, copies, or conversions
- O(n^2) or worse where O(n) is possible
- Missing caching, redundant I/O
- Unbounded growth (memory, goroutines, connections)

**Design & Maintainability:**
- Clean separation of concerns?
- Sound abstraction boundaries?
- Proper error handling with context?
- Type safety and contracts enforced?

**Complexity:**
- Can any function/block be simplified?
- Nested conditionals that should be early returns?
- Overly clever code that obscures intent?

**Duplication & Reuse:**
- Does the change introduce logic that already exists elsewhere?
- Are there parallel abstractions that should be consolidated?
- DRY principle followed?

**Testing:**
- Tests actually test logic (not just mocks)?
- Edge cases and error paths covered?
- Integration tests where needed?

**Requirements Fit:**
- Implementation matches stated intent?
- No scope creep?
- Breaking changes documented?

## How to Gather Context

If you are given a specific target (file paths, PR URL, commit range), use that directly.

If no specific target is given, determine what to review:
\`\`\`bash
# Find the base branch
git log --oneline --graph -20

# Diff against base
git diff main...HEAD --stat
git diff main...HEAD
\`\`\`

Read the changed files in full to understand surrounding context, not just the diff.

## Output Format

For each finding, provide ALL of the following:

1. **Category** — one of: bug, security, performance, design, complexity, duplication, testing, requirements
2. **Severity** — one of:
   - **Critical** — bugs, security issues, data loss risks, broken functionality
   - **High** — architecture problems, missing error handling, test gaps
   - **Medium** — design improvements, simplification opportunities
   - **Low** — style, minor optimization, documentation
3. **Location** — \`file:line\` or \`file:line-line\`
4. **Description** — what is wrong and WHY it matters
5. **Recommendation** — specific fix, not vague ("improve error handling")

Also note **strengths** — what is well done. Be specific with file references.

## Rules

**DO:**
- Reference file paths, line numbers, and code snippets for every finding
- Explain WHY each issue matters, not just WHAT
- Categorize by actual severity — not everything is Critical
- Acknowledge what is well done
- Read surrounding code before judging a change in isolation

**DO NOT:**
- Say "looks good" without checking each focus area
- Mark style nitpicks as Critical or High
- Give feedback on code you did not actually read
- Be vague — every finding needs a location and a concrete recommendation
- Invent issues to appear thorough — if the code is good, say so`;

export const codeReviewPrompts: PromptSet = {
  round1A(target: string): string {
    return (
      "You are Reviewer A — an experienced engineer performing an independent code review.\n\n" +
      CODE_REVIEW_INSTRUCTIONS +
      "\n\nReview target:\n" +
      target
    );
  },

  round1B(target: string): string {
    return (
      "You are Reviewer B — an experienced engineer performing an independent code review.\n\n" +
      CODE_REVIEW_INSTRUCTIONS +
      "\n\nReview target:\n" +
      target
    );
  },

  round2A(r1a: string, r1b: string): string {
    return (
      "You are Reviewer A. You and another experienced engineer (Reviewer B) independently reviewed the same code. Now compare notes.\n\n" +
      "Your review:\n\n" +
      r1a +
      "\n\nReviewer B's review:\n\n" +
      r1b +
      "\n\n" +
      CROSS_REVIEW_INSTRUCTIONS_A
    );
  },

  round2B(r1a: string, r1b: string): string {
    return (
      "You are Reviewer B. You and another experienced engineer (Reviewer A) independently reviewed the same code. Now compare notes.\n\n" +
      "Your review:\n\n" +
      r1b +
      "\n\nReviewer A's review:\n\n" +
      r1a +
      "\n\n" +
      CROSS_REVIEW_INSTRUCTIONS_B
    );
  },

  synthesis(r1a: string, r1b: string, r2a: string, r2b: string): string {
    return (
      "You have the complete conversation between two experienced reviewers who independently reviewed the code and then discussed their findings.\n\n" +
      "Round 1 — Reviewer A (independent review): " +
      r1a +
      "\nRound 1 — Reviewer B (independent review): " +
      r1b +
      "\nRound 2 — Reviewer A (cross-review): " +
      r2a +
      "\nRound 2 — Reviewer B (cross-review): " +
      r2b +
      "\n\nSynthesize into a final code review report. Include ONLY findings where the reviewers reached agreement or where the evidence clearly supports the finding. For each:\n" +
      "- Category (bug/security/performance/design/complexity/duplication/testing)\n" +
      "- Severity (critical/high/medium/low)\n" +
      "- File and location\n" +
      "- Description and recommendation\n\n" +
      "Also include a Strengths section for what was well done.\n\n" +
      "Drop anything that was resolved through discussion. End with a clear verdict: Ready to merge? Yes / No / With fixes."
    );
  },
};
