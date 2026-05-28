---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-15T17:11:04.190Z
criteria_proof_verification:
  state: unbound
  rationale: Focused verification commands passed for directed-obligation selection, task read/show availability, builder review authority, and nonterminal review next-command continuation; task 1268 closure and consumed review obligation verified by task read/work-next.
closed_at: 2026-05-15T19:19:38.037Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# CAPA: Builder duty loop stopped before governed next action

## Chapter

Canonical Inbox Promotions

## Goal

Correct and prevent Builder duty-loop stops after intermediate Narada command outputs when admissible next actions remain.

## Context

Source inbox envelope: env_65f00690-4a89-4d25-97d6-36dc0c414584

Source: user_chat:codex_session:2026-05-15:duty-loop-premature-stop-task-1268

Envelope kind: incident

Summary: During the Builder duty loop for task 1268, the agent stopped after reading task evidence, then again after recording the accepted review, even though the governed surfaces had returned concrete next actions. The operator had to prompt twice to continue: first to run the expected task review, then to close the task after the review output returned a closure command.

Recommendation: Promote this incident into a Narada proper CAPA task for Builder duty-loop continuation hardening.

## Required Work

0. Source summary: During the Builder duty loop for task 1268, the agent stopped after reading task evidence, then again after recording the accepted review, even though the governed surfaces had returned concrete next actions. The operator had to prompt twice to continue: first to run the expected task review, then to close the task after the review output returned a closure command.
1. Read source inbox envelope env_65f00690-4a89-4d25-97d6-36dc0c414584 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Added an explicit `duty_loop_continuation` result field to `packages/task-governance/src/task-review-service.ts` when a review succeeds but closure is nonterminal and returns a `next_command`.
- The continuation marker records `required: true`, reason `task_review_returned_nonterminal_next_command`, the exact `next_command`, and `terminal: false`.
- Added regression coverage in `packages/layers/cli/test/commands/task-review.test.ts` for the accepted-review path where closure is blocked by a no-continuation-needed gate and the agent must continue to the returned close command.
- Verified the originating incident containment: task 1268 remains closed, reviewed by `narada.builder`, and governed by `task_close:narada.builder`.

## Verification

- `pnpm --filter @narada2/cli test -- task-review.test.ts` passed with 17 tests.
- `narada task read 1268 --format json --verbose` confirmed task 1268 status is `closed`, has accepted Builder review, has closure by `narada.builder`, and has governed provenance.

## Acceptance Criteria

- [x] Duty-loop guidance or tooling requires agents to continue or explicitly block on next_command/remediation/closure_posture outputs.
- [x] A regression or fixture covers review obligation -> accepted review -> closure gate continuation for task-like flows.
- [x] Verification confirms task 1268 stayed closed and its review obligation stayed consumed.
