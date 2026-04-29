---
status: closed
depends_on: [1058]
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T00:23:19.860Z
criteria_proof_verification:
  state: unbound
  rationale: Chapter verification passed. Origin envelope env_7530976f was archived after Narada proper implementation, and external thoughts Site config follow-through was routed as pending crossing env_cc911979. Docs explicitly preserve thoughts Site authority. Focused tests and pnpm verify passed.
closed_at: 2026-04-29T00:23:25.097Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1059 — Verify Site-local daemon source chapter and route external residuals

## Goal

Verify the daemon source chapter, publish source-envelope evidence, and route any thoughts/User/PC Site implementation residuals to the correct authority locus.

## Context

The originating friction came from the thoughts Project Site. Narada proper can define/fix kernel and CLI behavior, but thoughts Site local daemon config/materialization belongs to that Site unless explicitly routed back through a governed crossing.

## Required Work

1. Run focused tests for any implementation tasks and pnpm verify after lifecycle export.
2. Confirm no docs imply Narada proper owns the thoughts Site daemon runtime or local config by default.
3. Route external residuals to thoughts/User/PC Site inboxes when authority belongs there.
4. Mark env_7530976f as pending/promoted/archive according to the chapter outcome.
5. Prepare Builder and Inspector instructions for any implementation follow-through.

## Non-Goals

- Do not mutate the thoughts Site from Narada proper
- Do not close implementation tasks without Builder evidence

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Verification passes or blockers are recorded precisely
- [x] Originating inbox envelope is handled through sanctioned inbox transition
- [x] External Site residuals are routed rather than hidden
- [x] Chapter is ready for Builder implementation/review
