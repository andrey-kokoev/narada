---
status: closed
governed_by: task_review:a3
closed_at: 2026-04-25T04:30:44.548Z
closed_by: a3
---

# Repair Chapter Close SQLite Confirmation Reconciliation

## Chapter

Ops Zone Completion Follow-up

## Goal

Ensure chapter closure confirmation updates SQLite lifecycle authority as well as task files, including idempotent reruns.

## Context

After `narada chapter close 644-649 --finish` succeeded, individual task evidence still reported SQLite-backed status `closed` while task files had been transitioned to `confirmed`. Chapter closure must update the current lifecycle authority, not only markdown front matter, and reruns must reconcile already-confirmed files with stale SQLite rows.

## Required Work

1. Update chapter close confirmation to write SQLite lifecycle status `confirmed`.
2. Make range closure finish idempotently reconcile stale SQLite rows when task files are already `confirmed`.
3. Add focused tests for both direct transition and idempotent reconciliation.
4. Re-run chapter closure for `644-649` and verify evidence reports `confirmed complete`.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Updated `packages/layers/cli/src/commands/chapter-close.ts` to call `openTaskLifecycleStore().updateStatus(..., 'confirmed', ...)` during chapter confirmation.
2. Kept markdown front-matter transition for compatibility, but made SQLite lifecycle update part of the same confirmation path.
3. Made range `--finish` scan both `closed` and `confirmed` terminal tasks so reruns reconcile stale SQLite rows even when files already say `confirmed`.
4. Added tests in `packages/layers/cli/test/commands/chapter-close.test.ts` proving:
   - normal finish updates SQLite to `confirmed`;
   - already-confirmed files reconcile stale SQLite `closed` rows.
5. Re-ran `narada chapter close 644-649 --finish --by a2`; evidence for tasks 644-649 now reports `confirmed complete`.

## Verification

| Command | Result |
| --- | --- |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/chapter-close.test.ts --pool=forks"` | Passed, 18/18 tests |
| `pnpm --filter @narada2/cli build` | Passed |
| `narada chapter close 644-649 --finish --by a2` | Passed on rerun |
| `narada task evidence 644..649 --format json` | Each task reports `status: confirmed`, `verdict: complete` |

## Acceptance Criteria

- [x] Chapter close finish updates SQLite lifecycle to confirmed
- [x] Already-confirmed files reconcile stale SQLite closed rows
- [x] Focused chapter-close tests cover the behavior
- [x] CLI package build passes



