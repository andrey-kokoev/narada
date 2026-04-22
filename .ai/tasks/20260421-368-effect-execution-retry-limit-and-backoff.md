---
status: closed
depends_on: [366, 367]
---

# Task 368 — Effect Execution Retry Limit And Backoff

## Assignment

Execute Task 368.

## Context

Task 358 specified a per-command retry limit: max 5 `failed_retryable` execution attempts before promotion to `failed_terminal`. Task 364 recorded that this is not enforced in code.

Cloudflare v1 needs bounded retry behavior so unattended execution does not hammer external services or loop forever.

## Goal

Enforce per-command retry limits and bounded backoff for effect execution.

## Execution Notes

### Exact Retry Semantics

Retry and backoff gates apply **only to commands presented to `executeApprovedCommands` in `approved_for_send` status**. The worker does not scan arbitrary `failed_retryable` rows automatically. A command becomes eligible for re-attempt only when:

1. An operator explicitly transitions it back to `approved_for_send` (via `retry` action), OR
2. A prior worker invocation left it in `failed_retryable` and it is still in `approved_for_send` status (this can happen if the worker crashes after updating the attempt but before updating the outbound status, though the current code updates outbound status before finishing).

In practice, the worker calls `getApprovedOutboundCommands()` which returns only `status = 'approved_for_send'`. For each such command:

1. **Lease gate**: Skip if an active `attempting` lease exists (crash recovery).
2. **Retry limit gate**: Count `failed_retryable` attempts for this `outbound_id`. If count ≥ `maxRetryLimit` (default 5), auto-promote to `failed_terminal` with an audit `execution_attempt` record (errorCode: `RETRY_LIMIT_EXHAUSTED`). Do NOT call the adapter.
3. **Backoff gate**: If count > 0, compute exponential backoff `min(baseDelayMs * 2^(count-1), maxDelayMs)`. Skip if the last `failed_retryable` is within the backoff window. Residual: `backoff_active_${outboundId}`.
4. **Adapter attempt**: Only if all gates pass, create `attempting` record and call the adapter.

### Retry-After Residualization

Respecting `Retry-After` headers is **not implemented**. The current `GraphDraftSendAdapter` retry loop (Task 360) does not expose `Retry-After` data to the worker boundary. The worker-level backoff uses a fixed exponential formula instead. A future task could:
- Add `retryAfterMs` to the `EffectExecutionAdapter` result interface
- Store it in `execution_attempts.response_json` or a new column
- Use it instead of the exponential formula when available

This is honestly residualized; no false claim of Retry-After support exists in tests or docs.

### Files Modified

- `packages/sites/cloudflare/src/coordinator.ts` — Added `countRetryableAttempts(outboundId)` to interface and implementation
- `packages/sites/cloudflare/src/effect-worker.ts` — Added retry limit gate, backoff gate, auto-promotion audit, and new options (`maxRetryLimit`, `backoffBaseDelayMs`, `backoffMaxDelayMs`)
- `packages/sites/cloudflare/test/fixtures/coordinator-fixture.ts` — Added `countRetryableAttempts` mock
- `packages/sites/cloudflare/test/unit/effect-execution-retry-limit.test.ts` — 9 focused tests

## Required Work

1. Count retryable execution attempts per outbound command.
2. Enforce the configured or documented max retry limit.
3. Add next-attempt timing/backoff logic or an equivalent skip-with-residual mechanism.
4. Ensure terminal promotion is audited.
5. Respect `Retry-After` when available if that data is available at the adapter boundary.
6. Add focused tests:
   - below retry limit remains retryable;
   - at/above retry limit promotes terminal;
   - backoff skips too-early retry;
   - expired backoff allows retry;
   - terminal promotion does not execute adapter again.
7. Update docs/task notes to align actual behavior with the Task 358 contract.

## Non-Goals

- Do not create a distributed scheduler.
- Do not add new effect types.
- Do not retry terminal auth/permission failures automatically.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Retryable attempts are counted per command.
- [x] Max retry limit is enforced.
- [x] Backoff or skip-timing behavior is implemented and tested.
- [x] Terminal promotion is auditable.
- [x] Focused tests cover below-limit, at-limit, backoff, and no-retry-terminal behavior.
- [x] No derivative task-status files are created.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
