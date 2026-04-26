---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:55:18.268Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:55:18.766Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 900 — Expose active assignment shape in roster display

## Goal

Make roster output less misleading when multiple agents are associated with one task.

## Context

<!-- Context placeholder -->

## Required Work

1. Add bounded ownership hints to roster show output using assignment records where available.
2. Distinguish primary assignment, takeover, and continuation labels without changing roster authority.
3. Keep JSON output backward-compatible by adding optional metadata rather than changing existing agent fields.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Human roster display can show ownership role for active task rows.
- [x] JSON roster output includes optional ownership metadata.
- [x] Existing roster consumers continue to work.
