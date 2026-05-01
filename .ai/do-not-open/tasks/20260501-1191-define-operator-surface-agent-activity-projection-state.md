---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T19:37:21.139Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777664197542_wnzblb
closed_at: 2026-05-01T19:35:18.455Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Define Operator Surface Agent activity projection state

## Chapter

operator-surface-activity-projection

## Goal

Make Operator Surface Agent activity a first-class projection distinct from task lifecycle authority so overlays and work surfaces can show what inhabited agents are doing without authority collapse.

## Context

Inbox envelope env_01cb73bc-deab-44a6-8099-9b92d8aa8f8c reports that narada-andrey overlay labels should project an agent activity state machine, not merely current task affinity. Idle should be the hidden/default state, while executing, in_review or awaiting_review, reviewing, blocked, processing inbox, and messaging should be visible operator-surface states.

## Required Work

Define the canonical Operator Surface Agent activity projection model in doctrine/product documentation and, where appropriate, code-level types or command output. Separate activity projection from task lifecycle authority: activity may summarize task, inbox, review, OSM, or blocker posture, but must not become the authority for those states. Specify which activity states are operator-visible, which are internal/evidence-only, and how adapters should render idle versus non-idle states. Identify the source evidence required for each state and the fallback behavior when evidence is stale or unavailable.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Documentation defines activity projection as distinct from task lifecycle, inbox, review, and operator-surface message authority.
- [x] A canonical initial activity-state family covers idle, executing, awaiting_review, reviewing, blocked, processing_inbox, messaging, and unknown/stale evidence.
- [x] Operator-visible rendering guidance says idle is the unit/default posture and should not create label noise.
- [x] The model identifies source evidence and freshness expectations for each projected state.
- [x] Any existing workboard or operator-surface output touched by the task preserves authority provenance instead of presenting projection as truth.
