---
status: closed
closed_at: 2026-05-01T21:39:10.792Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Define projection-admitted work selection for role loops

## Chapter

projection-admitted-work-selection

## Goal

Allow role loops to use projections such as OSA activity as admitted work-selection signals without treating projections as authority.

## Context

Inbox envelope env_edeb2408-6f8a-4b9b-ae76-23918ced45a8 reports that an architect loop followed generic workboard order while an active collaborator was visibly awaiting review. The fix is not to make labels authoritative, but to admit fresh, sourced projections as acceleration signals joined back to authoritative lifecycle/report/inbox facts.

## Required Work

Define a role-loop work-selection contract for Architect/reviewer agents. A projection may influence recommendation only when it carries provenance, freshness, ambiguity posture, and a fallback path to authoritative facts. Elevate direct review requests and active collaborator blocked-on-review tasks above ordinary pending review ordering. Expose recommendation reasons such as active_collaborator_blocked, direct_review_request, ordinary_pending_review, and local_followup. Include source facts and projection provenance in bounded output, and require explicit recorded reason to skip an active collaborator review blocker.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Updated `work-next` review selection so pending review candidates carry
   explicit recommendation reason codes: `active_collaborator_blocked`,
   `direct_review_request`, and `ordinary_pending_review`.
2. Added projection admission metadata for active collaborator review blockers.
   The projection is admitted only when a single non-reviewer roster projection
   points at the task and authoritative task lifecycle status is `in_review`.
3. Included bounded provenance in selected review work:
   `projection_admission`, `source_facts`, and `skip_policy`. Projection
   metadata is marked as projection-only and joined back to SQLite lifecycle,
   report, and review facts.
4. Sorted review candidates so a fresh non-ambiguous active collaborator review
   blocker outranks ordinary pending review ordering, while authority still
   wins when projection and task facts disagree.
5. Updated `role-loop next-obligation` reason extraction so bounded output can
   surface `recommendation_reason` without expanding the payload.
6. Updated stale work-next assertions for the current directed-obligation-first
   selection order.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --dir packages/layers/cli exec vitest run test/commands/work-next.test.ts --pool=forks` | Passed, 27/27 tests |
| `pnpm --filter @narada2/cli typecheck` | Passed |
| `pnpm --filter @narada2/task-governance build` | Passed |
| `pnpm --filter @narada2/cli build` | Passed |
| `narada --format json role-loop next-obligation --agent builder` | Passed inside TIZ; bounded output remained valid |
| `narada test-run run --cmd-file /tmp/narada-1202-verification.cmd --task 1202 --timeout 180 --scope focused --requester builder --rationale "Verify projection-admitted role-loop work selection, reason codes, authority-over-projection behavior, typecheck, build, and bounded live output."` | Passed, run `run_1777671419203_vwzp9o`, command run `run_1777671419285_0i775a`, duration 67420 ms |

## Acceptance Criteria

- [x] Documentation or code defines projection-admitted work selection and distinguishes projections from authority.
- [x] Role-loop recommendations include reason codes such as active_collaborator_blocked and direct_review_request.
- [x] Projection-influenced recommendations include provenance, freshness, ambiguity posture, and authoritative source facts.
- [x] A fresh non-ambiguous active collaborator review blocker outranks ordinary pending review ordering.
- [x] Tests cover a Bob awaiting_review task outranking a generic pending review, with authority winning if projection and authoritative facts disagree.
