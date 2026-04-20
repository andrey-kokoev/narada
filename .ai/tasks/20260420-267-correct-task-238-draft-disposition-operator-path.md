# Task 267: Correct Task 238 Draft Disposition Operator Path

## Chapter

Operational Trust

## Context

Task 238 added draft disposition actions:

- `reject_draft`
- `mark_reviewed`
- `handled_externally`

The daemon/UI path routes these through `executeOperatorAction()` in `packages/layers/daemon/src/observation/operator-actions.ts`, which inserts an `operator_action_requests` row before performing the mutation.

The CLI commands currently duplicate the mutation logic directly:

- `packages/layers/cli/src/commands/reject-draft.ts`
- `packages/layers/cli/src/commands/mark-reviewed.ts`
- `packages/layers/cli/src/commands/handled-externally.ts`

They mutate outbound/intent state first, then insert an operator action row. That creates two problems:

- The CLI and UI paths can drift semantically.
- A crash between mutation and audit insertion can leave a cancelled/reviewed draft without the required operator action audit record.

The current CLI tests verify state changes but do not assert that the audit row exists with the expected action type and payload.

There is also a payload encoding risk in `executeOperatorAction()`:

```ts
payload_json: payload.payload_json ? JSON.stringify(payload.payload_json) : null
```

`OperatorActionPayload.payload_json` is already a JSON string in the UI path. Double-encoding stores a JSON string literal instead of the intended object JSON.

## Goal

Make draft disposition actions use one canonical operator execution path and prove the audit record is durable and correctly encoded.

## Required Work

### 1. Extract Or Reuse The Canonical Operator Executor

Ensure CLI draft disposition commands call the same canonical logic as the UI/control route.

Acceptable approaches:

- Move `executeOperatorAction()` to a shared package/module usable by CLI and daemon.
- Or extract the disposition-specific mutation functions into control-plane and have both CLI and daemon call them through an audit-first wrapper.

The resulting flow must be audit-first:

1. insert `operator_action_requests` row with `status = pending`
2. perform disposition mutation
3. mark action `executed`
4. on validation failure, mark action `rejected`

Do not leave separate hand-written CLI mutation paths for the same actions.

### 2. Fix Payload Encoding

Normalize `OperatorActionPayload.payload_json` handling so audit rows store object JSON exactly once.

Examples:

- `{ "rationale": "bad draft" }`
- `{ "reviewer_notes": "looks okay" }`
- `{ "external_reference": "ticket-123" }`

Do not store escaped JSON string literals such as:

```json
"{\"rationale\":\"bad draft\"}"
```

### 3. Add CLI Audit Tests

Update the CLI tests for all three commands to assert:

- an `operator_action_requests` row exists
- `action_type` matches the command
- `target_id` is the outbound id
- `status` is `executed`
- `payload_json` is correctly encoded when payload exists

### 4. Add Rejection/Audit Test

Add at least one focused test proving a rejected disposition attempt records a rejected operator action row, or explicitly document why the chosen implementation cannot audit rejected attempts from CLI.

Preferred case:

- attempt `reject-draft` against a non-`draft_ready` outbound command
- command returns failure
- audit row exists with `status = rejected`

### 5. Update Task 238 Notes

Add a corrective note to `.ai/tasks/20260419-238-draft-disposition-surface.md` referencing this task and the canonical operator path.

## Non-Goals

- Do not add a full approval workflow.
- Do not send mail.
- Do not redesign the operator action table.
- Do not change the draft-first delivery policy.
- Do not run broad/full test suites unless explicitly requested.
- Do not create derivative task-status files.

## Execution Notes

### Canonical executor move
Created `packages/layers/control-plane/src/operator-actions/executor.ts` containing `executeOperatorAction()` and all related types (`OperatorActionPayload`, `OperatorActionContext`, `OperatorActionResult`, `PERMITTED_OPERATOR_ACTIONS`).

Added `markOperatorActionRequestRejected()` to `CoordinatorStore` / `SqliteCoordinatorStore` so the canonical executor can mark audit rows rejected without raw `.db` access.

### Daemon re-export
`packages/layers/daemon/src/observation/operator-actions.ts` now re-exports from `@narada2/control-plane` instead of containing its own implementation.

### CLI command refactor
All three CLI commands (`reject-draft.ts`, `mark-reviewed.ts`, `handled-externally.ts`) were refactored to:
1. Open the database
2. Build an `OperatorActionContext`
3. Call `executeOperatorAction()` — the same audit-first path the UI uses
4. Return the result

No duplicated mutation logic remains.

### Payload encoding fix
Changed `payload_json: payload.payload_json ? JSON.stringify(payload.payload_json) : null` to `payload_json: payload.payload_json ?? null`. The UI path already stringifies the payload object before sending; the canonical executor now stores it as-is.

### Rejection audit support
`executeOperatorAction()` catches validation errors, marks the audit row `rejected` via `markOperatorActionRequestRejected()`, and returns `{ success: false, status: "rejected" }`. All three CLI tests verify this: when a non-`draft_ready` outbound is targeted, the test asserts a `rejected` audit row exists.

### Task 238 note update
Added a "Corrective Follow-up" section to `.ai/tasks/20260419-238-draft-disposition-surface.md` referencing Task 267 and documenting the canonical path and payload encoding fix.

### Focused verification
```bash
pnpm --filter @narada2/cli exec vitest run test/commands/reject-draft.test.ts test/commands/mark-reviewed.test.ts test/commands/handled-externally.test.ts
# Test Files  3 passed (3)
# Tests  8 passed (8)

pnpm --filter @narada2/control-plane typecheck
# tsc --noEmit  (pass)

pnpm --filter @narada2/daemon typecheck
# tsc --noEmit  (pass)
```

## Acceptance Criteria

- [x] CLI and UI/control route use one canonical disposition execution path or shared mutation core.
- [x] Disposition mutation is audit-first for CLI and UI/control route.
- [x] `payload_json` is not double-encoded.
- [x] CLI tests assert successful audit rows for `reject_draft`, `mark_reviewed`, and `handled_externally`.
- [x] A rejection path is audited or a documented limitation is added with rationale.
- [x] Task 238 notes reference this corrective follow-up.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
