---
status: closed
depends_on: []
closed_at: 2026-04-27T01:42:51.505Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 942 — Bootstrap Doctor Ergonomic Readiness — Task 1

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/doctor.ts`

## Context

Fresh checkout readiness was implicit and failures appeared later as build or native binding errors.

## Goal

Add a config-independent bootstrap doctor mode.

## Required Work

1. Add `bootstrap` and `cwd` options.
2. Bypass operation config when bootstrap mode is selected.
3. Return bounded healthy/degraded report.

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

Added `doctorBootstrap()` and routed `doctorCommand({ bootstrap: true })` to it before config/site diagnosis.

## Verification

Focused tests and live `doctor --bootstrap` passed.

## Acceptance Criteria

- [x] Bootstrap mode does not require config.
- [x] Bootstrap mode accepts cwd.
- [x] Bootstrap result has bounded summary.
