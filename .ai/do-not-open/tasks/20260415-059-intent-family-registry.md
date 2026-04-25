# Task 059 — Intent Family Registry

## Objective
Make intent taxonomy explicit and enforced.

## Required Changes
- Define registry:
  ```ts
  interface IntentFamily {
    intent_type
    executor_family
    payload_schema
    idempotency_scope
    confirmation_model
  }
  ```
- Register:
  - mail
  - process
  - future families

## Acceptance Criteria
- All intents validated against registry
- No ad hoc intent shapes allowed

## Invariant
Intent is universal effect boundary