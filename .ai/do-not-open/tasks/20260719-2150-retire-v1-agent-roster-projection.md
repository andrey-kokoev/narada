---
status: opened
---

# Mark v1 agent roster projection superseded

## Goal

Retire the stale .ai/agents/roster.json v1 projection as superseded

## Context

first-time-user-flow incoherency sweep, slice 6. roster.json carries pre-rename narada-andrey.* ids, is stale since 2026-05-13, and has no readers in the narada2 codebase. Operator decision: mark superseded, keep the roster crossing deferred.

## Required Work

Add status superseded marker with superseded_at and superseded_by pointing at the andrey-user launch registry; do not refresh or delete.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] roster.json carries the superseded marker and remains valid JSON
