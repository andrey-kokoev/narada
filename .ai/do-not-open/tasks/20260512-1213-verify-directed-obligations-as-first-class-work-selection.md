---
status: closed
closed_at: 2026-05-12T18:22:56.506Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Verify directed obligations as first-class work selection

## Chapter

Canonical Inbox Promotions

## Goal

Confirm Narada proper already models review waits and handoffs as first-class directed obligations before generic work selection, or record the smallest missing slice.

## Context

Source inbox envelope: env_fdf9b9b7-39e8-4b5e-b535-7ee24f59d6e4

Source: agent_report:narada-andrey:directed-obligations-first-class

Envelope kind: proposal

Summary: A review wait was projected on Bob's operator-surface label as `awaiting review #76`, while Bob's builder queue was idle. Kevin failed to process the review because the wait was represented as Bob's visual state instead of as a first-class obligation edge addressed to Kevin. This should be elevated into Narada doctrine and machinery.

## Required Work

0. Source summary: A review wait was projected on Bob's operator-surface label as `awaiting review #76`, while Bob's builder queue was idle. Kevin failed to process the review because the wait was represented as Bob's visual state instead of as a first-class obligation edge addressed to Kevin. This should be elevated into Narada doctrine and machinery.
1. Read source inbox envelope env_fdf9b9b7-39e8-4b5e-b535-7ee24f59d6e4 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Target locus: Narada proper task-governance, role-loop, work-next, and operator-surface read-model behavior in `D:\code\narada`.
- Preserved source envelope `env_fdf9b9b7-39e8-4b5e-b535-7ee24f59d6e4` as operator-confirmed external proposal evidence.
- Verified the current tree already implements directed obligations as first-class SQLite lifecycle records:
  - `task report` and `task review-request` create durable `review_request` obligations.
  - `task review` consumes or rejects matching review obligations.
  - `task defer` transitions addressed open obligations to deferred.
  - `work-next` selects addressed directed obligations before generic task discovery.
  - `role-loop next-obligation` emits one bounded next-obligation packet.
  - operator-surface status projects directed obligations as activity evidence with authority `sqlite_directed_obligations`.
- Implemented a narrow Windows test-harness fix in `packages/layers/cli/test/commands/role-loop.test.ts`: use `git` on Windows and `/usr/bin/git` elsewhere unless `NARADA_GIT_BINARY` is set. This made the existing directed-obligation role-loop regression executable in the Windows Narada proper embodiment.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/role-loop.test.ts test/commands/work-next.test.ts test/commands/task-report.test.ts test/commands/task-review.test.ts` passed: 4 files, 70 tests.
- `pnpm --dir packages/task-governance test -- test/lib/task-lifecycle-store.test.ts` passed: 36 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.

## Acceptance Criteria

- [x] Task report/review-request paths create durable review_request obligation records.
- [x] Task review/defer paths consume or transition addressed obligations.
- [x] Work selection exposes addressed directed obligations before generic task discovery.
- [x] Operator-surface activity uses obligation projections without treating labels as authority.
