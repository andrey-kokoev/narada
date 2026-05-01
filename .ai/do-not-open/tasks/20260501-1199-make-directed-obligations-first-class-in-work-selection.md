---
status: closed
closed_at: 2026-05-01T20:58:50.260Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Make directed obligations first-class in work selection

## Chapter

directed-obligations-work-selection

## Goal

Represent review waits, handoffs, and recipient expectations as durable obligation edges so role loops cannot treat addressed work as idle or generic queue work.

## Context

Inbox envelope env_fdf9b9b7-39e8-4b5e-b535-7ee24f59d6e4 reports that narada-andrey Bob showed awaiting review #76 while Kevin did not process the review until Operator correction. The wait was projected as Bob's visual state instead of as a first-class obligation addressed to Kevin or the unique architect role.

## Required Work

Define directed obligations as first-class Narada facts with source, target, kind, status, evidence, and consumption rule. Update or specify task report/review-request, OSM review requests, inbox handoffs, and similar commands so they emit or update obligation records when they create an expectation that another agent should act. Work selection for an agent must check obligations addressed to that agent before generic runnable task discovery, unless the obligation is explicitly deferred or delegated. Implement or specify consumption transitions for review, defer, delegation, rejection, or completion. Ensure operator-surface labels project admitted obligation facts rather than becoming the authority for them.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Added SQLite-backed `directed_obligations` records with source, target, kind, status, task linkage, evidence JSON, consumption rule JSON, and consumption metadata.
2. Added `--reviewer <agent-or-role>` to `narada task report`; it creates an open `review_request` obligation for an exact agent id or a uniquely resolved role alias.
3. Updated `work-next` to check addressed open directed obligations before generic task queue discovery and report why the obligation outranks generic work.
4. Updated `task review` to transition matching open review obligations to `completed` or `rejected` with the review id as consumption evidence.
5. Updated `task defer` to transition matching open obligations to `deferred`.
6. Updated Operator Surface status/activity projection to read open obligation records from SQLite and expose them as projection evidence, not label authority.
7. Added focused regressions for task report obligation creation, work-next precedence, review consumption, and Operator Surface obligation projection.

## Verification

- Focused tests: `pnpm --filter @narada2/cli exec vitest run test/commands/task-report.test.ts test/commands/work-next.test.ts test/commands/task-review.test.ts test/commands/operator-surface.test.ts -t "directed review obligation|directed obligations|delegates accepted reviews|addressed directed obligations|projects directed obligations" --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=120000 --hookTimeout=120000` passed.
- Typecheck: `pnpm --filter @narada2/task-governance typecheck` and `pnpm --filter @narada2/cli typecheck` passed.
- Build: `pnpm --filter @narada2/task-governance build` and `pnpm --filter @narada2/cli build` passed.
- TIZ verification: `run_1777669007612_d326bu` passed with exit code 0.

## Acceptance Criteria

- [x] Directed obligation records include source, target, kind, status, evidence, and consumption rule.
- [x] Task review requests can create an addressable review_request obligation targeted to an exact identity or uniquely resolved role alias.
- [x] Agent work selection checks open addressed obligations before generic task queues and reports why an obligation outranks generic work.
- [x] Review, defer, delegation, rejection, or completion consumes or transitions the corresponding obligation edge.
- [x] Operator-surface label/activity projections read from obligation records and do not become the authority for obligation state.
