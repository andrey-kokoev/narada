---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T03:35:32.784Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777606507257_wpio9z
closed_at: 2026-05-01T03:35:59.766Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Improve inbox routing ergonomics and side-effect visibility

## Chapter

operator-ergonomics

## Goal

Make inbox/work-next routing fast, bounded, and clear about side effects and dirty-state ownership.

## Context

Inbox observation env_b5c0283c-d912-46ce-a39c-bf1bec597a8f records routing friction from law-propagation and CAPA handling: slow work-next/pending/create calls, overlarge output, surprising task projection side effects, missing first-class law notice command, ambiguous operator-surface bindings, and unclear owned vs unowned dirty state.

## Required Work

Audit inbox work-next, inbox pending, task create, and related routing surfaces; reduce default output; expose progress or latency posture for multi-second commands; make side effects explicit before/after mutation; classify dirty files as owned routing artifacts vs unrelated working changes where possible; split any large implementation findings into follow-up tasks.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] inbox work-next default output is bounded and avoids full envelope body dumps unless explicitly requested.
- [x] Routing commands report side effects such as lifecycle projection updates before or immediately after mutation.
- [x] Multi-second inbox/task routing commands expose progress, timing, or a clear wait posture.
- [x] Dirty-state output distinguishes newly created routing artifacts from pre-existing unrelated modifications where feasible.
- [x] The first-class law notice gap and operator-surface binding ambiguity are either addressed or linked to existing tasks.
- [x] Focused tests or CLI fixtures cover bounded work-next output and side-effect reporting.
