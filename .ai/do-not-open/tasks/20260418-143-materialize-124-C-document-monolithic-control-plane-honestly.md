# Task 143: Materialize 124-C Document Monolithic Control-Plane Honestly

## Source

Derived from Task 461-C in `.ai/do-not-open/tasks/20260418-461-comprehensive-semantic-architecture-audit-report.md`.

## Why

Until extraction actually happens, the repo should describe the control-plane as monolithic rather than pretending it is already decomposed.

## Goal

Add an honest architecture note explaining the current monolithic state and what future extraction would require.

## Deliverables

- architecture doc section describing the current monolith
- explicit statement of why decomposition has not yet happened
- explicit extraction criteria for future work

## Definition Of Done

- [x] docs state the current control-plane is monolithic
- [x] docs explain the rationale and limits of the current state
- [x] docs distinguish current state from desired future decomposition

## Execution Notes

Added an "Architectural Honesty Note: The Monolithic Control Plane" section to `packages/layers/kernel/docs/02-architecture.md` immediately after the Component Overview. The note:

- Explicitly states that all control-plane layers (foreman, scheduler, charter runtime, outbound pipeline, coordinator store) live inside `packages/layers/kernel`
- Explains this is intentional: interfaces are still stabilizing (citing Task 134's `ResolveWorkItemRequest` change and the coordinator schema v2 revision as concrete examples), and premature extraction would create version churn without deployability benefits
- Lists what *is* already decomposed (cli, daemon, search, charters)
- Defines four explicit extraction criteria: interface stability for two minor releases, distinct release cadence, different dependency set, and concrete operational need for separate deployment

Also added a brief cross-reference:
- `packages/layers/kernel/AGENTS.md` — monolithic note before Control Plane Quick Reference
- Root `AGENTS.md` — packaging note in the Project Overview section

## Verification

- `pnpm verify` — all 8 steps passed (typecheck, build, kernel/daemon/charters/ops-kit/cli tests)
