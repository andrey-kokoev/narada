---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T19:35:12.652Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T19:35:13.094Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 828 — Add focused output admission regression coverage

## Goal

Add tests or focused static checks proving principal and task search output is returned, not directly printed.

## Context

This chapter changes output routing. Coverage should lock the no-direct-output invariant for the migrated files without requiring giant CLI transcripts.

## Required Work

1. Add the narrowest regression coverage available in the CLI test structure, or add a bounded static verification script/check if test harness setup is too expensive.
2. Verify migrated commands produce formatted human output without direct console writes.
3. Avoid broad test suites and giant transcript output.

## Non-Goals

- Do not run full test suites unless focused verification indicates risk.
- Do not introduce a new test framework.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A focused regression or static check is recorded for no direct console/process use in migrated finite command files.
- [x] Affected command help smokes pass.
- [x] No long-running commands are executed.
