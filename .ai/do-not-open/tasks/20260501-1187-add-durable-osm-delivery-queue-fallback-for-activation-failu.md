---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T18:13:39.493Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777659193700_tywpbq
closed_at: 2026-05-01T18:14:52.405Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add durable OSM delivery queue fallback for activation failures

## Chapter

operator-surface-delivery-state

## Goal

Make operator-surface messages survive focus/activation failures by recording delivery promises and fallback outcomes.

## Context

Inbox envelope env_e7112f00-64cd-4d5b-a476-005f472ec2e3 reports that narada-andrey OSM delivery failed with activation_failed: SetForegroundWindow returned False and foreground HWND was 0. This shows direct clipboard/sendkeys delivery remains too synchronous and fragile even after delivery admission states.

## Required Work

Add durable queued delivery promise/fallback handling for OSM activation failures; return small status objects such as accepted_for_delivery, delivered, deferred, failed_with_fallback; retry or route to target identity inbox when the target surface is not visible or activatable; record failed-delivery evidence without large payload dumps.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] OSM send records a durable delivery promise before focus-sensitive delivery attempts when policy admits queued delivery.
- [x] Activation failure transitions to deferred or failed_with_fallback instead of disappearing as a raw send failure.
- [x] Fallback to target identity inbox includes explicit failed-delivery evidence and target identity.
- [x] Caller output is bounded and reports delivery state without dumping large evidence payloads.
- [x] Tests cover SetForegroundWindow/activation failure, queued retry posture, and inbox fallback.
