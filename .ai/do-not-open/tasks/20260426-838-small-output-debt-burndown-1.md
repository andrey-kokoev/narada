---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:00:21.135Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:00:21.480Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 838 — Remove task evidence list direct spacing output

## Goal

Remove the remaining direct console output allowance from task-evidence-list without changing evidence behavior.

## Context

task-evidence-list has one direct console.log blank-line allowance before warning/violation details. This is a small finite-output debt cluster.

## Required Work

1. Replace the direct blank-line console.log with the existing formatter path.
2. Remove the task-evidence-list allowlist entry from the output admission guard.
3. Preserve human readability and JSON result behavior.

## Non-Goals

- Do not change evidence verdict logic.
- Do not run unbounded evidence-list commands.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task-evidence-list.ts has no direct console/process output allowance.
- [x] The output admission guard passes.
- [x] @narada2/cli typecheck passes.
