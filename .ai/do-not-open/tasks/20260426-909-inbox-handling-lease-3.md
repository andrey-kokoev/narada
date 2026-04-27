---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T23:18:46.329Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T23:18:46.833Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 909 — Make inbox work-next claimable and structured

## Goal

Make `work-next` suitable for agents by optionally claiming the selected envelope and returning structured action specs.

## Context

<!-- Context placeholder -->

## Required Work

1. Add `--claim --by <principal>` to `inbox work-next`.
2. Return action specs with command, args, mutates, target_mutation, and pending metadata.
3. Ensure claimed work-next selects only received envelopes and returns the claimed envelope in handling state.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `inbox work-next --claim --by <principal>` returns a handling envelope.
- [x] Admissible actions are structured specs, not only strings.
- [x] Running claimable work-next again does not return the already claimed envelope as received.
