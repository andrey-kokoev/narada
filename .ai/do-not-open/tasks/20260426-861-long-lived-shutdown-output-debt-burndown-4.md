---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:59:35.178Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:59:35.294Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 861 — Close and commit long-lived shutdown debt burndown

## Goal

Close the chapter, run full verification, and commit the long-lived shutdown debt burndown.

## Context

This chapter removes the final non-setup output-admission debt.

## Required Work

1. Run chapter assert-complete.
2. Run git diff --check and pnpm verify.
3. Commit with a concise chapter commit message.

## Non-Goals

- Do not push unless separately requested.
- Do not run full test suites.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] narada chapter assert-complete 858-861 passes.
- [x] git diff --check passes.
- [x] pnpm verify passes.
- [x] Worktree is clean after commit.
