---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:00:53.774Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:00:54.158Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 840 — Remove principal sync direct output

## Goal

Remove principal-sync-from-tasks direct divergence row output allowance.

## Context

principal-sync-from-tasks has one direct console.log in a finite reconciliation command. It should use Formatter output instead.

## Required Work

1. Replace the direct divergence row console.log with Formatter-mediated output.
2. Remove the principal-sync-from-tasks allowlist entry.
3. Run principal sync-from-tasks help smoke and guard.

## Non-Goals

- Do not change reconciliation semantics.
- Do not run mutating principal sync as verification.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] principal-sync-from-tasks.ts has no direct console/process output allowance.
- [x] principal sync-from-tasks help smoke passes.
- [x] The guard report shows reduced debt.
