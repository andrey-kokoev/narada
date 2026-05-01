---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T19:59:17.965Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777665543043_tbnrjn
closed_at: 2026-05-01T20:00:16.230Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Define governed cross-desktop operator-surface delivery mode

## Chapter

operator-surface-cross-desktop-delivery

## Goal

Provide an admitted, operator-visible delivery path when an operator-surface message targets a window on another Windows desktop, while keeping hidden focus stealing refused by default.

## Context

Inbox envelope env_00f2c430-c05e-41af-a1c0-3ac89c5883a3 reports that narada-cpy.builder had available work but OSM nudge delivery was refused because the caller was on Windows desktop 4 and the target was on desktop 5. The refusal protected the Operator from hidden focus stealing, but the workflow stalled without a governed alternative.

## Required Work

Define and implement or specify a cross-desktop delivery posture for operator-surface messages. Preserve refusal as the default for hidden or unsafe cross-desktop input injection. Add at least one admitted alternative such as queued notification, operator-confirmed switch-send-restore, or visible countdown foreground-last-resort with restoration evidence. Return operator-actionable diagnostics that name current desktop, target desktop, policy, delivery case, and exact safe next action. Record evidence for refused, queued, delivered, and operator-confirmed outcomes.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Cross-desktop hidden input delivery remains refused by default unless an admitted policy explicitly permits it.
- [x] At least one safe cross-desktop alternative is specified or implemented with visible operator control.
- [x] Failure output names current desktop, target desktop, policy, delivery case, and exact safe next action.
- [x] Delivery evidence distinguishes refused, queued, delivered, and operator-confirmed outcomes.
- [x] Regression or fixture coverage proves cross_desktop_delivery_refused_by_policy returns bounded actionable output instead of only a hard stall.
