---
status: closed
amended_by: architect
amended_at: 2026-04-29T17:20:04.894Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T17:28:08.893Z
criteria_proof_verification:
  state: unbound
  rationale: The accepted fixture in docs/product/site-stabilization-reconciliation.md proves stale durable memory plus advanced runtime truth yields a proposed read-only posture update; the surface distinguishes durable memory, runtime health, quiescence, work state, outbound handoffs, private substrate, publication posture, and operator/session residuals; bounded human/JSON output, readiness states including operational_quiescent_with_approval_path_residual, and non-mutation rules are documented and linked from AGENTS/operator-loop/Site governance docs.
closed_at: 2026-04-29T17:28:22.900Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add governed Site stabilization and posture reconciliation surface

## Chapter

Site Stabilization and Readiness

## Goal

Define and implement a governed Site stabilization/reconciliation surface that compares durable Site memory runtime control-plane truth and operator/session knowledge, then proposes bounded posture updates without silently mutating doctrine or config.

## Context

Inbox envelope env_63b9a246-347b-4732-acfa-8ba21c074e14 reports a Staccato Site stabilization episode where authored durable Site memory, runtime/control-plane truth, and operator/session knowledge diverged. Durable text said blocked-upstream and no outbound created, while runtime showed healthy quiescent state, zero pending handoffs, confirmed handoffs, and one Willem clarification draft terminal reason sent_by_operator_request_via_graph. Manual reconciliation produced operational_quiescent_with_approval_path_residual. Narada needs a governed stabilization surface so this is not inferred from raw status JSON and stale docs.

## Required Work

1. Inspect existing site doctor, operation status, mailbox readiness, runtime status, outbound handoff, and Site governance docs. 2. Define a Site stabilization/reconciliation authority surface: inputs, read-only posture, proposed posture output, non-mutation rule, and evidence artifacts. 3. Implement or specify a command such as narada site stabilize, narada site reconcile-posture, narada operation readiness, or narada mailbox readiness. 4. The surface should inspect durable tasks/chapters/config posture, runtime health/quiescence, active/open/failed/retryable work, pending/confirmed/terminal outbound handoffs, stale durable docs that contradict runtime truth, ignored/private runtime files, repo remote/publish expectation, and residuals preventing full readiness. 5. Produce bounded human and JSON summaries; do not dump large raw runtime JSON or confirmed draft payloads by default. 6. Add readiness/posture vocabulary including operational_quiescent_with_approval_path_residual and blocked/stale-memory cases. 7. Use the Staccato stabilization case as motivating evidence without mutating the Staccato Site. 8. Add tests or a fixture proving stale durable memory plus advanced runtime truth yields a proposed reconciled posture. 9. Run pnpm verify and report residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T17:20:04.894Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Stabilization surface distinguishes durable tasks chapters config runtime health quiescence work items outbound handoffs and operator/session residuals
- [x] Command or checklist produces bounded human and JSON summaries with current health quiescence pending work pending effects confirmed effects residuals and recommended posture
- [x] Surface proposes posture updates rather than silently mutating Site docs config or doctrine
- [x] Readiness states include operational quiescent with residuals and detect stale durable memory that contradicts runtime truth
- [x] Source Staccato envelope is routed and focused tests or pnpm verify pass
