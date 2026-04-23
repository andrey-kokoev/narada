---
status: closed
created: 2026-04-23
owner: unassigned
depends_on: [490, 487, 488, 489]
---

# Task 494 - Assignment Intent Operator Integration

## Context

Narada task governance now has enough mechanics to make assignment intent explicit, but the current implementation still spreads that intent across:

- roster role
- roster status
- continuation reason
- command path
- report/review completion expectations

Task 490 is expected to define the semantic boundary and minimal assignment intent enum. This task integrates that result into the operators and durable records.

## Goal

Implement explicit assignment intent in task-governance operators and durable records.

Expected conceptual shape:

```text
assignment_intent = primary | review | repair | takeover
assignment_reason = optional reason layer
```

## Read First

- `.ai/tasks/20260423-490-task-attachment-carriage-boundary.md`
- `.ai/tasks/20260423-487-task-continuation-takeover-assignment-operator.md`
- `.ai/tasks/20260423-486-agent-completion-finalizer-report-evidence-roster-handoff.md`
- `.ai/tasks/20260423-488-evidence-based-not-complete-task-list.md`
- `.ai/tasks/20260423-489-work-result-report-dedup-and-deterministic-identity.md`
- `.ai/tasks/assignments/README.md`

## Required Work

1. Add explicit assignment intent to durable assignment records.
2. Update relevant operators:
   - `task roster assign`
   - `task roster review`
   - `task continue`
   - `task finish`
   - `task report`
3. Ensure evidence/listing surfaces can show attachment intent.
4. Preserve backward compatibility for old assignment records.
5. Add focused tests and docs.

## Non-Goals

- Do not broaden the intent enum beyond what Task 490 justifies.
- Do not mix intent with lifecycle status.
- Do not bypass report/review/closure evidence gates.

## Execution Notes

Implemented explicit assignment intent across task-governance operators and durable records.

### Schema Changes
- Added `ASSIGNMENT_INTENTS` const and `AssignmentIntent` type (`primary | review | repair | takeover`) to `task-governance.ts`.
- Added optional `intent` field to `TaskAssignment` interface.
- Added `continuationReasonToIntent()` and `getAssignmentIntent()` helpers for backward-compatible intent inference.

### Operator Updates
- **`task roster assign`**: Sets `intent: 'primary'` on new assignments.
- **`task roster review`**: Creates a released assignment record with `intent: 'review'` (review is parallel, not an active claim).
- **`task claim`**: Sets `intent: 'primary'` on new assignments.
- **`task continue`**: Maps continuation reason to intent:
  - `evidence_repair`, `review_fix` → `repair`
  - `handoff`, `blocked_agent`, `operator_override` → `takeover`
- **`task report`**: Rejects reports from agents whose active assignment has `review` intent (they should use `task review` instead).

### Evidence / Listing Surfaces
- `inspectTaskEvidence` now returns `active_assignment_intent`.
- `task evidence` human output displays `assignment intent`.
- `task evidence-list` table includes an `intent` column and JSON output includes `active_assignment_intent`.
- `EvidenceBasedTaskEntry` includes `active_assignment_intent`.

### Backward Compatibility
- Old assignments without `intent` default to `primary`.
- If `intent` is absent but `continuation_reason` is present, intent is inferred from the reason.

### Docs
- Updated `.ai/tasks/assignments/README.md` with intent semantics, backward compatibility rules, and the intent/reason separation.

## Verification

- `pnpm verify`: all 5 steps pass.
- CLI tests: 582 tests pass (57 test files).
- New tests added:
  - `task-governance.test.ts`: 9 new tests for `continuationReasonToIntent` and `getAssignmentIntent`.
  - `task-claim.test.ts`: verifies `intent: 'primary'` on claimed assignments.
  - `task-continue.test.ts`: verifies `intent: 'takeover'` on handoff continuations.
  - `task-roster.test.ts`: verifies review intent is recorded on assignment records.

## Acceptance Criteria

- [x] Assignment intent is stored explicitly.
- [x] Operators set assignment intent coherently.
- [x] Report/review/finish logic uses assignment intent rather than indirect inference where appropriate.
- [x] Listing/evidence surfaces can display assignment intent.
- [x] Backward compatibility is preserved.
- [x] Tests and docs are updated.
- [x] Verification evidence is recorded in this task.



