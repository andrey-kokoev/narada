---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T13:31:28.382Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented task lifecycle snapshot freshness enforcement. Guard now exports local DB to a temporary snapshot and byte-compares it to .ai/task-lifecycle-snapshot.json, emitting the exact refresh command when stale. pnpm verify runs the guard after build. Docs describe enforced freshness. Negative guard check failed on stale snapshot without dumping contents; positive guard check passed after refresh; pnpm verify passed with 8 steps.
closed_at: 2026-04-27T13:31:31.057Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Enforce task lifecycle snapshot freshness

## Chapter

Task Lifecycle Snapshot Freshness

## Goal

Prevent commits and verification from passing when the ignored local task lifecycle SQLite DB has diverged from the tracked task lifecycle snapshot handoff.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task lifecycle posture guard compares a fresh sanctioned export against .ai/task-lifecycle-snapshot.json when local DB exists
- [x] guard emits a bounded exact refresh command when the snapshot is stale
- [x] pnpm verify runs the task lifecycle snapshot guard after build
- [x] docs describe snapshot freshness as enforced posture instead of manual convention
- [x] verification covers stale snapshot failure and fresh snapshot success without dumping snapshot contents
