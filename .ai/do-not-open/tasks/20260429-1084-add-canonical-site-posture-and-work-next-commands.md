---
status: closed
amended_by: architect
amended_at: 2026-04-29T17:59:13.032Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T18:02:29.828Z
criteria_proof_verification:
  state: unbound
  rationale: docs/product/site-posture-work-next.md defines Site posture fields for daemon posture, sync freshness, runtime readiness, work queue, drafts, inbox, tasks, publication, residuals, and next action. It defines Site work-next priority selection for bounded operator action across Site kinds, forbids raw transcript/db/payload dumps, requires local wrappers to project the canonical command, and includes fixtures for healthy quiescent, pending draft, and failed-terminal attention states. Source envelope env_19b837f5-59ce-4cb3-8ed7-2efa1f12129f is already routed to task 1084.
closed_at: 2026-04-29T18:02:45.473Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add canonical Site posture and work-next commands

## Chapter

Site Operator Posture Surfaces

## Goal

Design and implement canonical Site-level posture/work-next commands so routine Site operation does not require manual reconciliation across site-specific status, ops, check, and drafts commands.

## Context

Inbox envelope env_19b837f5-59ce-4cb3-8ed7-2efa1f12129f reports a Staccato Site posture gap: establishing routine Site readiness required mentally reconciling pnpm status, pnpm ops, pnpm check, and pnpm drafts. That is CLI-based but still ergonomically incoherent. Generic Narada Sites need canonical posture and work-next surfaces so each Site does not invent a private wrapper for daemon posture, sync freshness, work queue, drafts, failed-terminal attention, runtime readiness, residuals, and next recommended action.

## Required Work

1. Inspect existing root work-next, task/inbox work-next, doctor, ops, drafts, status, Site stabilization docs, and Staccato evidence. 2. Dearbitrize the relationship between Site posture, Site health, Site stabilize/reconcile, and Site work-next. 3. Implement or specify canonical commands such as narada site health, narada site posture, narada site work-next, or an equivalent grouped surface. 4. The posture command must summarize daemon posture, sync freshness, runtime readiness, active/retryable/stuck work, pending drafts, failed-terminal attention, known residuals, and recommended next action. 5. The work-next command must return one bounded operator action across Site kinds without requiring manual multi-command choreography. 6. Preserve existing root work-next/task work-next/inbox work-next semantics; do not smear agent task execution with operator Site posture. 7. Make local Site wrappers thin projections of the canonical command, not independent policy. 8. Add human and JSON outputs with bounded detail and no raw transcript or large runtime dumps. 9. Add focused tests or fixtures for a healthy quiescent Site and a Site with pending drafts or failed-terminal attention. 10. Run focused verification or pnpm verify and record residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T17:59:13.032Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Site posture surface summarizes daemon posture sync freshness runtime readiness work queue drafts failed-terminal attention residuals and next recommended action
- [x] Site work-next surface returns a bounded next operator action across Site kinds without raw transcript dumps
- [x] Local Site wrappers can project the canonical command instead of reinventing posture choreography
- [x] Human and JSON output are bounded and actionable
- [x] Source envelope env_19b837f5-59ce-4cb3-8ed7-2efa1f12129f is routed
