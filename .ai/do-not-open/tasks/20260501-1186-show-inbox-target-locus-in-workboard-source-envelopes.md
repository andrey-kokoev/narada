---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T18:06:16.413Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777658732669_hm6jxk
closed_at: 2026-05-01T18:06:57.642Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Show inbox target locus in workboard source envelopes

## Chapter

operator-surface-handoff-ergonomics

## Goal

Make workboard compact output preserve directed inbox target_locus so agent-directed handoffs remain observable.

## Context

Inbox envelope env_faf487ee-2d1a-4bec-8d36-b6550dbd352d reports that narada-andrey submitted an inbox observation with --target-locus narada-andrey.Bob, but task workboard compact source_envelopes displayed target: null. Submit response had routing.target_locus, so workboard loses directed-message observability.

## Required Work

Persist or project target_locus into the portable envelope or canonical routing field consumed by workboard; update compact workboard source_envelopes to show directed message targets; add regression coverage for target_locus visibility.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Inbox submit target_locus is available to downstream workboard/read-model consumers.
- [x] task workboard compact source_envelopes shows the target locus for directed inbox messages.
- [x] The fix avoids debug/full-payload dependence for directed-message observability.
- [x] Tests cover a submitted envelope with target_locus and workboard compact output preserving it.
