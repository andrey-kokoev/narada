---
status: closed
depends_on: [660]
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T16:08:51.253Z
closed_at: 2026-04-25T16:09:05.081Z
closed_by: a2
governed_by: task_close:a2
---

# Complete Observation Artifact inspect/open path

## Chapter

Task Governance DNA Coherence Sweep

## Goal

Finish OAZ by adding explicit artifact inspect/open/read surfaces and removing casual full-output escape hatches from default read commands.

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

- [x] observation artifact inspect command exists
- [x] artifact open/render command exists where applicable
- [x] full output requires explicit artifact id or --full with warning
- [x] task evidence list and graph tests cover artifact inspect path



