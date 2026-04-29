---
status: opened
depends_on: [1065]
amended_by: architect
amended_at: 2026-04-29T15:06:50.725Z
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

- [ ] task handoff command emits human and json handoff packets for a task
- [ ] Packet includes task id number title goal criteria dependencies assignment source envelopes changed loci if known verification expectations and return review path
- [ ] Command can write a durable handoff artifact and optionally route it through inbox as review_request or handoff
- [ ] Output is bounded and never dumps full task lifecycle or inbox payload transcripts by default
- [ ] Tests cover human json artifact and bounded output behavior and pnpm verify passes
