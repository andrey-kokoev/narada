---
status: opened
created: 2026-04-24
depends_on: [525]
---

# Task 526 - Workbench HTTP Adapter

## Goal

Implement the thin localhost HTTP adapter for the self-build workbench, using existing governed read and mutation surfaces rather than inventing new authority.

## Required Work

1. Implement the bounded GET/POST adapter described in Task 523 / 524.
2. Keep it localhost-only and explicit about source trust.
3. Reuse existing CLI/runtime read helpers where possible.
4. Reuse existing governed mutation operators for POST routes.
5. Add focused tests for request/response shape and route validation.

## Acceptance Criteria

- [ ] Localhost HTTP adapter exists.
- [ ] Observation routes return data grounded in existing governed state.
- [ ] Mutation routes delegate to existing governed operators.
- [ ] Focused tests exist and pass.
- [ ] Verification or bounded blocker evidence is recorded.

