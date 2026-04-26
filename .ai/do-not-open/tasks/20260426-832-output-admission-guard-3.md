---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T19:46:58.703Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T19:46:59.119Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 832 — Document the guard policy in CLI output helpers

## Goal

Make the intended path for finite output construction clear to future command authors.

## Context

The code now has helpers, but authors need a short local rule at the helper layer so they do not choose console.log by default.

## Required Work

1. Add concise comments near output helper exports explaining finite result output, formatter-backed output, finite failure, and long-lived startup output.
2. Avoid broad documentation rewrites.
3. Ensure terminology matches output creation versus output admission.

## Non-Goals

- Do not edit global semantic docs in this chapter.
- Do not rename existing public command flags.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] cli-output.ts locally explains which helper to use for finite and long-lived command surfaces.
- [x] Comments do not introduce new semantics beyond existing helper behavior.
- [x] @narada2/cli typecheck passes.
