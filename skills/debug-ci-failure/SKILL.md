---
name: debug-ci-failure
description: Debug a failing test on CI and come up with a fix.
---

# Debug CI Failure

Use this skill when a test is failing on CI but you need to understand why and produce a fix.

## When to Use

- A CI pipeline is red with test failures
- Tests pass locally but fail in CI (or vice versa)
- You need to diagnose flaky or environment-dependent failures

## Workflow

1. **Get the CI logs** — Examine the full failure output
2. **Identify the failing test(s)** — Which test, which assertion
3. **Reproduce locally** — Try to reproduce with the same conditions
4. **Analyze differences** — CI vs local environment, timing, data
5. **Fix and verify** — Make the minimal fix and confirm it resolves the failure

## Common CI Failure Patterns

- Race conditions / timing-dependent tests
- Environment variable differences
- Resource constraints (memory, disk, CPU)
- Dependency version mismatches
- Flaky network calls
- Order-dependent test execution
