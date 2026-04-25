---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:01:23.557Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:01:24.974Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 704 — Expose slow focused tests as actionable TIZ debt

## Goal

Slow focused tests should surface as bounded test-runtime debt rather than tolerated background pain.

## Context

Command tests are still slow even when routed through TIZ metrics.

## Required Work

1. Add or tighten focused-test runtime warning thresholds.
2. Ensure slow tests are summarized compactly.
3. Document how to convert a slow command test into a faster proof harness.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Focused test runs emit compact slow-test warnings.
- [x] Runtime metrics remain written.
- [x] Documentation gives the remediation path.


