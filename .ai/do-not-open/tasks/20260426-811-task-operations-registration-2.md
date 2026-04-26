---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:59:51.679Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:59:52.024Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 811 — Extract task observation registration

## Goal

Move task list, search, read, and graph command construction out of main.ts into the task operations registrar.

## Context

Task observation commands are read-only or bounded inspection surfaces and should not remain inline in main.ts.

## Required Work

1. Move task list, search, read, and graph Commander construction into the registrar.
2. Preserve command names, arguments, options, bounded graph default, format behavior, and output emission.
3. Keep task search custom handling semantically unchanged.
4. Update main.ts to invoke only the registrar.

## Non-Goals

- Do not broaden task graph output by default.
- Do not change task read semantics.
- Do not change task search indexing or matching.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs task list, search, read, or graph.
- [x] The registrar owns task observation registration.
- [x] Bounded help smoke checks confirm commands remain available.
- [x] Typecheck/build succeeds.
