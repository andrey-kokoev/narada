---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T03:45:38.032Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented Canonical Inbox delivery/preflight ergonomics: inbox submit now returns delivery coordinates, inbox doctor reports repo/head/upstream/inbox DB/build/SQLite readiness, command is registered in help surface, focused inbox tests cover submit coordinates and doctor output, and pnpm verify passed.
closed_at: 2026-04-27T03:45:43.379Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Canonical Inbox delivery preflight ergonomics

## Goal

Expose clear delivery coordinates and readiness checks for Canonical Inbox submissions so agents can know where an envelope was written, whether another checkout can see it, and whether local build/SQLite prerequisites are healthy.

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

- [x] inbox submit result includes delivery coordinates: cwd
- [x] repo root
- [x] branch
- [x] head commit
- [x] inbox db path
- [x] envelope id
- [x] and dirty publication hint
- [x] new inbox doctor command reports repo/build/sqlite readiness without mutating inbox envelopes
- [x] doctor identifies missing build artifacts or unavailable better-sqlite3 binding with actionable bounded output
- [x] help/register surface documents the new inbox doctor operator
- [x] focused tests cover delivery coordinates and doctor readiness output
