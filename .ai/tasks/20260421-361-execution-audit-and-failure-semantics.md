---
status: closed
depends_on: [359, 360]
closed: 2026-04-21
---

# Task 361 — Execution Audit And Failure Semantics

## Context

Effect execution must be auditable because it mutates the outside world. Failed execution must not disappear into logs or be treated as confirmation.

## Goal

Persist execution attempts, external references, failures, and retry/terminal state honestly.

## Required Work

### 1. Integrate worker and adapter

Wire the worker state machine from Task 359 to the adapter from Task 360.

The worker owns state transitions. The adapter owns external mutation attempt only.

### 2. Persist attempt outcomes

For each attempt, persist:

- started/finished timestamps
- adapter result
- external identity references
- submitted/retry/terminal classification
- error detail when present

### 3. Idempotency and ambiguity handling

Define behavior for:

- worker crash after external mutation but before persistence
- duplicate execution attempts
- missing external id
- retry after ambiguous submit

If ambiguity cannot be resolved in this chapter, record it explicitly as residual and fail closed.

### 4. Tests

Add focused tests proving:

- successful adapter result records submitted but not confirmed
- retryable failure records retry state
- terminal failure records terminal state
- ambiguous post-effect failure does not blindly retry without residual/guard

## Non-Goals

- Do not implement live reconciliation.
- Do not execute autonomous send without approval.
- Do not hide ambiguous effects.
- Do not create derivative task-status files.

## Execution Notes

**Integration bridge:** `packages/sites/cloudflare/src/effects/send-reply-adapter.ts`
- Wraps `GraphDraftSendAdapter` to implement `EffectExecutionAdapter` interface from Task 359
- Parses `payloadJson` into `SendReplyPayload`; malformed payloads fail terminal without Graph call
- Serializes full `GraphDraftSendResult` (draftId, sentMessageId, internetMessageId, submittedAt) into `responseJson` for audit

**Integration tests:** `packages/sites/cloudflare/test/unit/execution-audit-integration.test.ts` (8 tests)
1. Full pipeline: worker → bridge → mock Graph client → submitted with full external identity audit
2. Retryable failure: 429 → `failed_retryable` with error detail recorded
3. Terminal failure: 403 → `failed_terminal` with error detail recorded
4. Active lease blocks duplicate attempts
5. Expired lease allows crash recovery retry
6. Missing external ID recorded honestly (null in responseJson)
7. Malformed payload fails terminal without Graph call
8. Ambiguous post-effect crash simulated: orphaned draft acknowledged as residual

**Idempotency/ambiguity handling:**
- Active lease (`attempting` + future `leaseExpiresAt`) prevents duplicate concurrent attempts
- Expired lease allows safe retry after worker crash
- Ambiguous post-mutation crash leaves orphaned draft in Graph; acknowledged as residual per authority contract
- Missing external IDs are recorded honestly, not fabricated

**Verification:**
- `pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/execution-audit-integration.test.ts` — 8/8 pass
- Full Cloudflare suite — 238/238 pass across 26 test files
- `pnpm verify` — 5/5 pass

## Acceptance Criteria

- [x] Worker and adapter are integrated under authority contract.
- [x] Attempts are auditable.
- [x] Success records submitted, not confirmed.
- [x] Failures are classified honestly.
- [x] Ambiguity is fail-closed or explicitly residualized.
- [x] Focused tests cover success, retryable, terminal, and ambiguous cases.
- [x] No derivative task-status files are created.
