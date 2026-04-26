---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T02:12:02.030Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T02:12:02.152Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 778 — Extract task dispatch command registration

## Goal

Move task dispatch CLI registration out of main.ts into a dedicated module with resource-scoped shared command handling.

## Context

Dispatch opens the task lifecycle SQLite store and currently has custom registration logic in main.ts. It should match the extracted lifecycle pattern for resource-scoped command execution.

## Required Work

1. Create a dedicated task dispatch registration module under packages/layers/cli/src/commands/.
2. Move dispatch action registration into that module.
3. Use resourceScopedDirectCommandAction or the shared resource wrapper; ensure the SQLite lifecycle store is closed on both success and failure.
4. Update main.ts to register dispatch through the new module.
5. Preserve action names, options, defaults, and --exec behavior.

## Non-Goals

- Do not change dispatch queue semantics.
- Do not spawn execution sessions during tests.
- Do not expand beyond registration and wrapper normalization.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly registers task dispatch.
- [x] dispatch command execution still uses a lifecycle store and closes it through shared resource handling.
- [x] Focused dispatch tests pass.
- [x] CLI typecheck and build pass.
- [x] Chapter 776-778 is evidence-complete and committed.
