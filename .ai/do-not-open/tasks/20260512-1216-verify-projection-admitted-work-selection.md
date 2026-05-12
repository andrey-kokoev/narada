---
status: closed
closed_at: 2026-05-12T18:27:23.206Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Verify projection-admitted work selection

## Chapter

Canonical Inbox Promotions

## Goal

Confirm role-loop/work-next uses projections only as admitted read-model signals joined to authoritative lifecycle facts, without treating projection state as authority.

## Context

Source inbox envelope: env_edeb2408-6f8a-4b9b-ae76-23918ced45a8

Source: agent_report:narada-andrey:projection-admitted-work-selection

Envelope kind: proposal

Summary: Role-loop and work-selection machinery should be able to use projections such as OSA activity as admitted read-model signals, without treating them as authority. This prevents failures where an architect mechanically follows generic workboard order while an active collaborator is visibly/blockingly awaiting review on a specific task.

## Required Work

0. Source summary: Role-loop and work-selection machinery should be able to use projections such as OSA activity as admitted read-model signals, without treating them as authority. This prevents failures where an architect mechanically follows generic workboard order while an active collaborator is visibly/blockingly awaiting review on a specific task.
1. Read source inbox envelope env_edeb2408-6f8a-4b9b-ae76-23918ced45a8 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Target locus: Narada proper work selection and operator-surface projection read models in `D:\code\narada`.
- Preserved source envelope `env_edeb2408-6f8a-4b9b-ae76-23918ced45a8` as external proposal evidence.
- Verified current `work-next` admits active-collaborator projection only when joined to authoritative task lifecycle facts, reports `projection_admission`, uses reason `active_collaborator_blocked`, and adds a skip policy requiring an explicit reason.
- Verified authority wins when projection facts disagree with authoritative lifecycle state.
- Verified addressed directed obligations outrank generic task discovery.
- Verified operator-surface status projects directed obligations as activity evidence with `authority: sqlite_directed_obligations`, not as label authority.
- No source change was needed for this task.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/work-next.test.ts test/commands/role-loop.test.ts test/commands/operator-surface.test.ts -t "active collaborator|authority ahead|directed obligations|projects directed obligations"` passed: 4 tests, 98 skipped.
- `pnpm --dir packages/layers/cli typecheck` passed.

## Acceptance Criteria

- [x] Active collaborator projection can prioritize review work only when joined to authoritative in_review lifecycle facts.
- [x] When projection and authority disagree, authoritative lifecycle state wins.
- [x] Directed obligations outrank generic task discovery before projection-heavy workboard exploration.
