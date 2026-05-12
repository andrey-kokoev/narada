---
status: closed
closed_at: 2026-05-12T18:17:31.890Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Clarify repair-review closure identity

## Chapter

Canonical Inbox Promotions

## Goal

Prevent repair-review closure from appearing to reuse stale rejected review identity; expose fresh accepted review evidence or explicit closure-admission semantics.

## Context

Source inbox envelope: env_704501c8-f660-4b22-bffc-6f532be37f38

Source: agent_report:narada-andrey:task-review-backlog-clearance

Envelope kind: observation

Summary: Task lifecycle repair reviews after prior rejection exposed two confusing states in narada-andrey: task review accepted_with_notes did not close because stale rejected Evidence Admission still blocked closure, and task finish --close succeeded but reported review_action=reused with an older rejected review_id. This makes accepted repair reviews look semantically tied to the rejected review and can mislead architects while clearing backlog.

Evidence:
- Observed on task 93: accepted repair review did not close; task close --override-rationale failed with latest Evidence Admission rejected; task finish --close closed the task but reported reused review id from older rejected review.
- Observed again on task 92: task finish --close closed evidence-complete state but returned review_action=reused and review_id review-20260501-92-...-1777671618832, while task read lists only rejected reviews and closure.

Proposal:
- Task lifecycle should create or expose a fresh accepted review record for repair acceptance after rejection, or make explicit that finish is closing by closure admission rather than review reuse.
- Evidence Admission should recompute from latest accepted repair evidence and should not let stale rejected admissions block task close without a direct repair path.

Recommendation: Treat as task-governance CAPA: tighten review/finish semantics, stale evidence admission repair, and machine output so architects can trust closure state without manual readback.

## Required Work

0. Source summary: Task lifecycle repair reviews after prior rejection exposed two confusing states in narada-andrey: task review accepted_with_notes did not close because stale rejected Evidence Admission still blocked closure, and task finish --close succeeded but reported review_action=reused with an older rejected review_id. This makes accepted repair reviews look semantically tied to the rejected review and can mislead architects while clearing backlog.
1. Read source inbox envelope env_704501c8-f660-4b22-bffc-6f532be37f38 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Target locus: Narada proper task-governance/CLI review-finish behavior in `D:\code\narada`.
- Preserved source envelope `env_704501c8-f660-4b22-bffc-6f532be37f38` as external observation evidence.
- Inspected `packages/task-governance/src/task-finish-service.ts` and `packages/layers/cli/test/commands/task-finish.test.ts`.
- No package source change was needed in this increment. Current behavior already submits a fresh accepted repair review when a reviewer supplies an accepted verdict after a stale rejection, reports `review_action: submitted`, reports `review_reuse_posture: submitted_superseding_stale_rejection`, records `ignored_review_ids`, admits fresh evidence, and closes.
- Existing regression coverage also keeps valid accepted-review reuse distinct with `review_reuse_posture: reused_valid_acceptance`.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/task-finish.test.ts` passed: 13 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- Relevant existing regression: `submits an accepted repair review instead of reusing a stale rejected review id`.

## Acceptance Criteria

- [x] Repair acceptance after a rejected review does not report a stale rejected review id as the active accepted review.
- [x] If closure is based on admitted evidence rather than a fresh accepted review, machine output states that distinction explicitly.
- [x] Regression coverage proves stale rejected evidence does not silently block the repair path without guidance.
