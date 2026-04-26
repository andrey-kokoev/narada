---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:09:11.166Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:09:11.270Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 789 — Extract test-run command registration

## Goal

Move Testing Intent Zone CLI registration out of main.ts into a dedicated registrar using shared command output admission.

## Context

TIZ is the canonical task verification path. Its command tree still lives directly in main.ts with manual output/error handling.

## Required Work

1. Create a dedicated test-run registration module under packages/layers/cli/src/commands/.
2. Move test-run run, inspect, and list registration into that module.
3. Use directCommandAction plus emitCommandResult.
4. Preserve command names, flags, defaults, task linkage, timeout behavior, and requester/rationale fields.
5. Run safe smoke checks and full repo verification.

## Non-Goals

- Do not run expensive tests through this chapter unless required for verification.
- Do not alter TIZ schema or stored run semantics.
- Do not bypass TIZ for new test execution behavior.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the test-run subcommand tree.
- [x] test-run commands no longer manually stringify or exit in main.ts.
- [x] Safe test-run list smoke check passes.
- [x] pnpm verify passes.
- [x] Chapter 787-789 is evidence-complete and committed.
