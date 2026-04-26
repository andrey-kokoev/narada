---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:44:51.165Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:44:51.521Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 808 — Extract principal sync-from-tasks registration

## Goal

Move principal sync-from-tasks command construction out of main.ts into the principal registrar.

## Context

Task-to-principal reconciliation is a principal runtime repair operator and belongs under the principal registrar.

## Required Work

1. Move principal sync-from-tasks Commander construction into the registrar.
2. Preserve cwd, principal-state-dir, dry-run, format options, output emission, and error behavior.
3. Avoid running mutating sync during verification; use help smoke only.
4. Update main.ts to invoke only the registrar.

## Non-Goals

- Do not perform a mutating principal/task reconciliation.
- Do not change task governance semantics.
- Do not change bridge resolution rules.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs principal sync-from-tasks.
- [x] The registrar owns sync-from-tasks registration.
- [x] Bounded help smoke checks confirm sync-from-tasks remains available.
- [x] Typecheck/build succeeds.
