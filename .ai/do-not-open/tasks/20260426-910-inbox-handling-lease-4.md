---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T23:18:54.815Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T23:18:55.202Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 910 — Add concise inbox pending shortcut and docs

## Goal

Reduce pending crossing verbosity while preserving explicit target kind and target ref.

## Context

<!-- Context placeholder -->

## Required Work

1. Add `narada inbox pending <id> --to <kind>:<ref> --by <principal>`.
2. Route pending shortcut through existing recorded pending crossing logic.
3. Document claim/release, claimable work-next, structured actions, and pending shortcut.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `inbox pending <id> --to site_config_change:site-x --by operator` records a pending crossing.
- [x] Invalid `--to` values fail with bounded errors.
- [x] Canonical Inbox docs prefer the concise pending shortcut.
