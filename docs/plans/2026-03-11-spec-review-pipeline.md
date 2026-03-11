# Spec Review Pipeline + Upstream Skill Unforking

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a `/spec-review` command to the review pipeline, then replace all forked superpowers skills with upstream originals by using system prompt injection to reroute review dispatches.

**Architecture:** Create a new `specReviewPrompts` PromptSet following the existing code-review/plan-review pattern. Add system prompt injection rules that redirect superpowers' subagent-based review dispatches to our `/spec-review`, `/plan-review`, and `/code-review` commands. Remove forked skills and skip logic from deploy.sh.

**Tech Stack:** TypeScript (OpenCode plugin SDK), shell (deploy.sh)

**Design decision — per-task reviews stay single-subagent:** The upstream `subagent-driven-development` skill dispatches five distinct reviewer types. Three are holistic reviews (spec-document, plan-document, final-code) that benefit from multi-model cross-examination. Two are per-task gates (spec-compliance via `spec-reviewer-prompt.md`, code-quality via `code-quality-reviewer-prompt.md`) that run after every single task step. Routing per-task reviews through the multi-model pipeline would be prohibitively expensive and slow. The routing rules only redirect the three holistic reviews; per-task reviews remain single-subagent by design.

---

### Task 1: Create spec-review prompt set, wire into plugin, add command

**Files:**
- Create: `src/review/prompts/spec-review.ts`
- Modify: `src/review/prompts/index.ts`
- Modify: `src/index.ts:6,118-145` (import + tool registration)
- Create: `commands/spec-review.md`

**Reuse:**
- `src/review/prompts/plan-review.ts` — follow the exact same structure (local discussion rules, local cross-review instructions, exported PromptSet). Do not import from `shared.ts` — it contains code-review-specific language ("show the code that proves it") that doesn't apply to spec review.
- `commands/plan-review.md` — same command pattern

**Step 1: Create `src/review/prompts/spec-review.ts`**

Follow `plan-review.ts` structure. Adapt focus areas from `brainstorming/spec-document-reviewer-prompt.md` categories (Completeness, Coverage, Consistency, Clarity, YAGNI, Scope, Architecture). Use "quote the spec to prove it" in discussion rules instead of "quote the plan." Synthesis output should use Approved/Issues Found verdict format with surviving findings and advisory recommendations.

**Step 2: Add export to `src/review/prompts/index.ts`**

```typescript
export { specReviewPrompts } from "./spec-review.js";
```

**Step 3: Update tool registration in `src/index.ts`**

1. Add `specReviewPrompts` to the import from `"./review/prompts/index.js"`
2. Change the `type` enum from `["code-review", "plan-review"]` to `["code-review", "plan-review", "spec-review"]`
3. Update the `execute` function to handle the new type:
```typescript
const prompts =
  args.type === "code-review"
    ? codeReviewPrompts
    : args.type === "plan-review"
      ? planReviewPrompts
      : specReviewPrompts;
```
4. Update the tool description to mention `/spec-review`

**Step 4: Create `commands/spec-review.md`**

```markdown
---
description: "Spec review — two reviewers independently review, cross-examine, then synthesize"
---

Use the review-pipeline tool with type "spec-review" and the following target:

$ARGUMENTS

After the tool returns, synthesize the results into a final spec review report with a clear Approved/Issues Found verdict.
```

**Step 5: Commit**

```bash
git add src/review/prompts/spec-review.ts src/review/prompts/index.ts src/index.ts commands/spec-review.md
git commit -m "feat: add spec-review to review pipeline"
```

---

### Task 2: Add system prompt injection for review routing

**Files:**
- Modify: `src/index.ts` (add `REVIEW_ROUTING_RULES` constant + inject in system prompt transform)

**Reuse:**
- `src/index.ts` — the `TOOL_PRIORITY_RULES` constant and `experimental.chat.system.transform` hook are the exact pattern to follow

**Step 1: Add a `REVIEW_ROUTING_RULES` constant in `src/index.ts`**

Define it right after `TOOL_PRIORITY_RULES`. Use intent-based language, not exact-match strings — upstream skills phrase dispatch instructions inconsistently (parenthetical references, graphviz diagram node labels, prose).

```typescript
const REVIEW_ROUTING_RULES = `<review-routing-rules>
## Review Routing Rules

These rules override superpowers skill review dispatch instructions. Follow them unconditionally.

When a superpowers skill instructs you to dispatch a reviewer subagent for a **spec document**, **plan document**, or **final code review of an entire implementation**, use the corresponding slash command instead of dispatching a Task tool subagent:

