---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T03:48:11.841Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T03:48:11.936Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 782 — Extract chapter command registration

## Goal

Move chapter CLI registration out of main.ts into a dedicated registrar while preserving the existing shared command-result boundary.

## Context

Chapter commands are the operating rhythm for this remediation chain, but their command tree still lives directly in main.ts.

## Required Work

1. Create a dedicated chapter registration module under packages/layers/cli/src/commands/.
2. Move finish-range, assert-complete, init, validate-tasks-file, status, and close registration into that module.
3. Preserve command names, flags, defaults, output formats, and range behavior.
4. Update main.ts to call the new registrar and remove direct chapter command imports that are no longer needed.

## Non-Goals

- Do not change chapter lifecycle semantics.
- Do not rename chapter commands or flags.
- Do not expand into construction-loop registration in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the chapter subcommand tree.
- [x] Chapter commands still route through shared command output admission.
- [x] CLI typecheck passes.
- [x] CLI build passes.
