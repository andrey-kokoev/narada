---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:59:35.181Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:59:35.299Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 860 — Verify long-lived shutdown debt removal

## Goal

Prove long-lived shutdown direct-output debt is gone with bounded checks.

## Context

This should leave only config-interactive and usc-init in the CLI output admission debt report.

## Required Work

1. Run output guard and report.
2. Run console serve and workbench serve help smokes.
3. Run @narada2/cli typecheck and build.

## Non-Goals

- Do not migrate config-interactive or USC init in this chapter.
- Do not run full test suites.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Guard report shows only config-interactive and usc-init direct-output debt.
- [x] @narada2/cli typecheck/build pass.
- [x] No long-lived server starts during verification.
