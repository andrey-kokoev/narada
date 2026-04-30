---
status: opened
---
# Make paired Windows User/PC bootstrap two-phase safe

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1113-1118-windows-bootstrap-correctness.md

## Goal

Prevent `bootstrap-windows --execute` from leaving misleading half-created User/PC Site state without explicit partial-state evidence and repair guidance.

## Context

Inbox observation env_ffeed7c4 reports that `--execute` initializes the User Site before the PC Site; if User succeeds and PC fails, the paired bootstrap can leave partial state.

## Required Work

1. Analyze current `bootstrap-windows --execute` ordering and failure handling.
2. Add a preflight phase that validates both User and PC Site target readiness before mutation.
3. Either make execution transactional where possible or emit explicit partial-state evidence with repair/rollback commands where transactionality is impossible.
4. Add tests for preflight failure before mutation, User failure, PC failure after User success, and successful paired execution.

## Non-Goals

- Do not use destructive deletion as automatic rollback.
- Do not hide partial state from the Operator.
- Do not mutate adapter configs as part of paired Site bootstrap unless explicitly delegated to owning-locus commands.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] bootstrap-windows performs paired preflight before creating either Site
- [ ] PC Site failure after User Site creation produces explicit partial-state evidence and exact repair guidance
- [ ] Successful execution records both User and PC Site coordinates and validation commands
- [ ] Tests cover preflight failure, partial creation, repair evidence, and success
