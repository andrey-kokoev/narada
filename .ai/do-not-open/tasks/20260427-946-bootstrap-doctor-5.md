---
status: closed
depends_on: []
closed_at: 2026-04-27T01:42:58.587Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 946 — Bootstrap Doctor Ergonomic Readiness — Task 5

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/test/commands/doctor.test.ts`

## Context

Bootstrap readiness should be regression-tested because it protects against future fresh-checkout friction.

## Goal

Verify bootstrap doctor behavior.

## Required Work

1. Test config-independent bootstrap checks.
2. Test degraded remediation output.
3. Run live command against this checkout.
4. Run full verification gate.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

Added two doctor tests and exercised the live bootstrap doctor command after build.

## Verification

Focused doctor tests passed 8/8. Live bootstrap doctor returned healthy.

## Acceptance Criteria

- [x] Bootstrap tests pass.
- [x] Live bootstrap command passes.
- [x] Full verification passes.
