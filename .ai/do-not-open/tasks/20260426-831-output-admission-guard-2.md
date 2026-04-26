---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T19:46:48.577Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T19:46:49.032Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 831 — Wire output admission guard into verification

## Goal

Make finite command output admission enforcement part of the normal fast verification path.

## Context

A guard that is not in verify is advisory. The repository should prevent regression during the normal chapter close flow.

## Required Work

1. Add a package script for the new guard.
2. Add the guard as an early step in scripts/verify.ts.
3. Keep verify output terse and consistent with existing step reporting.
4. Ensure step count and telemetry remain correct.

## Non-Goals

- Do not add heavy CLI test suites to verify.
- Do not change test telemetry schema.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] pnpm verify runs the output admission guard.
- [x] The guard has a direct script entry in package.json.
- [x] pnpm verify passes.
