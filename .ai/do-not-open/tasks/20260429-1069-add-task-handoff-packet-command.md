---
status: closed
depends_on: [1065]
amended_by: architect
amended_at: 2026-04-29T15:06:50.725Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T16:16:38.188Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests and live command checks cover human/json handoff packets, required packet fields, artifact writing, optional inbox routing as observation, bounded output posture, and pnpm verify passed.
closed_at: 2026-04-29T16:16:43.673Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add task handoff packet command

## Chapter

Architect Builder Handoff Ergonomics

## Goal

Add a command that produces a bounded Builder handoff packet from a task, including source envelopes, criteria, verification expectation, residuals, and review return path.

## Context

This task addresses missing explicit handoff packets. Builder and Architect need a bounded artifact that says what work is being handed off, what evidence exists, what decision is requested, and where review should return.

## Required Work

1. Add a task handoff command that reads a task and emits a bounded packet. 2. Include task id, number, title, goal, context summary, criteria, dependencies, assignment, source envelopes if available, verification expectations, residuals, and return review path. 3. Support human and JSON formats. 4. Support writing a durable artifact and optionally routing it as inbox handoff or review_request if that message kind is available. 5. Keep output bounded and avoid dumping full lifecycle or inbox transcripts. 6. Add tests and run pnpm verify.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T15:06:50.725Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task handoff command emits human and json handoff packets for a task
- [x] Packet includes task id number title goal criteria dependencies assignment source envelopes changed loci if known verification expectations and return review path
- [x] Command can write a durable handoff artifact and optionally route it through inbox as review_request or handoff
- [x] Output is bounded and never dumps full task lifecycle or inbox payload transcripts by default
- [x] Tests cover human json artifact and bounded output behavior and pnpm verify passes
