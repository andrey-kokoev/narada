---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:22:56.714Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:22:57.002Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 758 — Migrate chapter status and task-spec validation commands to shared runner

## Goal

Remove bespoke output admission from chapter status and chapter validate-tasks-file while preserving their read/validation semantics.

## Context

<!-- Context placeholder -->

## Required Work

1. Replace hand-rolled result handling for narada chapter validate-tasks-file with runDirectCommand.
2. Replace hand-rolled result handling for narada chapter status with runDirectCommand.
3. Ensure chapter status no longer bypasses emitCommandResult with raw console.log.
4. Preserve current format option behavior and environment-format compatibility.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] chapter validate-tasks-file uses the shared runner and shared emitter.
- [x] chapter status uses the shared runner and shared emitter.
- [x] No command in this task emits object payloads through raw console.log.
- [x] Focused tests or typecheck verify the changed command registration.
