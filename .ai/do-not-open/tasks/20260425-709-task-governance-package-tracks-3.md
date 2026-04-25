---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:53:47.390Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:53:49.805Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 709 — Separate CEIZ and TIZ Types From Task Governance Store Ownership

## Goal

Stop task-governance from conceptually owning command/test intent types merely because its SQLite store currently persists their rows.

## Context

The extracted package currently includes local CEIZ/TIZ row type copies so the lifecycle store can compile. That is a package-boundary shortcut, not a stable ontology.

## Required Work

1. Inventory command-run and verification-run types currently imported or duplicated in task-governance.
2. Decide and document whether CEIZ/TIZ should be lower packages, shared kernel types, or external tables exposed through an interface.
3. Implement the smallest coherent boundary improvement: move shared types to an appropriate package or replace concrete ownership with an injected interface.
4. Update imports and tests to reflect the new boundary.

## Non-Goals

- Do not redesign CEIZ or TIZ behavior from scratch.
- Do not merge CEIZ and TIZ merely to reduce files.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Task-governance no longer silently presents CEIZ/TIZ as task-owned concepts.
- [x] The chosen ownership of command-run and verification-run row types is documented.
- [x] Typecheck and package fast tests pass after boundary cleanup.
- [x] No command/test execution behavior regresses.


