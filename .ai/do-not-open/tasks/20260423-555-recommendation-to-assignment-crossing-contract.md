---
status: closed
created: 2026-04-23
closed_at: 2026-04-24T16:06:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [553, 554]
artifact: .ai/decisions/20260423-555-recommendation-to-assignment-crossing-contract.md
---

# Task 555 - Recommendation-To-Assignment Crossing Contract

## Goal

Define the governed crossing that promotes a recommendation artifact into an assignment.

## Why

Recommendation and assignment must not collapse. Narada needs a separate crossing that:

- consumes recommendation artifacts
- re-validates freshness and policy
- checks conflict / review separation / write-scope conditions
- records promotion as an auditable authority transition

## Required Work

1. Define the crossing in canonical crossing-regime language:
   - source zone
   - destination zone
   - authority owner
   - admissibility regime
   - crossing artifact
   - confirmation rule
2. Define the promotion preconditions, including at least:
   - recommendation freshness
   - task still assignable
   - dependency state still valid
   - no active conflicting assignment
   - policy allows auto-promotion or requires operator confirmation
3. Define the durable artifacts for:
   - promotion request
   - promotion result / assignment
4. Define operator visibility and override posture.
5. State explicit non-goals:
   - no blind heuristic autoassign
   - no bypass of assignment governance

## Acceptance Criteria

- [x] Recommendation-to-assignment is defined as a separate governed crossing
- [x] Crossing declaration fields are explicit
- [x] Promotion preconditions are defined
- [x] Durable artifacts are named
- [x] Operator override/visibility posture is defined
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Scope

Defined the recommendation-to-assignment boundary as its own governed crossing instead of allowing recommendation and assignment to collapse into one surface.

### What Was Established

- canonical six-field crossing declaration for Recommendation → Task Assignment
- nine promotion validation checks plus policy and override gates
- durable artifacts for promotion request and successful assignment confirmation
- operator visibility and override posture
- explicit non-goals preventing blind autoassign or bypass of assignment governance

### Artifact

- `.ai/decisions/20260423-555-recommendation-to-assignment-crossing-contract.md`

## Verification

- Decision artifact exists and closes Task 555 via `closes_tasks: [555]` ✅
- Crossing declaration fields, promotion preconditions, and durable artifacts are recorded ✅
- Decision artifact records verification evidence including inventory update, test coverage, `pnpm typecheck`, and `pnpm verify` ✅
- Recommendation-to-assignment boundary is now explicit and separate from recommendation-zone output ✅
