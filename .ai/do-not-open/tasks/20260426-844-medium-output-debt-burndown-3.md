---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:13:39.916Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:13:40.292Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 844 — Verify medium output debt reduction

## Goal

Prove backup-ls and task-graph output debt was removed with bounded checks.

## Context

This task records the reduced guard debt and affected command verification.

## Required Work

1. Run output guard and report.
2. Run backup-ls and task graph help smokes.
3. Run @narada2/cli typecheck and build.

## Non-Goals

- Do not run task graph full output on the full repository.
- Do not migrate sync, integrity, config, or USC init in this chapter.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Guard report shows backup-ls and task-graph removed from debt list.
- [x] @narada2/cli typecheck/build pass.
- [x] No unbounded command output is emitted during verification.
