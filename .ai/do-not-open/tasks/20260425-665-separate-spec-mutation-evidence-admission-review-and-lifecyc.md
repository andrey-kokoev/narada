---
status: closed
depends_on: [664]
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T16:22:08.761Z
closed_at: 2026-04-25T16:22:29.452Z
closed_by: a2
governed_by: task_close:a2
---

# Separate spec mutation, evidence admission, review, and lifecycle transition commands

## Chapter

Task Governance DNA Coherence Sweep

## Goal

Untangle commands that currently cross multiple zones by making amend/spec, evidence/proof, review/admission, and close/lifecycle transition boundaries explicit.

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

- [x] command taxonomy documents and enforces zone ownership
- [x] amend only mutates task specification
- [x] proof/admission commands own evidence status
- [x] review remains an admission method
- [x] close only consumes admission result and transitions lifecycle



