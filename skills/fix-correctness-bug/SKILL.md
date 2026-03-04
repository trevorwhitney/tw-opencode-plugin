---
name: fix-correctness-bug
description: Fix a Loki correctness bug to make the failing test pass (TDD Green phase)
---

# Fix Correctness Bug

Use this skill when a LogQL correctness test is failing and you need to fix the underlying Loki code to make it pass.

## When to Use

- A correctness test is producing mismatched results between engines
- You've already identified the root cause via `explain-correctness-failure`
- You need to make minimal, targeted changes to fix the bug

## Workflow

1. **Understand the failure** — Review the test output and the failing query
2. **Locate the code** — Find the relevant engine code that processes the query
3. **Fix minimally** — Change only what's needed to fix the correctness issue
4. **Verify** — Run the specific test to confirm the fix
5. **Check for regressions** — Run the broader test suite

## Principles

- Fix the root cause, not symptoms
- Minimal diff — don't refactor while fixing
- Ensure both engines produce identical results
- Add test coverage if the failure case wasn't covered
