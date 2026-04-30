---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T05:48:59.912Z
criteria_proof_verification:
  state: unbound
  rationale: Focused site bootstrap tests, CLI typecheck/build, and live dry-run readback verify all acceptance criteria for paired preflight, partial-state evidence, success coordinates, and coverage.
closed_at: 2026-04-30T05:49:17.893Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
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

- [x] bootstrap-windows performs paired preflight before creating either Site
- [x] PC Site failure after User Site creation produces explicit partial-state evidence and exact repair guidance
- [x] Successful execution records both User and PC Site coordinates and validation commands
- [x] Tests cover preflight failure, partial creation, repair evidence, and success
