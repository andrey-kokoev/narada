---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:23:04.996Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:23:05.119Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 797 — Extract alert acknowledgement command registration

## Goal

Move acknowledge-alert command construction out of main.ts into the outbound action registrar and verify the family as one command surface.

## Context

Alert acknowledgement is operator handling of failed outbound/control work and belongs with the outbound action command family for this extraction pass.

## Required Work

1. Move acknowledge-alert Commander construction into the outbound action registrar.
2. Remove now-unused imports from main.ts.
3. Run bounded help smoke checks across the extracted command family.
4. Run chapter assertion and fast verification before commit.

## Non-Goals

- Do not redesign alert lifecycle semantics.
- Do not perform destructive or external side effects.
- Do not extract principal/sites/ops-kit commands in this chapter.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs acknowledge-alert.
- [x] main.ts has no direct imports of the extracted outbound action command implementations.
- [x] Bounded smoke checks cover representative inspection, mutation, approval, retry, and alert commands.
- [x] Chapter 794-797 is evidence-complete and verification passes.
