# Task 057 — Multi-Vertical Config Surface

## Objective
Replace mailbox-centric config with first-class multi-vertical configuration.

## Required Changes
- Introduce:
  ```yaml
  scopes:
    - scope_id
      sources[]
      context_strategy
      policy
      executors[]
  ```
- Remove top-level mailbox assumptions
- Support multiple concurrent verticals

## Acceptance Criteria
- System runs without mailbox configured
- Multiple scopes can run simultaneously

## Invariant
Config must not privilege any vertical