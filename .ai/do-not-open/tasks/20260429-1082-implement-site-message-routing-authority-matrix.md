---
status: closed
amended_by: builder
amended_at: 2026-04-29T17:38:41.438Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T17:54:16.145Z
criteria_proof_verification:
  state: unbound
  rationale: Site config/schema now declares message_routing_authority with principal route rules, default deny-cross-locus posture, refusal reasons, and authority-level/kind matching. CLI inbox submit/submit-observation and task handoff --route-inbox call the shared route decision. MCP narada_inbox_submit_observation passes target_locus into the same inbox command path. inbox doctor exposes routing policy inspection. Focused tests cover allowed local Builder handoff, refused Builder upstream submission, and allowed Architect upstream escalation across CLI and MCP; pnpm verify passes.
closed_at: 2026-04-29T17:54:36.263Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Implement Site message routing authority matrix

## Chapter

Site Message Routing Authority

## Goal

Define and implement a Site-configured routing authority matrix that controls which principals may send which envelope kinds to which loci, with CLI and MCP enforcement for inbox and handoff submissions.

## Context

Inbox envelope env_4e363212-3e43-4812-98f4-e649790dcd15 proposes making cross-locus message routing an enforceable Site authority matrix rather than convention. Triggering case: Builder should report observations and handoffs to the local User Site/Architect, while Architect is the admitted role for upstream Narada proper escalation after local admission or explicit Operator instruction.

## Required Work

1. Read canonical inbox, canonical routing/addressing, Site governance coordinates, delegated role taxonomy, MCP facade, and task handoff docs. 2. Define a Site-configured message_routing_authority matrix shape or equivalent authority-routing file. 3. The invariant must decide principal + target_locus + envelope_kind + authority_level as admitted, refused, or requires escalation approval. 4. Add read-only inspection/doctor support so agents can see allowed routes and refusal reasons. 5. Enforce on narada inbox submit, narada inbox submit-observation, narada task handoff --route-inbox, and MCP mutating inbox tools where present. 6. Preserve explicit Operator override and Architect escalation approval as admitted conditions, not hidden bypasses. 7. Add tests covering allowed local Builder handoff, refused Builder upstream submission, allowed Architect upstream escalation, and shared CLI/MCP behavior or documented MCP deferral. 8. Run pnpm verify and report residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by builder at 2026-04-29T17:38:41.438Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Site config or referenced authority file can declare principal target locus envelope kind authority level permissions and refusal reasons.
- [x] CLI inbox submission and handoff routing enforce the matrix for allowed local Builder handoff refused Builder upstream submission and allowed Architect upstream escalation.
- [x] MCP mutating inbox tools enforce the same routing rule or explicitly defer with documented bounded blocker.
- [x] Read-only inspection or doctor surface shows a principal's allowed routes and clear refusal reasons.
- [x] Source inbox envelope is routed and focused tests or pnpm verify pass.
