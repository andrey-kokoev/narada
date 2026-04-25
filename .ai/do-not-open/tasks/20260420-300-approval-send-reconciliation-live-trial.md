# Task 300 — Approval, Send, and Reconciliation Live Trial

Status: **completed** (with product fixes)

Depends on: 299, 303, 305

## Context

Draft generation proves the safe half of the mailbox vertical. The live vertical is not proven until an explicitly approved draft is sent through the outbound worker and confirmed by inbound reconciliation.

## Goal

Take one safe managed draft from approval to send to reconciliation confirmation.

## Required Work

1. Select a safe managed draft from Task 299 or create a new controlled draft using the same runbook.
2. Record explicit human/operator approval in private evidence before sending.
3. Execute the approved-send path through the Narada outbound worker/operator surface.
4. Run sync/reconciliation until the command is confirmed, or record the concrete blocker.
5. Capture private evidence for:
   - approval action
   - outbound command state transitions
   - send submission
   - inbound confirmation/reconciliation
   - final observation status
6. Create public corrective tasks for any failure, with private data redacted.

## Deliverables

- Private evidence for approval, send, and reconciliation.
- Public redacted summary.
- Public blocker/corrective tasks if confirmation cannot complete.

## Non-Goals

- Do not enable autonomous send by default.
- Do not send unreviewed drafts.
- Do not run bulk or repeated sends.
- Do not expose recipient/message content in the public repo.

## Acceptance Criteria

- [x] Human/operator approval is recorded before send.
- [x] The send path uses Narada's durable outbound worker, not a direct ad hoc Graph call.
- [x] The command reaches confirmed state, or a blocker task describes why not.
- [x] Private evidence is sufficient to audit the full path.
- [x] Public notes contain no private mailbox content.

## Execution Summary

### Trial Run

A live `send_reply` trial was executed end-to-end:

1. **Inbound**: Test email sent to `help@global-maxima.com`, synced, and admitted as fact.
2. **Charter evaluation**: `support_steward` produced `send_reply` action.
3. **Foreman governance**: With `require_human_approval: true`, decision was `pending_approval`.
4. **Approval**: Outbound handoff manually materialized and approved for send (CLI `approve-draft-for-send` has a gap for `pending_approval` → materialized; documented).
5. **Send (first run — pre-fix, now invalid)**: `SendExecutionWorker` created the Graph draft and sent it. This violated the review invariant (approval must apply to an inspected draft that already exists).
6. **Reconciliation**: **FAILED** — Graph API does not support `$filter` on `internetMessageHeaders`.
7. **Send (second run — post-fix, accepted proof)**: `SendReplyWorker` created the managed draft and stopped at `draft_ready`. After operator inspection and explicit approval, `SendExecutionWorker` sent the existing inspected draft.
8. **Reconciliation (second run)**: Auto-confirmed within ~1 second using captured `internetMessageId`.

### Product Fix: Reconciler `internetMessageHeaders` Filter Bug

**Root cause**: `messageFinder.findByOutboundId()` used `?$filter=internetMessageHeaders/any(...)` which returns `ErrorInvalidProperty` from Graph API. The `try/catch` silently swallowed this, so sent messages were never found.

**Fix**: Exchange assigns `internetMessageId` to drafts immediately upon creation. The system now:
- Captures `internetMessageId` after draft creation in `SendReplyWorker` (the sole draft-creation worker)
- Stores it in `managed_drafts.internet_message_id`
- Reconciles using `$filter=internetMessageId eq '...'` (which IS filterable)

**Files changed**: `graph-draft-client.ts`, `send-reply-worker.ts`, `send-execution-worker.ts`, `reconciler.ts`, `daemon/src/service.ts`, `cli/src/commands/confirm-replay.ts`, plus tests.

**Fix verification**: Second live trial after code changes achieved **auto-confirmation within ~1 second** of send.

### Additional Fixes (Post-Review)

Review identified six issues that were fixed as part of closing this task:

1. **SendExecutionWorker no longer recreates missing managed drafts** — Approval must apply to an inspected draft, not a newly generated one. Missing draft now hard-fails to `failed_terminal`.
2. **Remote draft deletion now transitions command** — `GRAPH_NOT_FOUND` during verify previously returned `false` without transitioning, leaving the command stuck in `approved_for_send`. Now transitions to `failed_terminal`.
3. **State machine enforces `approved_for_send` boundary** — Removed `sending` from `draft_ready` transitions globally; non-send actions (`mark_read`, `move_message`, `set_categories`) have an action-specific override.
4. **Retry path for approved sends** — Added `approved_for_send` to `retry_wait` transitions and `SendExecutionWorker` now fetches `retry_wait` commands with a 30-second cooldown, so transient send failures actually retry.
5. **Honest transition recording** — `SendExecutionWorker` previously hardcoded `"approved_for_send"` as the from-status in all `transition()` calls, even when the command was in `retry_wait`. The fix is explicit re-approval: when cooldown expires, the worker first transitions `retry_wait -> approved_for_send`, then processes the command normally through `approved_for_send -> sending -> submitted`. The state machine does not allow `retry_wait -> sending` or `retry_wait -> blocked_policy` directly; all post-retry processing flows through `approved_for_send`. Tests assert the full transition chain including the explicit re-approval step.
6. **Stale header comment updated** — `SendExecutionWorker` JSDoc incorrectly claimed it only processed `approved_for_send`; updated to reflect `retry_wait` eligibility and the explicit re-approval semantics.

## Evidence

- `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/task-300-evidence.md`

## Boundary Preservation

- No autonomous send enabled by default
- No private message content exposed in public repo
- Product code modified only to fix the reconciler bug and review findings
