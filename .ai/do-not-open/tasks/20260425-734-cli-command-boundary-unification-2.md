---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:34:08.449Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:34:08.843Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 734 — Migrate core task lifecycle command actions

## Goal

Remove duplicated direct result/error/exit handling from the core task lifecycle commands.

## Context

<!-- Context placeholder -->

## Required Work

1. Migrate task claim, release, report, continue, and finish actions to the direct command runner.
2. Keep each command's option mapping unchanged.
3. Do not change task command service behavior.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task claim action has no local console.error/process.exit boilerplate.
- [x] task release action has no local console.error/process.exit boilerplate.
- [x] task report action has no local console.error/process.exit boilerplate.
- [x] task continue action has no local console.error/process.exit boilerplate.
- [x] task finish action has no local console.error/process.exit boilerplate.
