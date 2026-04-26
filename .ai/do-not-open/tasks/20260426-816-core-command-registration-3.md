---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:08:25.213Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:08:25.652Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 816 — Extract inspection and admin singleton registration

## Goal

Move status, show, doctor, audit, and select command construction out of main.ts into an inspection/admin registrar.

## Context

These remaining singleton inspection/admin commands form a bounded surface and should not remain inline in main.ts.

## Required Work

1. Create an inspection/admin command registrar under packages/layers/cli/src/commands.
2. Move status, show, doctor, audit, and select Commander construction into the registrar.
3. Preserve deprecated scope aliases, option parsing, format handling, and wrapCommand behavior.
4. Update main.ts to invoke the registrar.

## Non-Goals

- Do not run live inspection commands that may produce large output.
- Do not change select pagination defaults.
- Do not change command names or aliases.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs status, show, doctor, audit, or select.
- [x] The inspection/admin registrar owns those command registrations.
- [x] Bounded help smoke checks confirm representative commands remain available.
- [x] Typecheck/build succeeds.
