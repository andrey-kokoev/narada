---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:39:48.031Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:39:48.444Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 851 — Remove sync follow-up spacing direct output

## Goal

Replace sync.ts direct blank-line output with Formatter output.

## Context

sync.ts has four direct blank-line console outputs in human follow-up messages. These can route through Formatter without changing sync behavior.

## Required Work

1. Replace direct blank-line console output in outputHumanReadable with Formatter-mediated output.
2. Remove remaining sync.ts allowlist entries from the output admission guard.
3. Preserve human message text.

## Non-Goals

- Do not change dry-run or sync result semantics.
- Do not run networked sync.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] sync.ts has no direct console/process output allowance.
- [x] sync help smoke passes.
- [x] The guard report no longer lists sync.ts.
