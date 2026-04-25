---
status: closed
amended_by: a2
amended_at: 2026-04-25T03:45:58.580Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:55:38.262Z
closed_by: a3
---

# Repair Task Recommend SQLite Test Suite

## Chapter

Agent Self Cycle Rough Surfaces Follow-up

## Goal

Make the full `task-recommend.test.ts` suite pass under SQLite authority instead of relying only on targeted focused tests.

## Context

Task 635 added targeted tests for bounded recommendation output and unknown-agent behavior. The full `task-recommend.test.ts` file still fails because several fixtures mutate markdown or JSON projections after SQLite has become authoritative. Failures observed included blocked tasks missing from abstentions, `in_review` classification not appearing, write-set risk not surfacing, JSON roster projection mutation during read-only recommend, and empty-recommendation exit-code expectations drifting under SQLite-backed status reads.

## Required Work

1. Audit the failing `task-recommend.test.ts` cases under the focused test posture.
2. Convert fixtures to seed or update sanctioned SQLite-backed task lifecycle/spec/roster/report state instead of relying on markdown-only status changes after authority has moved.
3. Preserve read-only recommendation guarantees: recommendation execution must not mutate task files or roster projections in a correctly seeded SQLite-authoritative fixture.
4. Keep targeted bounded-output tests from Task 635 passing.
5. Ensure the full `task-recommend.test.ts` file passes under `pnpm test:focused`.

## Non-Goals

Do not redesign recommendation scoring. Do not weaken SQLite authority. Do not remove meaningful blocked, in-review, empty, or write-set-risk assertions just to make tests green.

## Execution Notes

1. Amended the underspecified task body to record the actual SQLite-authority recommender test residual from Task 638.
2. Seeded `task-recommend.test.ts` fixtures with SQLite roster, lifecycle, and task spec rows so recommendation reads do not depend on markdown-only status after SQLite became authoritative.
3. Converted dependency fixture 997 to canonical block-list dependency syntax and seeded its SQLite task spec dependencies.
4. Updated lifecycle-sensitive tests to update SQLite status when they intentionally move tasks to `claimed`, `opened`, or `in_review`.
5. Replaced a stale JSON report fixture with sanctioned `saveReport()` so write-set risk reads SQLite-backed report records.
6. Fixed production recommender behavior so `in_review` tasks are abstained as `Completed, awaiting review or closure` instead of entering implementation recommendations.
7. Captured remaining runtime debt as Task 642 because the full recommender test file now passes but remains slow.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/cli build` | Pass |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/task-recommend.test.ts --pool=forks -t 'blocked task|all tasks abstained|in_review tasks|empty recommendation'"` | Pass, 4/4 targeted |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/task-recommend.test.ts --pool=forks"` | Pass, 33/33, ~126s |
| `narada task create --title "Optimize Task Recommend Focused Test Runtime" ...` | Created Task 642 |

## Acceptance Criteria

- [x] Full `task-recommend.test.ts` passes under `pnpm test:focused`.
- [x] SQLite-backed fixture state is used for lifecycle-sensitive cases.
- [x] Bounded-output and unknown-agent tests still pass.
- [x] Read-only recommendation no-mutation expectation remains meaningful.
- [x] Runtime remains practical under the focused test posture.



