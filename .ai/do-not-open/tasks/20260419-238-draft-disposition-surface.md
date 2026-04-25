# Task 238: Draft Disposition Surface

## Chapter

Operational Trust

## Why

Live Operation produces managed drafts as its core output. Those drafts sit in `draft_ready` state indefinitely. An operator who reviews a draft and decides it should not be sent — or who handles the issue outside Narada — has no way to record that disposition. The draft remains in the system as an unresolved outbound command, cluttering status reports and misleading future charter evaluations.

A draft-only operation is only trustworthy if an operator can:
1. See that a draft exists (covered by Task 231).
2. Record a decision about that draft.
3. Have that decision affect durable state.

This task provides the minimal disposition surface. It is NOT a full approval workflow with UI buttons and email notifications. It is a small set of operator actions that let an operator clean up the draft lifecycle.

## Goal

Add operator actions to disposition drafts that are in `draft_ready` state: cancel/reject, mark reviewed, and record external handling.

## Required Work

### 1. Cancel / Reject Draft Operator Action

Add an operator action `reject_draft`:

- Input: `outbound_id`, optional `rationale`
- Authority: `execute` class (human operator with execution authority)
- Effect:
  - Transition outbound command from `draft_ready` → `cancelled`
  - Record `terminal_reason: "operator_rejected"`
  - Record rationale in `outbound_transitions` table
  - Update associated intent status to `cancelled`
- Record in `operator_actions` audit log

CLI:
```bash
narada reject-draft <outbound-id> [--rationale "..."] -c <config>
```

UI: Add "Reject" button to outbound command detail (after Task 231).

### 2. Mark Reviewed Operator Action

Add an operator action `mark_reviewed`:

- Input: `outbound_id`, optional `reviewer_notes`
- Authority: `execute` class (human operator with execution authority)
- Effect:
  - Add a `reviewed_at` timestamp to the outbound command (or record in `operator_actions`)
  - Does NOT transition status — draft remains `draft_ready` for future approval
- Record in `operator_actions` audit log

CLI:
```bash
narada mark-reviewed <outbound-id> [--notes "..."] -c <config>
```

### 3. Record "Handled Externally" Operator Action

Add an operator action `handled_externally`:

- Input: `outbound_id`, `external_reference` (e.g., ticket ID, email thread URL)
- Authority: `execute` class (human operator with execution authority)
- Effect:
  - Transition outbound command from `draft_ready` → `cancelled`
  - Record `terminal_reason: "handled_externally"`
  - Record `external_reference` in payload
  - Update associated intent status to `cancelled`
- Record in `operator_actions` audit log

CLI:
```bash
narada handled-externally <outbound-id> --ref "ticket-123" -c <config>
```

### 4. Surface Disposition State in Queries

Add to `OutboundHandoffSummary`:
- `reviewed_at: string | null`
- `reviewer_notes: string | null`
- `external_reference: string | null`

Add observation query:
```typescript
export function getOutboundCommandsByStatus(
  outboundStore: OutboundStoreView,
  status: OutboundHandoffSummary["status"],
  scopeId?: string,
  limit = 50,
): OutboundHandoffSummary[]
```

### 5. Prevent Redispatch of Cancelled Drafts

Ensure that `OutboundHandoff.createCommandFromDecision()` does not create a new outbound command for a context that already has a `cancelled` outbound command for the same action type within the current work item's lifecycle. If the foreman re-evaluates the same context and proposes the same action, it should either:
- Create a new command (if the context has a new revision / new work item), OR
- Skip if the same work item is being re-evaluated

This is existing behavior (idempotency via `idempotency_key`), but document the boundary in task notes.

## Non-Goals

- Do not implement a full approval workflow with UI state machines, email notifications, or multi-step review.
- Do not implement draft editing (modifying draft content before send).
- Do not implement automatic escalation for unreviewed drafts.
- Do not send email.
- Do not change the `require_human_approval` governance boundary.

## Acceptance Criteria

- [x] `reject_draft` operator action transitions outbound command to `cancelled` with rationale.
- [x] `mark_reviewed` operator action records review timestamp and notes without changing status.
- [x] `handled_externally` operator action transitions to `cancelled` with external reference.
- [x] All three actions are recorded in `operator_actions` audit log.
- [x] Disposition state (`reviewed_at`, `reviewer_notes`, `external_reference`) is visible in observation queries.
- [x] CLI commands exist for all three actions.
- [x] Idempotency boundary is documented (cancelled drafts are not silently recreated for the same work item).

## Task Notes

### Idempotency Boundary for Cancelled Drafts

Cancelled drafts are protected from silent redispatch by the existing idempotency mechanism:

1. `IntentHandoff.admitIntentFromDecision()` computes an `idempotency_key` from `(context_id, approved_action, payload)`.
2. `IntentStore.admit()` returns the existing intent row if the idempotency key already exists.
3. If the existing intent has a `target_id` (the outbound_id), the system returns that outbound_id without creating a new command.
4. `OutboundStore.createCommand()` also checks `idempotency_key` uniqueness and skips insertion if the key already exists.

This means:
- **Same work item, same action**: The foreman re-evaluating and proposing the same action will converge to the same idempotency key. The existing cancelled intent/outbound is returned. No new command is created.
- **New work item, same action**: Even with a new work item, if the payload is identical, the idempotency key is identical. The existing cancelled intent/outbound blocks creation of a new command.
- **New work item, different payload**: A different payload produces a different idempotency key, allowing a new intent and outbound command to be created.

Operators who want a "fresh" draft after rejecting one must wait for the context to evolve enough that the charter proposes a different action or payload.

## Corrective Follow-up

**Task 267** (`.ai/do-not-open/tasks/20260420-267-correct-task-238-draft-disposition-operator-path.md`) addresses two issues discovered during review:

1. **Canonical operator path**: The original CLI commands duplicated disposition mutation logic instead of calling the canonical `executeOperatorAction()` executor. This created a risk of CLI/UI semantic drift and unaudited mutations if a crash occurred between mutation and audit insertion. Task 267 moved `executeOperatorAction()` into `@narada2/control-plane` so both CLI and daemon share one audit-first execution path.

2. **Payload encoding**: The original `executeOperatorAction()` double-encoded `payload_json` (`JSON.stringify(payload.payload_json)`), causing audit rows to store escaped string literals instead of plain object JSON. Task 267 fixed this so `payload_json` is stored exactly once.

## Dependencies

- Tasks 228-232 (Live Operation chapter) must be complete. Disposition requires drafts to exist.
- Task 231 (Inspection Surfaces) should precede or coincide. Operators need to see drafts before they can disposition them.
- Task 236 (Operator Audit Inspection) should precede or coincide. Disposition actions are operator actions that must be auditable.
