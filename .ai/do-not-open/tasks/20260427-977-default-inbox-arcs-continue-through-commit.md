---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T20:22:40.528Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T20:22:41.062Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Default inbox arcs continue through commit

## Chapter

Agent execution defaults

## Goal

Document the default behavior that actionable inbox items should be processed through full chapter arcs rather than stopping at availability reporting.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Agent execution contract states that actionable inbox work should proceed through task/chapter creation
- [x] execution
- [x] verification
- [x] closure
- [x] inbox handling
- [x] commit
- [x] push
- [x] and recheck.
- [x] Root AGENTS guidance references the same default without overriding explicit operator constraints or permission boundaries.
- [x] The instruction preserves stopping only for real blockers
- [x] external permission
- [x] destructive risk
- [x] or unclear target locus.
- [x] Verify with pnpm verify and close this task.
