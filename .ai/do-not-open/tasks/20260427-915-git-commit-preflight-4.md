---
status: closed
depends_on: []
closed_at: 2026-04-27T00:51:46.951Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 915 — Git Commit Authority Preflight — Task 4

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/chapter-register.ts`
- `packages/layers/cli/src/lib/cli-output.ts`

## Context

The preflight must be discoverable from the chapter command family and must obey finite CLI output discipline.

## Goal

Expose the preflight through the chapter CLI with concise options and bounded output.

## Required Work

1. Register `narada chapter preflight <range>`.
2. Add `--expect-commit` and `--expect-push` options.
3. Support JSON and human output through existing finite command output admission.

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

Registered `chapter preflight` in `chapter-register.ts` using `directCommandAction` and `emitCommandResult`.

## Verification

Typecheck verified the command registration and option plumbing.

## Acceptance Criteria

- [x] CLI exposes `narada chapter preflight <range>`.
- [x] CLI exposes `--expect-commit`.
- [x] CLI exposes `--expect-push`.
- [x] Output uses the finite command result path.
