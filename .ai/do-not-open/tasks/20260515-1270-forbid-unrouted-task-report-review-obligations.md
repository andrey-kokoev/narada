---
status: closed
closed_at: 2026-05-15T19:18:04.548Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Forbid unrouted task report review obligations

## Chapter

mcp-infrastructure

## Goal

Make task report review routing mandatory so open _unrouted review obligations cannot be created by default.

## Context

Operator directive in chat: remove mechanical ability for _unrouted to be acceptable. Implemented immediately in task-report service and tests; this task records the authority/evidence path for that mutation.

## Required Work

Change report-time review routing so task report must resolve to an explicit, configured, or unique distinct admitted reviewer before mutating lifecycle/report state; block self-review and missing reviewer paths; add regression coverage proving no report or obligation is created when no reviewer resolves.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Verified `packages/task-governance/src/task-report-service.ts` now resolves a mandatory review target before report/lifecycle mutation.
- Confirmed missing reviewer resolution returns an error with repair guidance instead of creating an `_unrouted` review obligation.
- Confirmed self-review paths are blocked when an explicit, default, or role-targeted reviewer resolves only to the reporting agent.
- Confirmed report-time review target validation uses the same admitted review authority boundary that `narada task review` would enforce.
- Confirmed focused regression coverage exists in `packages/layers/cli/test/commands/task-report.test.ts` for no-reviewer refusal, invalid reviewer refusal, role-targeted review obligations, and non-unrouted obligation creation.

## Verification

- `pnpm --filter @narada2/cli test -- task-report.test.ts` passed with 24 tests.
- Source inspection confirmed `resolveMandatoryReviewTarget` returns `review_authority_repair` with `no_workaround` guidance before `saveReport`, lifecycle status mutation, or `upsertDirectedObligation` when no distinct admitted reviewer can be resolved.
- Source inspection confirmed created report obligations use resolved `target_agent_id` or `target_role` and do not use `target_ref=unrouted`.

## Acceptance Criteria

- [x] task report cannot create an open review obligation with target_ref=unrouted.
- [x] Missing or self reviewer paths fail before report/lifecycle mutation with repair guidance.
- [x] Focused task-report and task-review tests pass.
