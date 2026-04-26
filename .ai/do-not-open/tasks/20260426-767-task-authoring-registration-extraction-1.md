---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T01:11:14.095Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T01:11:14.233Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 767 — Extract task authoring registration module

## Goal

Move the task allocate/create/amend/promote-recommendation Commander registrations out of main.ts into a focused command-family registration module.

## Context

<!-- Context placeholder -->

## Required Work

1. Create a task authoring registration module under packages/layers/cli/src/commands.
2. Move the allocate/create/amend/promote-recommendation registration code into that module.
3. Keep option names, descriptions, defaults, and parsing behavior unchanged.
4. Keep the module using directCommandAction and shared output admission.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer imports the four task authoring service commands directly.
- [x] main.ts delegates registration of the four task authoring subcommands to the new module.
- [x] The new module contains the existing option declarations and service-command adapters.
- [x] CLI typecheck passes.
