.ai/tasks/20260416-076-surface-intent-execution-confirmation-lifecycles.md
# Task 076 — Surface Intent / Execution / Confirmation Lifecycles

## Objective
Complete the missing execution observability layer by exposing lifecycle and confirmation transitions end-to-end.

## Why
The backend already contains richer execution/confirmation read models, but the UI only shows shallow lists. Operators cannot inspect:
- intent lifecycle
- execution phase transitions
- confirmation status transitions
- mail vs process execution symmetry

## Required Changes
- Add API endpoints for:
  - recent intent-execution summaries
  - per-intent lifecycle detail
  - process execution detail
  - mail execution detail
  - confirmation status transitions
- Add UI views for:
  - intent lifecycle table/timeline
  - execution detail pane
  - confirmation status history
  - failed-terminal reasoning
- Surface both process and mail families explicitly

## Acceptance Criteria
- Operator can answer:
  - what intent was admitted?
  - what executor family handled it?
  - what phase did execution enter?
  - whether confirmation succeeded, failed, or remained pending
- Mail and process families are both inspectable
- Failed intent/execution/confirmation chains are drill-downable from the UI

## Invariant
Intent, execution, and confirmation remain distinct lifecycle layers.