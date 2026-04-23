---
status: opened
created: 2026-04-24
depends_on: [526, 527]
---

# Task 528 - Workbench Control Wiring And Validation

## Goal

Wire the first bounded workbench controls through governed operators and validate the end-to-end request/response behavior.

## Required Work

1. Implement the minimal control set for v0:
   - assign,
   - done,
   - idle,
   - promote,
   - pause,
   - resume.
2. Ensure each control routes through the existing governed mutation path.
3. Refresh observation surfaces after successful control calls.
4. Add focused tests for:
   - request validation,
   - operator routing,
   - error surfacing,
   - post-mutation refresh behavior where practical.

## Acceptance Criteria

- [ ] Minimal v0 controls are wired.
- [ ] All controls route through existing governed operators.
- [ ] Focused validation tests exist and pass.
- [ ] No hidden direct store mutation is introduced.
- [ ] Verification or bounded blocker evidence is recorded.

