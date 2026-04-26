---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:00:06.921Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:00:07.330Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 812 — Extract next-task routing registration

## Goal

Move task peek-next, pull-next, and work-next command construction out of main.ts into the task operations registrar.

## Context

Next-task routing is a coherent agent ergonomics surface and should be owned outside main.ts.

## Required Work

1. Move task peek-next, pull-next, and work-next Commander construction into the registrar.
2. Preserve required agent option, cwd, format behavior, output emission, and mutation semantics.
3. Use help smoke checks only for mutating commands.
4. Update main.ts to invoke only the registrar.

## Non-Goals

- Do not claim tasks during verification.
- Do not change autoassignment or recommendation policy.
- Do not change execution packet semantics.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs task peek-next, pull-next, or work-next.
- [x] The registrar owns next-task routing registration.
- [x] Bounded help smoke checks confirm commands remain available.
- [x] Typecheck/build succeeds.
