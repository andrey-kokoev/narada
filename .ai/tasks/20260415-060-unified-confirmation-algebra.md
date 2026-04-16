# Task 060 — Unified Confirmation Algebra

## Objective
Equalize confirmation semantics across executor families.

## Required Changes
- Define confirmation interface:
  ```ts
  interface ConfirmationResolver {
    resolve(intent_id): ConfirmationStatus
  }
  ```
- Implement for:
  - mail (existing)
  - process (new reconciliation layer)

## Acceptance Criteria
- All executors implement confirmation
- Confirmation is durable and replay-safe

## Invariant
Execution completion ≠ confirmation