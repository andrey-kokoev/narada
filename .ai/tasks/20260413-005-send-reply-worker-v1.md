# Send Reply Worker V1

## Mission
Implement the first executable outbound worker path for `send_reply`, using the SQLite store, managed drafts, canonical state transitions, and crash-safe submitted-versus-confirmed semantics.

## Scope
`packages/exchange-fs-sync/src/outbound/`
`packages/exchange-fs-sync/test/unit/outbound/`
`packages/exchange-fs-sync/test/integration/`

## Preconditions

- outbound state machine tests are in place
- outbound SQLite store exists
- Graph metadata spike has resolved the primary reconciliation marker

## Deliverables

### 1. Worker Skeleton

Create a worker module such as:

`src/outbound/send-reply-worker.ts`

Responsibilities:

- fetch next eligible `send_reply` command
- create managed draft when needed
- persist draft metadata
- transition command through:
  - `pending`
  - `draft_creating`
  - `draft_ready`
  - `sending`
  - `submitted`

### 2. Draft Reuse Logic

Implement:

- reuse existing managed draft if present and unchanged
- recreate if missing or invalid
- hard-fail if externally modified

### 3. Policy Gate

Before send, enforce:

- command is latest eligible version
- recipients are already participants on the inbound thread
- no outbound attachments in v1

If policy fails:

- transition to `blocked_policy`
- preserve reason

### 4. Crash-Safe Ambiguity Handling

After `send` succeeds but before local completion is fully recorded:

- do not allow blind resend
- require reconciliation before retry

### 5. Tests

Add tests for:

- happy-path send
- draft reuse
- missing draft recreation
- external modification hard failure
- stale or superseded version rejection
- retryable send failure
- ambiguous post-send crash behavior

## Definition Of Done

- [x] `send_reply` worker exists (`src/outbound/send-reply-worker.ts`)
- [x] canonical transitions are persisted through the worker path
- [x] policy gates are enforced (thread participant validation, no attachments)
- [x] managed draft reuse and recreation are implemented
- [x] crash ambiguity is handled conservatively (post-send SQLite failure leaves command in `sending` for reconciler)
- [x] worker tests pass (9 tests covering happy path, reuse, recreation, external modification, stale version, retryable failure, ambiguous crash, policy block, and sending-state skip)

