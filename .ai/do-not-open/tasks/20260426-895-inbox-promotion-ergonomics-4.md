---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:46:00.229Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:46:00.662Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 895 — Document roster enrollment and inbox task ergonomics

## Goal

Make the new sanctioned operator paths visible so direct roster edits and awkward promotion invocations do not reappear.

## Context

<!-- Context placeholder -->

## Required Work

1. Document `narada task roster add <agent-id>` as the sanctioned roster enrollment path.
2. Document `narada inbox task <envelope-id>` as the ergonomic task promotion path.
3. Update examples to prefer ergonomic commands while preserving canonical semantics.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Canonical Inbox docs prefer `inbox task` for task promotion.
- [x] Task/agent docs or AGENTS guidance mention roster add as sanctioned enrollment.
- [x] Docs distinguish ergonomic alias from underlying governed crossing.
