# Task 073 — UI Authority Guardrails

## Objective
Prevent the UI from becoming an accidental new control plane.

## Required Changes
- Add tests/docs/guards ensuring UI cannot:
  - write control-plane rows directly
  - bypass intent boundary
  - bypass scheduler/foreman authority
- Mark all UI data sources as:
  - authoritative
  - derived
  - decorative

## Acceptance Criteria
- UI architecture enforces read-mostly semantics
- Future contributors cannot turn dashboard code into hidden authority

## Invariant
Observation UI must remain projection of durable state