---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T03:41:28.689Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T03:41:28.825Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 780 — Extract task reconcile command registration

## Goal

Move task reconcile CLI registration out of main.ts and route reconcile output/errors through shared output admission.

## Context

Task reconciliation is a sanctioned repair surface, but its command wiring still prints JSON directly and exits manually.

## Required Work

1. Create a dedicated task reconcile registration module under packages/layers/cli/src/commands/.
2. Move reconcile inspect, record, and repair registration into that module.
3. Use shared direct command action/output admission consistently.
4. Preserve command names, flags, defaults, and output formats.
5. Update main.ts to call the new registrar.

## Non-Goals

- Do not change reconciliation finding semantics.
- Do not apply reconciliation repairs as part of this task.
- Do not rename reconcile commands or flags.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the task reconcile subcommand tree.
- [x] reconcile commands no longer JSON.stringify directly in main.ts.
- [x] Focused reconcile tests or CLI build pass.
- [x] CLI typecheck passes.
