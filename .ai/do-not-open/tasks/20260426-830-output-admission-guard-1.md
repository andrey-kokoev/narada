---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T19:46:35.609Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T19:46:36.360Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 830 — Add finite command direct-output guard

## Goal

Introduce a static guard that prevents new direct console/process output in CLI command implementation files unless explicitly allowlisted.

## Context

Recent chapters normalized registrar output and migrated principal/task-search output admission. The next coherence step is prevention: new finite command bodies should not silently reintroduce direct output effects.

## Required Work

1. Create a script that scans packages/layers/cli/src/commands/*.ts for direct console.log/console.error/console.warn/process.exit usage.
2. Represent existing legacy direct-output sites as explicit allowlist entries with expected counts and rationales.
3. Fail when a non-allowlisted direct output site appears or an allowlisted count drifts.
4. Keep output bounded: summarize counts and list only offending file/line entries.

## Non-Goals

- Do not migrate every legacy direct-output command in this task.
- Do not scan scripts/ or test files; this guard is for CLI command implementation files.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The guard passes on the current repository state.
- [x] The guard would fail for new direct output in a non-allowlisted command file.
- [x] Allowlist entries include rationales, not anonymous exemptions.
