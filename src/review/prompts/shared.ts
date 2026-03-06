export const DISCUSSION_RULES = `\
Before agreeing or conceding, verify the claim against actual code. \
No performative agreement -- don't say things like "great point" or \
"you're absolutely right." If you change your mind, state what you \
checked and why you were wrong. If the other reviewer is wrong, show \
the code that proves it.`;

export const CROSS_REVIEW_INSTRUCTIONS_A = `\
Respond as a peer:
- Where do you agree with Reviewer B?
- Where do you disagree, and why? Provide evidence (file paths, line numbers, code).
- Did Reviewer B catch something you missed? Acknowledge it.
- Did they miss something important? Point it out.
- Where severity assessments differ, explain your reasoning.

The goal is accuracy, not winning. Re-read the code if needed.

${DISCUSSION_RULES}`;

export const CROSS_REVIEW_INSTRUCTIONS_B = `\
Respond as a peer:
- Where do you agree with Reviewer A?
- Where do you disagree, and why? Provide evidence (file paths, line numbers, code).
- Did Reviewer A catch something you missed? Acknowledge it.
- Did they miss something important? Point it out.
- Where severity assessments differ, explain your reasoning.

The goal is accuracy, not winning. Re-read the code if needed.

${DISCUSSION_RULES}`;
