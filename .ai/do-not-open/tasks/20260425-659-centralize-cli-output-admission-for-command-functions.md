---
status: closed
depends_on: [658]
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T16:03:15.857Z
closed_at: 2026-04-25T16:03:30.340Z
closed_by: a2
governed_by: task_close:a2
---

# Centralize CLI output admission for command functions

## Chapter

Task Governance DNA Coherence Sweep

## Goal

Remove direct console output from command functions and make command functions return structured ObservationView or result objects for CLI admission.

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

- [x] command functions do not console.log directly except explicit human render adapters
- [x] large-output commands route through Observation Artifact Zone
- [x] tests cover no direct stdout for selected commands
- [x] CLI layer owns final printing



