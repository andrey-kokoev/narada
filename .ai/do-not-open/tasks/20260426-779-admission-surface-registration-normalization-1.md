---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T03:41:12.555Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T03:41:12.688Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 779 — Extract posture command registration

## Goal

Move posture CLI registration out of main.ts and route posture output/errors through the shared command result boundary.

## Context

Posture commands still use bespoke console.log, console.error, and process.exit handling in main.ts. This violates the command admission pattern established for task command surfaces.

## Required Work

1. Create a dedicated posture registration module under packages/layers/cli/src/commands/.
2. Move posture show, update, and check registration into that module.
3. Use directCommandAction or runDirectCommand semantics consistently.
4. Preserve command names, flags, defaults, and output formats.
5. Update main.ts to call the new registrar.

## Non-Goals

- Do not change CCC posture schema.
- Do not change posture file semantics.
- Do not rename posture commands or flags.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs posture subcommands.
- [x] posture commands no longer contain bespoke console/process handling in main.ts.
- [x] CLI typecheck passes.
- [x] Focused relevant command tests or build pass.
