# Task 071 — Safe Operator Actions

## Objective
Introduce the first minimal write actions that do not violate authority boundaries.

## Required Changes
- Add only safe actions such as:
  - retry failed read-model rebuild
  - refresh observation
  - acknowledge alert/noise
  - maybe request re-dispatch of already durable admissible state
- Explicitly forbid direct edits to:
  - facts
  - work items
  - intents
  - execution records
  - confirmations

## Acceptance Criteria
- UI has limited operator actions with explicit semantics
- No action bypasses foreman/scheduler/executor authority

## Invariant
UI may request, never mutate control truth directly