---
status: closed
closed_at: 2026-05-15T19:18:56.613Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Remove law receipt work-admission blocking in Narada proper

## Chapter

mcp-infrastructure

## Goal

Stop unread/expired law receipts from blocking Narada proper work-next/task construction admission while preserving law status evidence.

## Context

Operator directive: remove that functionality application in Narada proper after builder role-targeted review work was blocked by an unread/expired mandatory law receipt.

## Required Work

Identify the law admission / qualification gate that blocks work-next or task construction on unread law receipts; change Narada proper behavior so law receipts are advisory evidence, not work-admission blockers; keep law status/read surfaces intact; add focused regression coverage.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Verified Narada proper work selection no longer treats unread mandatory law receipts as a work-admission blocker by itself.
- Confirmed `packages/layers/cli/src/commands/work-next.ts` keeps law admission as evidence passed into Site qualification, while ordinary unread law receipt state does not block task selection.
- Confirmed law status/read surfaces still preserve unread, blocked, expired, and absorbed receipt evidence through `law status`, `law unread`, and role-loop advisory state.
- Confirmed focused tests cover both `work-next` advisory behavior and task claim behavior under unread law notices.

## Verification

- `pnpm --filter @narada2/cli test -- work-next.test.ts law.test.ts` passed with 37 tests.
- `packages/layers/cli/test/commands/work-next.test.ts` includes `does not turn unread law receipts into work admission blockers`, proving work-next claims task work despite unread applicable law.
- `packages/layers/cli/test/commands/law.test.ts` includes `surfaces unread mandatory law without blocking task claim`, proving law status remains visible while task claim succeeds.
- `packages/layers/cli/test/commands/law.test.ts` keeps blocked/expired receipt state visible as escalation evidence without changing `admission: clear`.

## Acceptance Criteria

- [x] narada work-next no longer blocks solely because law_admission has unread mandatory law changes.
- [x] law status/unread commands still report unread receipts as evidence.
- [x] Focused tests pass.
