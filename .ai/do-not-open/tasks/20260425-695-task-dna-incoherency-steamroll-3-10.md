---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:41:02.865Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:48:04.947Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:48:06.203Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Purge legacy review/report artifact assumptions from touched tests

## Goal

Tests should stop treating .ai/reviews JSON files and task report JSON files as authoritative review/report records.

## Context

task-review tests already exposed fossilized .ai/reviews and tasks/reports assumptions. More touched tests may still encode this.

## Required Work

Search touched test surfaces for legacy review/report file assertions; migrate them to SQLite records or sanctioned read surfaces; preserve compatibility projection tests only when explicitly named.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:41:02.865Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Touched tests do not read .ai/reviews as review authority
- [x] Touched tests do not read tasks/reports as report authority
- [x] Compatibility projection tests are explicitly labeled if retained
- [x] Focused test suite passes


