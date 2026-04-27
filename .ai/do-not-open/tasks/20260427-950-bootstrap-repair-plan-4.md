---
status: closed
depends_on: []
closed_at: 2026-04-27T01:50:26.975Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 950 — Bootstrap Doctor Repair Plan — Task 4

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/doctor.ts`

## Context

Per-check command metadata should be gathered into an ordered plan so humans and tools can consume one field.

## Goal

Emit `repair_plan` from bootstrap doctor.

## Required Work

1. Include only non-passing checks with structured remediation.
2. Preserve check order.
3. Render repair plan in human output.

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

Added `repair_plan` to `BootstrapDoctorReport` and human output.

## Verification

Focused tests assert repair plan entries.

## Acceptance Criteria

- [x] JSON output includes `repair_plan`.
- [x] Healthy output has empty `repair_plan`.
- [x] Human output renders repair commands when present.
