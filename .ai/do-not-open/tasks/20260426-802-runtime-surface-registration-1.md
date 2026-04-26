---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:37:41.835Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:37:42.225Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 802 — Extract sites command registration

## Goal

Move the sites command group out of main.ts into a dedicated registrar while preserving Site registry behavior.

## Context

Site registry operators form one runtime-locus management surface. main.ts should register that surface, not own each subcommand.

## Required Work

1. Create a sites command registrar under packages/layers/cli/src/commands.
2. Move sites list, discover, show, remove, init, and enable Commander construction into that registrar.
3. Preserve options, defaults, command names, descriptions, output format handling, and exit behavior.
4. Update main.ts to import and invoke the registrar only.

## Non-Goals

- Do not change Site registry semantics.
- Do not initialize or remove real Sites during verification.
- Do not extract unrelated command groups.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the sites command group.
- [x] The sites registrar owns all sites subcommand registration.
- [x] Bounded help smoke checks confirm sites commands remain available.
- [x] Typecheck/build succeeds.
