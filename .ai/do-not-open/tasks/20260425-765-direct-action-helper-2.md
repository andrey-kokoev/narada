---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:48:58.607Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:48:58.732Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 765 — Migrate task authoring command registrations to action helper

## Goal

Apply the direct command action helper to a bounded family of task authoring commands in main.ts.

## Context

<!-- Context placeholder -->

## Required Work

1. Migrate task allocate to the helper.
2. Migrate task create to the helper.
3. Migrate task amend to the helper.
4. Migrate task promote-recommendation to the helper.
5. Preserve all existing option parsing and command behavior.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The migrated commands no longer wrap runDirectCommand manually in their Commander action registrations.
- [x] The migrated commands still pass their existing option values to service commands.
- [x] Focused tests for the affected commands and command wrapper pass.
- [x] CLI typecheck passes.
