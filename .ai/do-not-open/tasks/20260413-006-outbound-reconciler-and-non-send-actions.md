# Outbound Reconciler And Non-Send Actions

## Mission
Complete the first outbound subsystem slice by implementing reconciliation for submitted commands and extending the durable worker model to non-send mailbox mutations.

## Scope
`packages/exchange-fs-sync/src/outbound/`
`packages/exchange-fs-sync/test/unit/outbound/`
`packages/exchange-fs-sync/test/integration/`

## Preconditions

- `send_reply` worker exists
- primary reconciliation marker behavior is known

## Deliverables

### 1. Reconciler

Create a reconciler module that:

- scans `submitted` commands
- binds them to remote mailbox state using the canonical marker
- falls back to deterministic tuple matching only when allowed by the spec
- transitions `submitted -> confirmed`
- records reconciliation evidence for audit

### 2. Ambiguity Handling

If reconciliation cannot prove outcome:

- do not resend automatically
- leave command in a retry-safe blocked or retryable state with explicit reason

### 3. Non-Send Worker Paths

Implement the same durable command flow for:

- `mark_read`
- `move_message`
- `set_categories`

These should share:

- store usage
- transition logging
- retry policy
- audit behavior

### 4. Integration Tests

Add coverage for:

- submitted then confirmed
- fallback reconciliation path
- non-send action happy paths
- retryable failures for non-send actions

## Definition Of Done

- [x] reconciler exists (`src/outbound/reconciler.ts`)
- [x] `submitted -> confirmed` is implemented for send and non-send actions
- [x] ambiguity does not trigger blind resend (expired window transitions to `retry_wait`)
- [x] non-send actions (`mark_read`, `move_message`, `set_categories`) use the same durable command model via `NonSendWorker`
- [x] integration tests cover reconciliation and non-send actions (12 unit/integration tests)
