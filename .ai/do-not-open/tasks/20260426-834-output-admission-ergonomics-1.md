---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T19:53:39.126Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T19:53:39.530Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 834 — Add formatted result ergonomics helper

## Goal

Give command implementations one obvious helper for returning human formatted output without direct stdout writes.

## Context

Command authors currently call attachFormattedOutput directly and hand-roll object wrapping. A small helper should reduce friction and make the preferred path clearer.

## Required Work

1. Add a formattedResult helper that takes result data, human text, and format, returning the JSON-safe result or _formatted human result.
2. Keep attachFormattedOutput available for compatibility.
3. Update at least one migrated command file to use the new helper.
4. Preserve existing JSON and human behavior.

## Non-Goals

- Do not redesign Formatter.
- Do not migrate every command in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] formattedResult is exported from cli-output.ts.
- [x] At least one command uses formattedResult instead of hand-wrapping attachFormattedOutput.
- [x] @narada2/cli typecheck passes.
