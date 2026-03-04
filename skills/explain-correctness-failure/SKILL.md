---
name: explain-correctness-failure
description: Figure out exactly why a LogQL Correctness Test in Loki is failing.
---

# Explain Correctness Failure

Use this skill to analyze and explain why a LogQL correctness test is producing different results between Loki query engines.

## When to Use

- A correctness test shows mismatched results
- You need to understand the root cause before attempting a fix
- You want a clear explanation of the divergence

## Workflow

1. **Examine the test output** — Compare results from both engines
2. **Identify the query** — Understand the LogQL query being tested
3. **Trace execution** — Follow the query through both code paths
4. **Pinpoint divergence** — Find exactly where results differ
5. **Explain clearly** — Describe the root cause in plain language

## What to Report

- The specific LogQL construct that triggers the mismatch
- Which engine is correct and which is wrong (or if both are wrong)
- The code path where the divergence occurs
- Whether this is a known pattern or a new class of bug
