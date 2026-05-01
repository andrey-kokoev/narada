---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T03:47:38.503Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777607228315_wcschb
closed_at: 2026-05-01T03:48:54.693Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Gate operator-surface delivery on operator activity state

## Chapter

operator-surface-capa

## Goal

Prevent OSM delivery from interrupting active Operator typing or stealing focus without explicit admitted interruption authority.

## Context

Inbox incident env_e377c8f9-ea1d-4d0a-b6cb-50a9a3949838 reports that an operator-surface message delivery interrupted active human input. Current delivery posture treats target resolution as enough, rather than first proving idle or explicit interrupt admission.

## Required Work

Design and implement an OSM delivery admission gate with idle, active-typing, explicit-interrupt, queued, expired, and fallback-to-inbox states; default to queue/refuse while recent keyboard or mouse activity is detected unless urgent interruption is authorized; evaluate cross-desktop summon-to-current-desktop as an explicit visible workspace mutation; add tests or simulation fixtures for typing during delivery, same-desktop delivery, cross-desktop delivery, expiry fallback, and focus restoration.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] OSM delivery checks operator activity state before any focus/window/input mutation.
- [x] Default delivery queues, refuses, or falls back to inbox while recent operator typing/mouse activity is detected.
- [x] Urgent interruption requires explicit authority and is visible in send evidence.
- [x] Delivery result distinguishes queued_waiting_for_idle, delivered, expired, refused, and fallback_to_inbox.
- [x] Cross-desktop summon/switch behavior is policy-gated, visible, and reversible or explicitly rejected with rationale.
- [x] Tests or fixtures cover active typing during delivery, idle delivery, expiry fallback, and focus restoration.
