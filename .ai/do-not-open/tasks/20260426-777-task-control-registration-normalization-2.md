---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T02:11:48.260Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T02:11:48.401Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 777 — Extract task evidence command registration

## Goal

Move task evidence CLI registration out of main.ts into a dedicated module and make the output admission path uniform.

## Context

Evidence is the task-completion authority surface. Its command registration remains embedded in main.ts and mixes compatibility handling with command wiring.

## Required Work

1. Create a dedicated task evidence registration module under packages/layers/cli/src/commands/.
2. Move evidence inspect, list, assert-complete, prove-criteria, admit, and compatibility task-number handling into that module.
3. Use shared direct command action or direct command wrapper consistently for every evidence command.
4. Update main.ts to register evidence commands through the new module.
5. Preserve bounded-output behavior for evidence list: default limit remains bounded and --full remains explicit.

## Non-Goals

- Do not relax evidence admission rules.
- Do not make evidence list unbounded by default.
- Do not change lifecycle completion semantics.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the task evidence subcommand tree.
- [x] evidence list still defaults to bounded output and requires --full for unbounded output.
- [x] Backward-compatible narada task evidence <task-number> behavior is preserved.
- [x] Focused evidence-related tests or command wrapper tests pass.
- [x] CLI typecheck passes.
