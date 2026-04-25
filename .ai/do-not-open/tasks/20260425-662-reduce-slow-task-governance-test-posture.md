---
status: closed
depends_on: [661]
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T16:10:34.155Z
closed_at: 2026-04-25T16:10:54.115Z
closed_by: a2
governed_by: task_close:a2
---

# Reduce slow task governance test posture

## Chapter

Task Governance DNA Coherence Sweep

## Goal

Make agent-facing verification fast enough for TIZ by isolating SQLite setup cost and replacing slow Vitest paths where appropriate.

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

- [x] claim close continue roster focused tests have bounded runtimes
- [x] slow tests are split or replaced by compact proof runners
- [x] TIZ runtime metrics show improved durations
- [x] no behavioral coverage is lost



