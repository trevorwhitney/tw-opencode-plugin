---
description: "Turn-based constructive code review — two models debate findings across fixed rounds"
agent: general
return:
  # Round 1: Initial reviews
  - /subtask {as:round1-a,agent:critic-codex} "You are Reviewer A. Perform a thorough code review of the target below.\n\nFocus areas:\n- Bugs and logic errors\n- Security vulnerabilities\n- Performance issues\n- Design and maintainability problems\n- Complexity, point out where it could be simplified\n- Duplication / Reuse failures — does the code introduce logic that already exists elsewhere in the codebase? Are there parallel abstractions that should be consolidated?\n\nBe specific: reference file paths, line numbers, and code snippets. Explain WHY each issue matters and suggest a fix.\n\nReview target:\n$ARGUMENTS"
  - /subtask {as:round1-b,agent:critic-opus} "You are Reviewer B. Another reviewer produced this analysis:\n\n$RESULT[round1-a]\n\nChallenge every finding:\n- Identify false positives and weak reasoning\n- Point out issues they missed entirely\n- Question severity assessments\n- Verify claims against the actual code\n\nBe rigorous. Only valid findings should survive."
  # Round 2: Rebuttal
  - /subtask {as:round2-a,agent:critic-codex} "You are Reviewer A. Your original review:\n\n$RESULT[round1-a]\n\nReviewer B's challenges:\n\n$RESULT[round1-b]\n\nRespond to each challenge:\n- Defend findings with evidence (file paths, logic)\n- Concede where the challenge is valid\n- Add any issues the debate surfaced\n\nDo not be defensive — be accurate."
  - /subtask {as:round2-b,agent:critic-opus} "You are Reviewer B. Your challenges:\n\n$RESULT[round1-b]\n\nReviewer A's rebuttal:\n\n$RESULT[round2-a]\n\nFinal assessment:\n- Which of your challenges were adequately addressed?\n- Which findings should be dropped?\n- Any final issues to add?\n\nProduce your final position."
  # Synthesis — runs in main session with full context
  - "You have the complete debate transcript from a two-model adversarial code review.\n\nRound 1 — Reviewer A (initial): $RESULT[round1-a]\nRound 1 — Reviewer B (challenge): $RESULT[round1-b]\nRound 2 — Reviewer A (rebuttal): $RESULT[round2-a]\nRound 2 — Reviewer B (final): $RESULT[round2-b]\n\nSynthesize into a final code review. Include ONLY findings that survived scrutiny. For each finding:\n- Category (bug/security/performance/design/duplication)\n- Severity (critical/high/medium/low)\n- File and location\n- Description and recommendation\n\nDrop anything that was successfully challenged."
---

Execute the adversarial code review debate for the target specified below.

$ARGUMENTS
