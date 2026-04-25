.ai/do-not-open/tasks/20260416-080-add-ui-authority-guardrails-and-regression-tests.md
# Task 080 — Add UI Authority Guardrails and Regression Tests

## Objective
Make UI authority boundaries explicit, enforceable, and regression-resistant.

## Why
Current safety relies mostly on convention plus `operator-actions.ts`. There is not yet strong proof that future changes cannot:
- add direct mutation paths into observation
- bypass action validation
- introduce unsafe controls into the shell
- blur read/write boundaries

## Required Changes
- Add tests that fail if observation server registers non-GET routes
- Add tests that fail if UI shell contains forbidden mutation controls
- Add tests that assert all UI-triggered mutations pass only through operator action admission
- Add allowlist of permitted operator actions
- Add explicit rejection tests for:
  - unknown action types
  - malformed payloads
  - direct write attempts to observation routes
- Optionally add lint/static checks for route registration patterns

## Acceptance Criteria
- CI fails if observation server gains write authority
- CI fails if UI introduces non-allowlisted controls
- CI fails if a new mutation path bypasses operator action admission
- Tests cover both positive and negative authority cases

## Invariant
UI authority is minimal, explicit, and mechanically guarded.