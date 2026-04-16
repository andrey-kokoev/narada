# Task 056 — Context Materializer Layer

## Objective
Introduce explicit boundary between context formation and runtime materialization.

## Required Changes
- Define:
  ```ts
  interface ContextMaterializer {
    materialize(context: PolicyContext): ContextMaterialization
  }
  ```
- Implement:
  - MailboxContextMaterializer
  - TimerContextMaterializer
  - WebhookContextMaterializer
- Wire into invocation path

## Acceptance Criteria
- Charter runtime only sees materialized context
- No direct dependency on source payload shapes

## Invariant
Context formation ≠ context materialization