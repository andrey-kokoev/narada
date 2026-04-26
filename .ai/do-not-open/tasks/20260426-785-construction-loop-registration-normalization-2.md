---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T03:59:29.669Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T03:59:29.776Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 785 — Normalize construction-loop output admission

## Goal

Make construction-loop command implementations return formatted output through the shared CLI output boundary instead of printing internally.

## Context

Construction-loop command implementations currently call formatter output internally, which forced bespoke suppression logic in main.ts.

## Required Work

1. Replace internal human-output side effects with attachFormattedOutput where practical.
2. Ensure the registrar can use directCommandAction plus emitCommandResult uniformly.
3. Preserve JSON output shape for all construction-loop commands.
4. Preserve human output content while moving admission to the shared boundary.

## Non-Goals

- Do not redesign construction-loop plans.
- Do not remove existing human formatting content.
- Do not change recommendation or promotion scoring.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] construction-loop commands no longer require bespoke main.ts output suppression.
- [x] Human output is attached as _formatted for non-json modes.
- [x] JSON output remains structured and does not include _formatted.
- [x] CLI typecheck and build pass.
