---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T03:41:40.069Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T03:41:40.190Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 781 — Extract observation command registration

## Goal

Move observation CLI registration out of main.ts and make observation artifact commands use a uniform shared command result boundary.

## Context

Observation commands already use emitCommandResult on success but still handle errors manually in main.ts. Registration should be extracted and normalized.

## Required Work

1. Create a dedicated observation registration module under packages/layers/cli/src/commands/.
2. Move observation list, inspect, and open registration into that module.
3. Use shared direct command action/output admission consistently.
4. Preserve command names, flags, defaults, and output formats.
5. Update main.ts to call the new registrar.

## Non-Goals

- Do not change observation artifact storage.
- Do not open browsers or external viewers.
- Do not rename observation commands or flags.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs observation commands.
- [x] observation commands no longer contain manual error handling in main.ts.
- [x] Focused observation tests or CLI build pass.
- [x] CLI typecheck and pnpm verify pass.
- [x] Chapter 779-781 is evidence-complete and committed.
