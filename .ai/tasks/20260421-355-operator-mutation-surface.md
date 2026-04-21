---
status: closed
closed: 2026-04-21
depends_on: [351]
---

# Task 355 — Operator Mutation Surface

## Context

Cloudflare Site currently has a read-oriented operator/status surface. A useful live-safe Site needs audited operator mutations for approving, rejecting, retrying, or cancelling governed work.

This task is about explicit authority, not convenience.

## Goal

Add a bounded audited operator mutation surface for Cloudflare Site.

## Required Work

### 1. Define supported actions

Support a minimal set such as:

- approve
- reject
- retry
- cancel

Use the existing authority model where possible. Do not invent hidden admin shortcuts.

### 2. Persist audit records

Every mutation must write an operator action/audit record with:

- action id
- actor
- action type
- target id
- request payload
- result status
- timestamp

### 3. Enforce lifecycle constraints

Actions must only apply to valid target states.

Invalid transitions must be rejected without mutation.

### 4. Tests

Add focused tests proving:

- successful mutation writes audit
- rejected mutation writes or records rejection according to existing policy
- invalid state transition does not mutate target
- read-only observation endpoints remain read-only

## Execution Notes

### Files Added
- `packages/sites/cloudflare/src/operator-actions.ts` — Bounded action executor with audit-first pattern
- `packages/sites/cloudflare/test/unit/operator-mutation.test.ts` — 17 unit tests for executor logic
- `packages/sites/cloudflare/test/integration/operator-action-handler.test.ts` — 14 integration tests for HTTP endpoint

### Files Modified
- `packages/sites/cloudflare/src/types.ts` — Added `SiteOperatorActionType`, `SiteOperatorActionRequest`, `SiteOperatorActionResult`
- `packages/sites/cloudflare/src/coordinator.ts` — Added `operator_action_requests` table schema, `getWorkItem`, `updateWorkItemStatus`, `getOutboundCommand`, `insertOperatorActionRequest`, `getOperatorActionRequest`, `getPendingOperatorActionRequests`, `markOperatorActionRequestExecuted`, `markOperatorActionRequestRejected`
- `packages/sites/cloudflare/src/index.ts` — Added `POST /control/actions` route with auth, validation, and action execution
- `packages/sites/cloudflare/test/fixtures/site.ts` — Added `getOperatorActionCount` and `getPendingOperatorActionCount` helpers

### Test Results
- 17 unit tests pass (audit invariant, approve, reject, retry, cancel, lifecycle constraints, request_id consistency)
- 14 integration tests pass (auth, method validation, payload validation, success paths, rejection paths, audit persistence, read-only observation)
- All Cloudflare package tests pass (193 tests)

### Design Decisions
- Four bounded actions: `approve`/`reject` target outbound commands (draft_ready → approved_for_send/cancelled); `retry`/`cancel` target work items (failed_retryable → opened; opened/failed_retryable → cancelled)
- Audit-first pattern: `pending` inserted before mutation, `executed` or `rejected` marked after
- Rejected mutations return HTTP 422 (not 500) and do not mutate target state
- `SiteCoordinator` interface extended with Promise-returning mutation methods for RPC compatibility

## Non-Goals

- Do not add UI polish.
- Do not add authentication beyond existing chapter assumptions unless necessary.
- Do not create effect execution.
- Do not bypass audit.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Operator mutation actions are bounded and explicit.
- [x] Mutations are audited.
- [x] Invalid transitions are rejected without hidden mutation.
- [x] Observation endpoints remain read-only.
- [x] Focused tests cover success and rejection.
- [x] No derivative task-status files are created.
