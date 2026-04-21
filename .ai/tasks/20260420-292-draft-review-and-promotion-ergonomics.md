# Task 292: Draft Review And Promotion Ergonomics

## Chapter

Mailbox Saturation

## Context

Narada now has the correct durable lifecycle for draft approval and autonomous send. The remaining gap is ergonomic: the operator should be able to understand why a draft exists, what governance produced it, and what action is available next, without reconstructing the story manually from multiple screens or tables.

## Goal

Make the mailbox draft review loop clear and efficient for operators while preserving the current authority boundaries.

## Required Work

### 1. Tighten review-state visibility

Improve the operator-facing surfacing of:

- why this draft was created
- which evaluation and decision produced it
- whether the command is still awaiting review, already reviewed, approved for send, blocked, or cancelled

### 2. Tighten promotion ergonomics

Ensure the operator path from:

- `draft_ready` to review
- review to approve
- review to reject
- review to handled externally

is understandable and coherent in both CLI and UI/operator-facing docs.

### 3. Make lifecycle language mailbox-clear

Reduce places where mailbox operators have to mentally translate generic lifecycle language into mail-specific meaning.

### 4. Add focused verification

Add or refine focused tests around the operator-facing draft review / approval loop where current coverage is thin.

## Non-Goals

- Do not change authority classes or governance rules.
- Do not collapse approval and send into one action.
- Do not redesign the generic observation substrate.

## Acceptance Criteria

- [x] Operators can see why a mailbox draft exists and what produced it.
- [x] The next available actions for a draft are explicit and coherent.
- [x] CLI/UI/operator docs align on the mailbox draft review loop.
- [x] Focused verification covers the review/promotion loop additions.

## Execution Notes

### Changes Made

1. **Observability layer** (`packages/layers/control-plane/src/observability/`)
   - Added `DraftReviewDetail` and `DraftReviewStatus` types.
   - Added `getDraftReviewDetail()` and `getDraftReviewDetails()` queries that join `outbound_handoffs` → `foreman_decisions` → `evaluations` to surface why a draft exists, what decision/evaluation produced it, and what actions are available next.

2. **CLI** (`packages/layers/cli/src/commands/`)
   - Added `show-draft` command (`show-draft.ts`) for deep-dive draft inspection with lineage and available actions.
   - Enhanced `ops` command (`ops.ts`) to show `review_status`, `charter_summary`, `decision_rationale`, and `available_actions` in the drafts table.
   - Fixed the `ops` suggested action to reference `narada show-draft <outbound-id>` instead of the non-existent `narada show decision <id>`.
   - Registered `show-draft` in `main.ts`.

3. **Operator docs** (`docs/operator-loop.md`)
   - Updated the "Actions on drafts" block to correctly distinguish `mark-reviewed` (records review) from `approve-draft-for-send` (promotes to send).
   - Added the promotion flow diagram (`draft_ready` → review → approve/reject/externally-handled).
   - Added `narada show-draft` as the inspection step.

4. **Tests**
   - Added 6 unit tests in `packages/layers/control-plane/test/unit/observability/queries.test.ts`.
   - Added 3 CLI tests in `packages/layers/cli/test/commands/show-draft.test.ts`.

### Bug fixes discovered during execution
- Fixed pre-existing SQL in `ops.ts` using non-existent columns `command_id` / `current_version` (corrected to `outbound_id` / `latest_version`).
- Fixed pre-existing type mismatch: `retry_auth_failed` was missing from `OperatorActionRequest.action_type` union.
