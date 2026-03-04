---
name: security-review
description: Use this skill when adding authentication, handling user input, working with secrets, creating API endpoints, or implementing payment/sensitive features. Provides comprehensive security checklist and patterns.
---

# Security Review

Comprehensive security checklist for code changes involving authentication, user input, secrets, APIs, or sensitive features.

## When to Use

- Adding or modifying authentication/authorization
- Handling user input (forms, query params, API bodies)
- Working with secrets, tokens, or credentials
- Creating or modifying API endpoints
- Implementing payment or other sensitive features

## Checklist

### Input Validation
- All user input validated and sanitized
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)
- Path traversal prevention
- Request size limits enforced

### Authentication & Authorization
- Auth checks on every protected endpoint
- Token expiration and rotation
- Password hashing (bcrypt/argon2, never plaintext)
- Rate limiting on auth endpoints
- Session management (secure cookies, httpOnly, sameSite)

### Secrets Management
- No hardcoded secrets in source
- Secrets loaded from environment or vault
- `.env` files in `.gitignore`
- Secrets rotated on suspected compromise

### API Security
- CORS configured restrictively
- HTTPS enforced
- Response headers set (CSP, HSTS, X-Frame-Options)
- Error messages don't leak internals
- Pagination to prevent data dumps

### Dependencies
- No known vulnerabilities (`npm audit` / `go vuln`)
- Minimal dependency surface
- Lock files committed
