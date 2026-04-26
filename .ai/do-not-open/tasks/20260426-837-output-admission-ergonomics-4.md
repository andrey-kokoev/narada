---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T19:54:36.008Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T19:54:36.415Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 837 — Verify and close output admission ergonomics chapter

## Goal

Close the ergonomics chapter with guard, report, typecheck/build, full verify, and commit.

## Context

This task verifies the helper, report mode, and small debt burn-down as a single coherent chapter.

## Required Work

1. Run normal guard mode and report mode.
2. Run @narada2/cli typecheck/build.
3. Run pnpm verify.
4. Close all chapter tasks and commit.

## Non-Goals

- Do not push unless separately requested.
- Do not run full test suites.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] narada chapter assert-complete 834-837 passes.
- [x] git diff --check passes.
- [x] pnpm verify passes.
- [x] Worktree is clean after commit.
