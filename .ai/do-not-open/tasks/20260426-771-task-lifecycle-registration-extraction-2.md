---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T01:27:33.061Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T01:27:33.202Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 771 — Extract task lifecycle registration module

## Goal

Move task lifecycle command registrations out of main.ts into a focused command-family registration module.

## Context

<!-- Context placeholder -->

## Required Work

1. Create a task lifecycle registration module under packages/layers/cli/src/commands.
2. Move claim, release, report, continue, finish, review, close, reopen, and confirm registrations into that module.
3. Use directCommandAction and the new resource-scoped helper where appropriate.
4. Preserve option names, descriptions, defaults, parsing, and service-command behavior.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer imports lifecycle service commands directly.
- [x] main.ts delegates lifecycle subcommand registration to the new module.
- [x] review and close still open and close TaskLifecycleStore through the shared resource boundary.
- [x] CLI typecheck passes.
