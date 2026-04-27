---
status: closed
depends_on: []
closed_at: 2026-04-27T01:50:22.713Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 947 — Bootstrap Doctor Repair Plan — Task 1

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/doctor.ts`

## Context

Human remediation strings are not enough for an ergonomic doctor surface; agents and UIs need structured commands.

## Goal

Extend doctor checks with structured remediation command metadata.

## Required Work

1. Add `remediation_command`.
2. Add `remediation_args`.
3. Keep existing human remediation strings.

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

Extended `DoctorCheck` with optional `remediation_command` and `remediation_args`.

## Verification

Typecheck passed.

## Acceptance Criteria

- [x] Doctor checks support command strings.
- [x] Doctor checks support argv arrays.
- [x] Existing remediation strings remain available.
