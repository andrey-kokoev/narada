---
status: closed
amended_by: architect
amended_at: 2026-04-29T14:38:17.834Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-29T14:38:41.283Z
criteria_proof_verification:
  state: unbound
  rationale: Docs-only doctrine task verified by pnpm verify and direct source inspection. CAPA Operation is defined in docs/concepts/capa-operation.md with distinct relationship table, record fields, lifecycle, closure requirements, raw-output incident discipline, and review handoff incident discipline. Inhabited Evolution now requires explicit review handoff artifacts for Builder completion expecting Architect or Operator admission. AGENTS links the doctrine. Source envelopes env_186fccec-c23b-43c8-8e64-8fb2fd916b57 and env_f37130c9-14ae-4219-9c98-60998277ed6a were promoted to decision:task-1063-capa-operation-doctrine.
closed_at: 2026-04-29T14:38:50.867Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Define canonical CAPA Operation and review handoff doctrine

## Chapter

CAPA Operation Doctrine

## Goal

Add a Narada-native CAPA Operation doctrine for recurrence-risk incidents, including raw-output containment and explicit Builder-to-Architect review handoff crossing failures.

## Context

Inbox envelopes env_186fccec-c23b-43c8-8e64-8fb2fd916b57 and env_f37130c9-14ae-4219-9c98-60998277ed6a exposed two recurrence-risk incidents: raw oversized diagnostic output admitted into chat, and Builder completion lacking an explicit Architect review handoff. The work defines a Narada-native CAPA Operation and updates inhabited construction doctrine so recurrence prevention is durable rather than apology- or memory-based.

## Required Work

1. Define CAPA Operation as distinct from observations, proposals, tasks, chapters, and reviews. 2. Specify CAPA trigger conditions, record fields, lifecycle, closure requirements, and anti-autoimmune boundary. 3. Add raw-output incident discipline requiring artifact-first bounded summaries. 4. Add explicit Builder completion review handoff requirements when Architect or Operator admission is expected. 5. Link the doctrine from AGENTS and route the source inbox envelopes to this work. 6. Verify with pnpm verify.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T14:38:17.833Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] CAPA Operation is defined as distinct from ordinary observations proposals tasks and chapters
- [x] CAPA record fields and lifecycle include containment cause corrective action preventive action verification dissemination and closure
- [x] Builder completion requiring Architect review has an explicit review_request or handoff artifact requirement
- [x] Raw diagnostic output incidents require artifact-first bounded-summary discipline
- [x] Source inbox envelopes are routed to the CAPA work and pnpm verify passes
