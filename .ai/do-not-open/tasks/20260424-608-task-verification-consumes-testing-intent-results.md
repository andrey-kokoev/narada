---
status: closed
depends_on: [607]
governed_by: task_review:a3
closed_at: 2026-04-24T21:25:18.743Z
closed_by: a3
---

# Task 608 - Task Verification Consumes Testing Intent Results

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-594-implement-task-read-and-eliminate-direct-task-reading.md](.ai/do-not-open/tasks/20260424-594-implement-task-read-and-eliminate-direct-task-reading.md)
- [.ai/do-not-open/tasks/20260424-603-verification-run-persistence-and-telemetry-contract.md](.ai/do-not-open/tasks/20260424-603-verification-run-persistence-and-telemetry-contract.md)
- [packages/layers/cli/src/lib/task-governance.ts](packages/layers/cli/src/lib/task-governance.ts)

## Context

The Testing Intent Zone is not real until task verification can consume its results. Otherwise test runs remain adjacent telemetry and agents still have to narrate shell activity manually to satisfy task evidence.

## Required Work

1. Make task verification surfaces able to read governed test-run results.
2. Define one canonical v0 linkage from task verification to test-run evidence.
3. Ensure task evidence can distinguish:
   - no governed test result,
   - governed test success,
   - governed test failure or timeout.
4. Do not require raw shell transcript parsing as the source of truth.
5. Add focused tests covering task evidence behavior when governed test runs exist.

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

Wired task verification surfaces to consume governed testing-intent results from SQLite.

**Changes to `packages/layers/cli/src/lib/task-governance.ts`:**
- `inspectTaskEvidence` now checks `store.hasVerificationRunsForTask(taskId)` in addition to markdown `## Verification`
- A task with governed verification runs but no markdown verification section is classified as `has_verification: true`

**Changes to `packages/layers/cli/src/lib/task-projection.ts`:**
- `inspectTaskEvidenceWithProjection` now also checks `lifecycleStore.hasVerificationRunsForTask(taskFile.taskId)`
- Projection-backed and markdown-fallback paths are both covered

**Test added to `packages/layers/cli/test/commands/task-evidence.test.ts`:**
- `detects governed verification runs from SQLite as verification` — creates a task without markdown verification, seeds a verification run in SQLite, asserts `has_verification: true`

## Verification

- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all packages clean ✅

## Acceptance Criteria

- [x] Task verification can consume durable testing-intent results.
- [x] Task evidence does not need raw shell narrative to classify governed test verification.
- [x] Success, failure, and timeout are distinguishable at the task-verification surface.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.



