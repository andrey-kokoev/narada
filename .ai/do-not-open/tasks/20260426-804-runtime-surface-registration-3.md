---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:38:04.857Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:38:05.291Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 804 — Extract workbench command registration

## Goal

Move the workbench command group out of main.ts into a dedicated registrar while preserving bounded diagnostics and server behavior.

## Context

Workbench is a self-build UI/runtime surface. Its command registration should have one owner outside main.ts.

## Required Work

1. Create a workbench command registrar under packages/layers/cli/src/commands.
2. Move workbench diagnose and serve Commander construction into that registrar.
3. Preserve bounded diagnose output, server start behavior, SIGINT shutdown handling, options, and defaults.
4. Update main.ts to import and invoke the registrar only.

## Non-Goals

- Do not start the workbench server during verification.
- Do not change workbench HTTP API behavior.
- Do not broaden diagnose output.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the workbench command group.
- [x] The workbench registrar owns all workbench subcommand registration.
- [x] Bounded help smoke checks confirm workbench commands remain available.
- [x] Typecheck/build succeeds.
