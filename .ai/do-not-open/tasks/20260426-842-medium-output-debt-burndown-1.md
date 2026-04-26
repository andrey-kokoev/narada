---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:13:02.075Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:13:02.469Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 842 — Remove backup listing direct output

## Goal

Remove backup-ls direct console output by routing blank spacing and type summary rows through Formatter.

## Context

backup-ls has two direct output allowances: a blank line and manual type summary rows. This is a small finite command output debt cluster.

## Required Work

1. Replace backup-ls direct console.log blank line with Formatter output.
2. Replace manual type summary row console.log with Formatter table or equivalent Formatter-mediated output.
3. Remove backup-ls allowlist entries from the output admission guard.

## Non-Goals

- Do not alter backup archive parsing.
- Do not create or restore backup files.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] backup-ls.ts has no direct console/process output allowance.
- [x] backup-ls help smoke passes.
- [x] The output admission guard passes.
