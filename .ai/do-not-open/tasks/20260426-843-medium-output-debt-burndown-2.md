---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:13:18.023Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:13:18.414Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 843 — Remove task graph full-output direct output

## Goal

Remove task-graph direct console output used for explicit full Mermaid mode.

## Context

task-graph has three direct console.log allowances for the full Mermaid code block. This should return formatted output through the command result path instead.

## Required Work

1. Return full Mermaid code block as formatted command result instead of writing directly to stdout.
2. Remove task-graph allowlist entries from the output admission guard.
3. Preserve bounded default behavior and JSON behavior.

## Non-Goals

- Do not change graph generation semantics.
- Do not open browser rendering during verification.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task-graph.ts has no direct console/process output allowance.
- [x] task graph help smoke passes.
- [x] The output admission guard passes with reduced debt.
