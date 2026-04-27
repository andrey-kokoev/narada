---
status: opened
depends_on: [994]
amended_by: architect
amended_at: 2026-04-27T21:49:39.335Z
---

# Emit task lifecycle mutation evidence

## Chapter

canonical-mutation-evidence-implementation

## Goal

Make task lifecycle mutation commands emit canonical mutation evidence records alongside SQLite state changes and existing task artifacts.

## Context

Task lifecycle state is SQLite-backed with a tracked snapshot guard. That is useful but transitional. Governed lifecycle mutations need append-only Git-visible evidence so other clones can replay or reconcile local SQLite without merging raw DB files.

## Required Work

1. Route task lifecycle mutating commands through a shared mutation-evidence writer.
2. Cover claim, report, review, finish, close, reopen, release, and confirm paths or explicitly classify any excluded path.
3. Include before/after lifecycle status, task id/number, principal/agent, command, operation id, and read-back confirmation.
4. Preserve existing task artifacts, reviews, reports, and snapshot guard behavior.
5. Add focused tests for claim, report, finish, and close evidence records.

## Non-Goals

- Do not implement cross-clone replay in this task.
- Do not remove markdown task projections.
- Do not make evidence emission depend on direct SQLite file merging.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Claim, report, review, finish, close, reopen, release, and confirm paths emit evidence records or explicitly document why a path is read-only/not applicable.
- [ ] Evidence records are Git-visible mergeable artifacts and idempotent by operation id.
- [ ] Existing lifecycle snapshot guard remains as projection freshness guard.
- [ ] Focused tests cover at least claim, report, finish, and close.
- [ ] `pnpm verify` passes.
