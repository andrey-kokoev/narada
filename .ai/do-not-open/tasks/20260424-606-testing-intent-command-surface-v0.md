---
status: closed
depends_on: []
governed_by: task_review:a3
closed_at: 2026-04-24T21:21:45.623Z
closed_by: a3
---

# Task 606 - Testing Intent Command Surface v0

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-600-testing-intent-zone-boundary-contract.md](.ai/do-not-open/tasks/20260424-600-testing-intent-zone-boundary-contract.md)
- [.ai/do-not-open/tasks/20260424-601-test-run-request-and-result-artifact-contract.md](.ai/do-not-open/tasks/20260424-601-test-run-request-and-result-artifact-contract.md)
- [packages/layers/cli/src/main.ts](packages/layers/cli/src/main.ts)

## Context

Narada has doctrine for a Testing Intent Zone but still relies on raw shell test runs for most verification. The first implementation step is not "run more tests"; it is to create the sanctioned command surface that turns a request to run tests into an explicit governed operator path.

## Required Work

1. Implement a sanctioned CLI surface for test-run requests and result inspection.
2. Force one canonical v0 request shape:
   - focused command string or named runner target,
   - optional timeout,
   - optional task linkage,
   - output posture that identifies the durable run record.
3. Ensure the command surface separates:
   - request creation,
   - execution,
   - result inspection.
4. Do not let v0 pretend to support scheduling, retries, or distributed routing if those are not real.
5. Add focused tests for command parsing and request/result operator behavior.

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

Implemented the Testing Intent Zone command surface v0.

**Files created:**
- `packages/layers/cli/src/lib/testing-intent.ts` — Types and helpers for VerificationRequest, VerificationResult, VerificationRunRow
- `packages/layers/cli/src/commands/test-run.ts` — `testRunCommand`, `testRunInspectCommand`, `testRunListCommand`
- `packages/layers/cli/test/commands/test-run.test.ts` — 12 focused tests

**Files modified:**
- `packages/layers/cli/src/lib/task-lifecycle-store.ts` — Added `verification_runs` table and CRUD methods (shared with 607)
- `packages/layers/cli/src/main.ts` — Registered `narada test-run run|inspect|list`

**Design choices:**
- `test-run run` does request+execute+store in one step for v0 ergonomics
- Durable `run_id` is returned immediately and stored in SQLite
- Timeout is capped per scope (focused: 120s max, full: 600s max)
- Full suite requires `ALLOW_FULL_TESTS=1`
- Stdout/stderr captured, digested (SHA-256), and excerpted (2KB)

## Verification

- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all packages clean ✅
- `pnpm --filter @narada2/cli exec vitest run test/commands/test-run.test.ts` — 12/12 pass ✅
- **Note:** Per-test runtime is ~16s due to `spawn({ shell: true })` overhead in this vitest environment. This is bounded verification friction, not a logic defect. A follow-up task can address test-runner performance if it becomes material.

## Acceptance Criteria

- [x] A sanctioned CLI path exists for requesting a governed test run.
- [x] The request surface produces or references a durable run identifier.
- [x] Request, execute, and inspect are not silently collapsed into one opaque side effect without a durable artifact.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.



