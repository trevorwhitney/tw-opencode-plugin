---
name: tdd-workflow
description: Use this skill when writing new features, fixing bugs, or refactoring code. Enforces test-driven development with 80%+ coverage including unit, integration, and E2E tests.
---

# Test-Driven Development Workflow

Enforces TDD principles for all code changes.

## When to Use

- Writing new features or functionality
- Fixing bugs
- Refactoring existing code
- Adding API endpoints or components

## TDD Cycle

### 1. Red — Write Failing Tests First

```
Define the expected behavior before writing any implementation.
Write tests that fail because the code doesn't exist yet.
```

### 2. Green — Minimal Implementation

```
Write the minimum code needed to make tests pass.
Don't optimize or refactor yet.
```

### 3. Refactor — Improve While Green

```
Clean up code quality while keeping all tests passing.
Remove duplication, improve naming, optimize.
```

## Coverage Requirements

- Minimum 80% coverage (unit + integration)
- All edge cases covered
- Error scenarios tested
- Boundary conditions verified

## Test Organization

- Unit tests: alongside source files or in `__tests__/`
- Integration tests: in `test/` or `integration/`
- E2E tests: in `e2e/`

## Principles

- Tests BEFORE code — always
- One assertion focus per test
- Arrange-Act-Assert structure
- Independent tests (no shared state)
- Mock external dependencies
- Test behavior, not implementation details
