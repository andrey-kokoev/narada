.ai/do-not-open/tasks/20260415-064-control-plane-ui-read-model-audit.md

# Task 064 — Control Plane UI Read-Model Audit

## Objective
Identify the minimum durable/read-only surfaces needed for an operator console.

## Required Changes
- Inventory current read surfaces for:
  - facts
  - contexts
  - work items
  - leases
  - evaluations
  - intents
  - executions
  - confirmations
  - worker status
- Identify gaps where UI would need derived queries
- Classify each surface as:
  - authoritative durable state
  - derived read model
  - forbidden for UI authority

## Acceptance Criteria
- One short inventory doc exists
- Missing read models are explicit
- No UI task assumes direct writes into control-plane tables

## Invariant
UI must be projection, not authority