| Review type | Run this command |
|---|---|
| Spec document review (e.g. "dispatch spec-document-reviewer") | \`/spec-review <spec-file-path-or-content>\` |
| Plan document review (e.g. "dispatch plan-document-reviewer") | \`/plan-review <plan-content>\` |
| Final holistic code review (e.g. "dispatch final code reviewer") | \`/code-review <git-diff-or-target>\` |

These commands run a multi-model review pipeline (two independent reviewers + cross-examination + synthesis).

**Does NOT apply to per-task reviews.** Per-task spec-compliance reviews (spec-reviewer-prompt.md) and per-task code-quality reviews (code-quality-reviewer-prompt.md) within the subagent-driven-development workflow should continue using single-subagent dispatch as the skill instructs.

**The review loop logic from the skill still applies** — if the review returns issues, fix them and re-run the command. The command replaces only the dispatch mechanism, not the surrounding workflow.
</review-routing-rules>`;
```

**Step 2: Inject it in the system prompt transform**

Add `output.system.push(REVIEW_ROUTING_RULES);` right after the existing `output.system.push(BEADS_AWARENESS);` line.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add system prompt review routing to replace skill forks"
```

---

### Task 3: Remove forked skills, update deploy.sh, add stale cleanup

**Files:**
- Delete: `skills/writing-plans/` (entire directory)
- Delete: `skills/subagent-driven-development/` (entire directory)
- Modify: `scripts/deploy.sh:141` (clear SUPERPOWERS_SKIP_SKILLS)
- Modify: `scripts/deploy.sh` (add cleanup for stale skill directories, near existing workmux cleanup at lines 168-184)

**Reuse:**
- `scripts/deploy.sh:168-184` — the workmux legacy cleanup pattern. Follow the same pattern for stale skill directories.

**Step 1: Verify upstream skills exist**

```bash
ls ~/.config/opencode/superpowers/skills/writing-plans/SKILL.md
ls ~/.config/opencode/superpowers/skills/subagent-driven-development/SKILL.md
```

**Step 2: Delete the forked skills from the plugin repo**

```bash
rm -rf skills/writing-plans
rm -rf skills/subagent-driven-development
```

**Step 3: Clear the skip list in deploy.sh**

Change line 141 from:
```bash
SUPERPOWERS_SKIP_SKILLS="subagent-driven-development writing-plans"
```
to:
```bash
SUPERPOWERS_SKIP_SKILLS=""
```

**Step 4: Add stale skill cleanup to deploy.sh**

After the workmux cleanup section (around line 184), add cleanup for skills that the plugin used to deploy at top-level but now come from superpowers:

```bash
# ── Stale skill cleanup ──────────────────────────────────────
# These skills were previously deployed by the plugin to the top-level skills
# directory. They now come from upstream superpowers under skills/superpowers/.
for stale_skill in writing-plans subagent-driven-development; do
	if [ -d "${SKILLS_TARGET}/${stale_skill}" ]; then
		echo "  [remove] stale plugin skill override: ${stale_skill}"
		rm -rf "${SKILLS_TARGET}/${stale_skill}"
	fi
done
```

**Step 5: Commit**

```bash
git add -A skills/writing-plans skills/subagent-driven-development scripts/deploy.sh
git commit -m "refactor: unfork superpowers skills, use system prompt routing instead"
```

---

### Task 4: Build, deploy, and verify

**Files:**
- None (build + integration verification)

**Step 1: Build the plugin**

```bash
bun run build
```

Expected: No type errors.

**Step 2: Deploy**

```bash
./scripts/deploy.sh
```

Expected:
- `spec-review.md` copied to commands
- `superpowers/writing-plans` and `superpowers/subagent-driven-development` copied (no longer skipped)
- Stale `writing-plans` and `subagent-driven-development` removed from top-level skills

**Step 3: Verify final state**

```bash
# All three review commands exist
ls ~/.config/opencode/command/{code-review,plan-review,spec-review}.md

# Upstream skills deployed (not forked versions)
grep "Dispatch plan-document-reviewer subagent" ~/.config/opencode/skills/superpowers/writing-plans/SKILL.md
grep "Dispatch final code reviewer subagent" ~/.config/opencode/skills/superpowers/subagent-driven-development/SKILL.md

# No stale overrides
[ ! -d ~/.config/opencode/skills/writing-plans ] && echo "OK: no stale writing-plans"
[ ! -d ~/.config/opencode/skills/subagent-driven-development ] && echo "OK: no stale subagent-driven-development"
```
