---
status: closed
depends_on: []
closed_at: 2026-04-27T01:24:14.146Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 932 — Work Next Decision Trace — Task 1

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/work-next.ts`

## Context

The unified command selected work but did not explain which higher-priority zones were checked first.

## Goal

Define a stable checked-zone trace for `work-next`.

## Required Work

1. Add trace records with `zone`, `status`, and optional reason/ref.
2. Keep trace bounded and finite.
3. Include trace in JSON and human output.

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

Added `WorkNextCheckedZone` and human `Checked:` rendering.

## Verification

Typecheck and focused tests passed.

## Acceptance Criteria

- [x] Trace records are bounded.
- [x] Trace records have stable fields.
- [x] Human output includes checked zones.
