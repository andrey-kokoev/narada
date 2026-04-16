# Task 068 — Intent / Execution / Confirmation Views

## Objective
Make the effect boundary and executor lifecycle inspectable.

## Required Changes
- Add views for:
  - intents by family/status
  - execution phase
  - confirmation status
  - retries/failures
  - process execution detail
  - mail execution detail
- Show idempotency key and lifecycle transitions

## Acceptance Criteria
- Operator can explain what has been admitted, executed, confirmed, or failed
- Mail and process appear under one lifecycle model

## Invariant
Intent remains the universal effect boundary in UI presentation