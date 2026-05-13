---
status: closed
criteria_proved_by: operator
criteria_proved_at: 2026-05-13T00:17:05.566Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T00:17:21.660Z
closed_by: operator
closure_mode: peer_reviewed
reopened_at: 2026-04-29T18:53:36.251Z
reopened_by: builder
governed_by: task_close:operator
---

# Fix legacy pre-invariant dependency evidence compatibility

## Chapter

Task Lifecycle Compatibility

## Goal

Make dependency checks handle pre-invariant closed tasks without forcing unsafe legacy reconciliation cascades, while preserving strict governed provenance for modern terminal tasks.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Evidence repair recorded 2026-05-13 after operator accepted review.

Original implementation evidence exists in commit `ec0b4424` (`Fix legacy dependency evidence compatibility`):
- `packages/task-governance/src/task-governance.ts`
- `packages/task-governance/src/task-projection.ts`
- `packages/task-governance/test/lib/task-governance.test.ts`
- task lifecycle evidence for task 1086

Original builder report evidence is present in `.ai/task-lifecycle-snapshot.json` as
`wrr_5c8c38b4_20260429-1086-fix-legacy-pre-invariant-dependency-evidence-compatibility_builder`.
Mutation evidence for the original report is preserved at
`.ai/mutation-evidence/task_lifecycle/mev_315814992fe7fa49c0995acec3d30473.json`.

This repair does not claim new implementation work. It records missing task evidence so the accepted
operator review can close through governed task lifecycle admission.

## Verification

- `git show --stat --oneline ec0b4424` found the original implementation commit and changed files.
- `Get-Content .ai\mutation-evidence\task_lifecycle\mev_315814992fe7fa49c0995acec3d30473.json` confirmed the original builder report mutation evidence.
- `pnpm --filter @narada2/task-governance exec vitest run test/lib/task-governance.test.ts -t "pre-invariant closed dependencies" --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=120000 --hookTimeout=120000` passed: 2 compatibility tests, 63 skipped.
- Full current `packages/task-governance/test/lib/task-governance.test.ts` run was checked but is not closure evidence for this repair: 58 passed and 7 unrelated roster mutation fixture tests failed.

## Acceptance Criteria

- [x] Pre-invariant closed tasks with checked criteria and material execution or verification evidence can satisfy dependencies without direct lifecycle mutation.
- [x] Modern terminal tasks still require governed provenance and evidence for dependency completion.
- [x] Task recommendation no longer reports tasks 403 and 1002 as dependency-blocked when their prerequisites satisfy the compatibility rule.
- [x] Focused task-governance/recommender tests cover the legacy compatibility path.
- [x] pnpm verify passes.
