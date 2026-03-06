---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** This should be run in a dedicated worktree (created by brainstorming skill).

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`

## Codebase Research (before writing the plan)

Before writing any tasks, search the codebase for:
- Existing utilities, helpers, or abstractions that tasks should reuse
- Naming conventions, error handling patterns, and architectural patterns tasks must follow
- Test patterns and infrastructure (test helpers, fixtures, factories)

Record what you find. This informs the plan — tasks should reference existing code rather than reinvent it.

If nothing relevant exists (greenfield work, new domain), that's fine — note it and move on.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Reuse:** (from codebase research)
- `src/utils/validate.py:validate_input()` — use for input validation, don't write your own
- `tests/conftest.py:mock_client` — use this existing fixture
- (or "None — greenfield" if nothing applies)

**Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

**Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## Remember
- Exact file paths always
- Complete code in plan (not "add validation")
- Exact commands with expected output
- Reference relevant skills with @ syntax
- DRY, YAGNI, TDD, frequent commits
- For every new function/class/abstraction: confirm nothing equivalent already exists in the codebase
- Prefer extending existing code over creating parallel implementations

## Plan Review

After saving the plan, run a multi-model adversarial review before offering execution choices.

**Run:** `/plan-review` with the full plan text as the argument.

The `/plan-review` command dispatches two critic models (Opus and Codex) in a structured debate:
1. Critic A performs initial critique (bloat, scope creep, YAGNI, complexity, gaps)
2. Critic B challenges every finding
3. Two rounds of rebuttal produce surviving findings
4. Synthesis produces a revised plan

**After the debate completes:**
- If the revised plan has meaningful changes, update `docs/plans/<filename>.md` with the revised version and commit
- If the original plan was already lean, note that and proceed
- Either way, continue to Execution Handoff

## Execution Handoff

After the plan review, offer execution choice:

**"Plan complete and saved to `docs/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Stay in this session
- Fresh subagent per task + code review

**If Parallel Session chosen:**
- Guide them to open new session in worktree
- **REQUIRED SUB-SKILL:** New session uses superpowers:executing-plans
