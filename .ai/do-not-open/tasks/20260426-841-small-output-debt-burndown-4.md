---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:01:16.984Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:01:17.951Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 841 — Verify and close small output debt burndown

## Goal

Verify the three small allowlist clusters are gone, close chapter tasks, and commit.

## Context

This chapter should reduce output admission debt while staying low risk and bounded.

## Required Work

1. Run guard and guard report.
2. Run affected help smokes.
3. Run @narada2/cli typecheck/build and pnpm verify.
4. Close all chapter tasks and commit.

## Non-Goals

- Do not push unless separately requested.
- Do not migrate medium or large output-debt clusters in this chapter.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] narada chapter assert-complete 838-841 passes.
- [x] git diff --check passes.
- [x] pnpm verify passes.
- [x] Worktree is clean after commit.
