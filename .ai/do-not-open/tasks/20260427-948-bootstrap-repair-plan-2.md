---
status: closed
depends_on: []
closed_at: 2026-04-27T01:50:24.058Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 948 — Bootstrap Doctor Repair Plan — Task 2

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/doctor.ts`

## Context

Install/build/bin-link failures are common fresh checkout blockers.

## Goal

Populate structured repair commands for install and build posture.

## Required Work

1. Add repair command for missing dependencies.
2. Add repair command for missing CLI build.
3. Add repair command for missing shell bin link.

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

Added `pnpm install`, `pnpm -r build`, and `pnpm run narada:install-shim` command metadata.

## Verification

Focused degraded bootstrap test asserts install/build repair plan entries.

## Acceptance Criteria

- [x] Missing dependencies has `pnpm install`.
- [x] Missing CLI build has `pnpm -r build`.
- [x] Missing bin link has shim guidance command.
