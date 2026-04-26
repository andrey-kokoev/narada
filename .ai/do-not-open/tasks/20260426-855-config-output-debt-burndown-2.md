---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:48:41.221Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:48:41.605Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 855 — Remove config success-path direct output

## Goal

Route non-interactive config success-path blank-line and quick-start output through Formatter.

## Context

config.ts has direct output in the success quick-start block. This should use Formatter-mediated output.

## Required Work

1. Replace success-path direct blank-line output with Formatter output.
2. Replace quick-start numbered lines with Formatter output.
3. Remove config.ts allowlist entries from the output admission guard.

## Non-Goals

- Do not change the deprecation warning text.
- Do not change init-repo guidance.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] config.ts has no direct console/process output allowance.
- [x] narada init help smoke passes.
- [x] Guard report no longer lists config.ts.
