---
status: closed
depends_on: []
closed_at: 2026-04-27T00:51:43.887Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 913 — Git Commit Authority Preflight — Task 2

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/chapter-preflight.ts`
- `docs/concepts/runtime-usc-boundary.md`

## Context

Commit is an Act/publication crossing. If `.git` cannot accept metadata writes, chapter completion cannot be published even when code and verification are complete.

## Goal

Detect commit authority before the final `git add`/`git commit` step.

## Required Work

1. Detect whether cwd is inside a Git work tree.
2. Resolve the absolute Git metadata directory.
3. Probe Git metadata writability with a short-lived preflight file.
4. Return remediation when metadata is not writable.

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

Added `--expect-commit` behavior that checks Git work tree state and verifies metadata writability by creating and deleting a unique probe file in the absolute Git directory.

## Verification

Focused tests cover available commit authority and missing Git work tree failure.

## Acceptance Criteria

- [x] `--expect-commit` checks Git work tree membership.
- [x] `--expect-commit` checks Git metadata writability.
- [x] Failure includes actionable remediation.
