---
status: closed
depends_on: []
closed_at: 2026-04-27T00:51:45.371Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 914 — Git Commit Authority Preflight — Task 3

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/chapter-preflight.ts`
- `packages/layers/cli/src/commands/sites.ts`

## Context

The chapter contract now includes pushing after each chapter. Commit authority alone is insufficient if the branch has no upstream.

## Goal

Detect push readiness when the operator expects chapter publication to include `git push`.

## Required Work

1. Add `--expect-push` semantics.
2. Ensure push preflight includes commit metadata checks.
3. Check whether the current branch has an upstream.
4. Return a bounded failure when upstream is missing.

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

Implemented `--expect-push`; it triggers the Git metadata checks and additionally verifies `@{u}` through `git rev-parse`.

## Verification

Focused tests verify missing upstream produces a failing `git_upstream` check.

## Acceptance Criteria

- [x] `--expect-push` checks upstream configuration.
- [x] Missing upstream is represented as a named failure, not raw stderr.
- [x] Push preflight also performs the commit-readiness checks.
