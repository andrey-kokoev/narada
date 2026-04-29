---
status: closed
depends_on: [1065]
amended_by: architect
amended_at: 2026-04-29T15:06:21.160Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T15:36:20.691Z
criteria_proof_verification:
  state: unbound
  rationale: Focused inbox tests cover observation and proposal envelope task creation, source-linked context, non-placeholder required work, criteria derivation, and optional Builder assignment; full verification passed.
closed_at: 2026-04-29T15:36:26.538Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Create tasks directly from inbox envelopes

## Chapter

Architect Builder Handoff Ergonomics

## Goal

Add an inbox-aware task creation path that turns envelope payload into a complete non-placeholder task specification with source linkage and optional Builder assignment.

## Context

This task should factor the reusable envelope-to-task generation needed by the Architect inbox processing command. The current task create scaffold leaves placeholder context and required work unless followed by manual amend commands.

## Required Work

1. Add a sanctioned CLI path to create a task from an inbox envelope id. 2. Map envelope title summary evidence proposal and recommendation into title goal context required work and criteria. 3. Preserve source envelope id and source ref in the task context. 4. Support optional assignment target such as builder. 5. Avoid placeholder TBD sections when envelope content is sufficient. 6. Add focused tests and run pnpm verify.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T15:06:21.160Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task create or inbox command supports creating a task from an envelope id
- [x] Generated task includes context required work criteria and source envelope reference from payload fields
- [x] Generated task avoids placeholder TBD sections when envelope has enough structure
- [x] Command supports assignment target such as builder without requiring separate roster command
- [x] Tests cover observation and proposal envelopes and pnpm verify passes
