---
status: closed
closed_at: 2026-05-01T21:29:01.493Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Migrate existing lifecycle DBs to directed obligations schema

## Chapter

governance-embodiment-freshness

## Goal

Ensure existing task-lifecycle SQLite databases are upgraded when new schema tables such as directed_obligations are introduced.

## Context

The bounded role-loop probe failed on the live Narada proper DB with no such table: directed_obligations after Task 1199 added the table. Existing DBs were incorrectly treated as current because hasCurrentLifecycleSchema only checked older tables.

## Required Work

Update lifecycle schema freshness detection so existing DBs missing newer tables run initSchema, add regression coverage for upgrading an old file-backed DB, and verify role-loop next-obligation works against the live DB.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Replaced the narrow current-schema check in
   `packages/task-governance/src/task-lifecycle-store.ts` with an explicit
   `REQUIRED_LIFECYCLE_TABLES` list that includes newer tables such as
   `directed_obligations`, `agent_roster`, `command_runs`, and
   `verification_runs`.
2. Added a file-backed regression that creates an old lifecycle DB with only the
   previously checked tables, opens it through `openTaskLifecycleStore`, and
   verifies newer tables are created by `initSchema`.
3. Rebuilt task-governance and CLI dist, then verified the live
   `role-loop next-obligation --agent builder` path no longer fails on
   `directed_obligations`.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/task-governance exec vitest run test/lib/task-lifecycle-store.test.ts --pool=forks` | Passed, 36/36 tests |
| `pnpm --filter @narada2/task-governance typecheck` | Passed |
| `pnpm --filter @narada2/task-governance build` | Passed |
| `pnpm --filter @narada2/cli build` | Passed |
| `narada --format json role-loop next-obligation --agent builder` | Passed inside TIZ; returned bounded task-work packet instead of missing-table failure |
| `narada test-run run --cmd-file /tmp/narada-1203-verification.cmd --task 1203 --timeout 120 --scope focused --requester builder --rationale "Verify lifecycle store upgrades existing DBs missing directed_obligations and live role-loop next-obligation no longer fails."` | Passed, run `run_1777670857595_ytec01`, command run `run_1777670857669_58u7i5`, duration 24428 ms |

## Acceptance Criteria

- [x] Existing lifecycle DBs missing directed_obligations are not treated as current
- [x] Opening an old file-backed lifecycle DB creates directed_obligations and other newer tables
- [x] Regression tests cover the migration path
- [x] Live role-loop next-obligation no longer fails with missing directed_obligations
