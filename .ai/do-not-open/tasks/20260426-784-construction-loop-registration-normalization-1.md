---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T03:59:21.689Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T03:59:21.816Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 784 — Extract construction-loop command registration

## Goal

Move construction-loop CLI registration out of main.ts into a dedicated registrar without changing command names or flags.

## Context

Construction-loop commands remain a direct command tree in main.ts and are conceptually adjacent to chapter execution.

## Required Work

1. Create a dedicated construction-loop registration module under packages/layers/cli/src/commands/.
2. Move plan, policy show/init/validate, run, pause, resume, and metrics registration into that module.
3. Preserve command names, flags, defaults, policy subcommand shape, and dry-run behavior.
4. Update main.ts to call the new registrar and remove direct construction-loop command imports.

## Non-Goals

- Do not change construction-loop policy semantics.
- Do not run auto-promotion without --dry-run.
- Do not expand into verify/test-run/command-run registration.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the construction-loop subcommand tree.
- [x] The construction-loop registrar preserves all existing subcommands and options.
- [x] CLI typecheck passes.
- [x] CLI build passes.
