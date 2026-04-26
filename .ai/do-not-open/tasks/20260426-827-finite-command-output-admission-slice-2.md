---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T19:34:58.305Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T19:34:58.922Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 827 — Normalize task search formatted output

## Goal

Remove direct console writes from task-search.ts by returning formatted search output as a command result.

## Context

task search is a finite inspection command that still prints result rows directly while the registrar already routes through shared command emission.

## Required Work

1. Build task search human output as a string instead of using console.log.
2. Attach formatted output to the result for human/auto format.
3. Preserve JSON format behavior and service exit codes.
4. Keep the existing task search command surface unchanged.

## Non-Goals

- Do not change search indexing or ranking.
- Do not change task search service output schema.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task-search.ts has no direct console.log/console.error/process.exit use.
- [x] task search help remains available.
- [x] @narada2/cli typecheck passes.
