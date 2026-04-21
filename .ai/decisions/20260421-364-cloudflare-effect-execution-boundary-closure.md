# Decision: Cloudflare Effect Execution Boundary Chapter Closure

**Date:** 2026-04-21  
**Chapter:** Tasks 358–364  
**Verdict:** **Closed — accepted.**

---

## Summary

The Cloudflare Effect Execution Boundary chapter crossed from live-safe read/control adapters into one bounded effect-execution path without collapsing intelligence, authority, execution, and confirmation.

The chapter defined an authority contract, implemented an approved-only effect worker, built a bounded Graph draft/send adapter, wired execution audit and failure semantics, connected execution output to reconciliation, and proved the full path from operator approval through external observation to confirmation.

**Honest scope:** This is bounded effect-execution proof, not production readiness. The external Graph API boundary is mocked in tests. No real email is sent. Production deployment would need credential rotation, egress policy, rate-limit handling, and operational monitoring.

---

## Task-by-Task Assessment

### Task 358 — Effect Execution Authority Contract

**Delivered:**
- `docs/deployment/cloudflare-effect-execution-authority-contract.md` — comprehensive contract document (297 lines).
- Effect-execution adapter taxonomy as fifth adapter class complementing Tasks 351–357.
- First allowed effect path: `send_reply` via Microsoft Graph draft/send.
- Approved-command eligibility rules.
- Full state transition grammar with ASCII state machine diagram.
- Execution attempt evidence schema.
- Retry/terminal failure semantics with Graph error classification.
- Confirmation separation: execution success ≠ confirmation.
- Forbidden shortcuts (evaluator-driven execution, API-success-as-confirmation, autonomous send, production-readiness claims).
- No-overclaim language style guide.

**Tests/checks:** Document-only task. `pnpm verify` passes.

**Residuals:** Contract may need amendment if additional effect types (move_message, mark_read, set_categories) are added in future chapters.

**Boundary concerns:** None. Contract correctly preserves all IAS boundaries and explicitly forbids every shortcut that would collapse them.

---

### Task 359 — Effect Worker State Machine

**Delivered:**
- `packages/sites/cloudflare/src/effect-worker.ts` — `executeApprovedCommands(ctx, adapter, options)`.
- `EffectExecutionAdapter` interface — mockable boundary for external effect attempts.
- `EffectWorkerContext` interface — storage operations subset matching `CycleCoordinator`.
- Approved-only gate: scans `status = 'approved_for_send'`.
- Action-type gate: only `send_reply` is allowed for this chapter.
- Lease gate: skips commands with active `attempting` leases.
- Health gate: blocks execution when `auth_failed`.
- Execution attempt record creation before adapter call.
- Status transitions: `attempting` → `submitted` | `failed_retryable` | `failed_terminal`.
- Never transitions to `confirmed`.
- `test/unit/effect-worker-state-machine.test.ts` — 16 focused tests.

**Tests:** 16 tests covering approved-only eligibility, action-type filtering, lease skip, health gate, attempt record creation, submitted/failed_retryable/failed_terminal transitions, adapter exception handling, and worker result shape. All pass.

**Residuals:** Effect worker is not wired into `runCycle()` as a cycle step. It is a standalone worker function that must be invoked separately.

**Boundary concerns:** None. Worker only processes `approved_for_send` commands. Confirmation remains the exclusive concern of reconciliation.

---

### Task 360 — Bounded Graph Draft/Send Adapter

**Delivered:**
- `packages/sites/cloudflare/src/effects/graph-draft-send-adapter.ts` — `GraphDraftSendAdapter`.
- `GraphDraftClient` interface — mockable boundary for `createDraftReply` and `sendDraft`.
- Two-stage execution: draft creation → send.
- Retry loop: 3 attempts with exponential backoff for retryable failures.
- Error classification: terminal (401/403/400/404/413) vs retryable (429/503/504/network).
- `test/unit/graph-draft-send-adapter.test.ts` — 17 focused tests.

**Tests:** 17 tests covering full draft+send success, draft creation failure, send failure, retryable vs terminal classification for each HTTP status, network error, retry exhaustion, and result shape. All pass.

**Residuals:** Real Microsoft Graph API calls not exercised. Token refresh, attachment handling, and HTML body formatting are deferred.

**Boundary concerns:** None. Adapter is purely mechanical — no eligibility, approval, or confirmation authority.

---

### Task 361 — Execution Audit And Failure Semantics

**Delivered:**
- `packages/sites/cloudflare/src/effects/send-reply-adapter.ts` — integration bridge `createSendReplyEffectAdapter()`.
- Bridges `EffectExecutionAdapter` interface with `GraphDraftSendAdapter`.
- Parses `payloadJson` into `SendReplyPayload`; malformed payload → terminal failure.
- Serializes full `GraphDraftSendResult` into `responseJson` for audit (draftId, sentMessageId, internetMessageId, submittedAt).
- `test/unit/execution-audit-integration.test.ts` — 8 integration tests.

**Tests:** 8 tests covering full pipeline (worker → bridge → Graph adapter), retryable/terminal failure classification, duplicate prevention via active lease, crash recovery after lease expiry, missing external ID recorded honestly, malformed payload → terminal failure, and ambiguous crash (post-Graph acceptance, pre-persistence) acknowledged. All pass.

**Residuals:** Per-command retry limit (max 5 `failed_retryable` before auto-promotion to `failed_terminal`) is specified in the contract but not enforced in code.

**Boundary concerns:** None. Bridge is mechanical. Worker owns state transitions. Adapter owns Graph API semantics.

---

### Task 362 — Reconciliation After Execution

**Delivered:**
- `createLiveReconcileStepHandler` updated to query `submitted` outbounds instead of `pending`.
- Enriches each submitted outbound with `internetMessageId` from the latest execution attempt's `responseJson`.
- Passes enriched `PendingOutbound` to `LiveObservationAdapter.fetchObservations()`.
- Confirms matching outbounds to `confirmed`.
- `getSubmittedOutboundCommands()` and `getLatestExecutionAttempt()` added to coordinator.
- `test/unit/reconciliation-after-execution.test.ts` — 9 focused tests.

**Tests:** 9 tests covering submitted command without observation (remains submitted), matching live observation (confirmed), execution attempt record alone cannot confirm, reconciliation uses `internetMessageId` from execution attempt `responseJson`, adapter failure does not fabricate confirmation, partial confirmation, deadline exceeded mid-reconcile, no submitted commands (skipped), and deadline exceeded before start (skipped). All pass.

**Residuals:** Existing `live-reconciliation-adapter.test.ts` tests updated to transition outbounds to `submitted` before reconciliation, reflecting the new post-execution semantics.

**Boundary concerns:** None. Reconciliation exclusively owns confirmation. Worker and adapter never set `confirmed`.

---

### Task 363 — Effect Execution Proof

**Delivered:**
- `test/unit/effect-execution-proof.test.ts` — 6 focused tests proving the full effect-execution path.
- Test 1: Full happy path — approval → execution → submitted → observation → confirmed.
- Test 2: Approval precedes execution — worker skips non-approved commands.
- Test 3: Submitted ≠ confirmed — without observation, submitted outbounds stay submitted.
- Test 4: Adapter is mechanical — does not gate, approve, or reject.
- Test 5: Evaluator does not execute — evaluations produce no outbound commands.
- Test 6: Audit records are inspectable — operator action requests and execution attempts are both durable and queryable.

**Tests:** 6 tests. All pass.

**No-overclaim statement included in test file:**
- External Graph boundary is mocked — no real API calls.
- No actual email is sent — `send_reply` is simulated.
- Bounded proof of authority separation, not production readiness.
- Production deployment has not been exercised.

**Residuals:** None.

**Boundary concerns:** None. All IAS boundaries asserted in tests.

---

## Effect Boundary Table

| Seam | Status | Adapter / Handler | External Boundary | Tests |
|------|--------|-------------------|-------------------|-------|
| **source-read** | LIVE | `HttpSourceAdapter` + `createLiveSyncStepHandler` | HTTP endpoint (mocked) | 8 |
| **charter-runtime** | LIVE | `MockCharterRunner` in sandbox + `createSandboxEvaluateStepHandler` | Sandbox execution (mock runner) | 6 |
| **reconciliation-read** | LIVE | `GraphLiveObservationAdapter` + `createLiveReconcileStepHandler` | Graph API read (mocked client) | 16 + 9 |
| **operator-control** | LIVE | `executeSiteOperatorAction` | HTTP endpoint (real DO SQLite) | 31 |
| **effect-execution** | **MOCKED / bounded** | `executeApprovedCommands` + `GraphDraftSendAdapter` + `createSendReplyEffectAdapter` | Graph mutate APIs (mocked client) | 16 + 17 + 8 + 6 |
| derive_work | fixture | `createDeriveWorkStepHandler` | None | 12 |
| handoff | fixture | `createHandoffStepHandler` | None | 12 |

---

## No-Overclaim Verification

| Claim | Status | Evidence |
|-------|--------|----------|
| Production readiness | ❌ Not claimed | Tests use mocked `fetch`, mock Graph client. No production deploy. |
| Autonomous send | ❌ Not claimed | Explicit operator `approve` action required before `executeApprovedCommands` processes a command. |
| Full Graph parity | ❌ Not claimed | Only `send_reply` via draft+send is implemented. No move, mark_read, set_categories. |
| Real external mutation | ❌ Not claimed | Graph client is mocked. No real email sent. |
| Confirmation from API success | ❌ Not claimed | Worker transitions to `submitted` only. Reconciliation transitions to `confirmed` only. |
| Generic execution abstraction | ❌ Not claimed | `send_reply` is hardcoded. No multi-provider substrate. |
| Bounded effect-execution proof | ✅ Claimed and evidenced | Full path proven: approve → execute → submitted → reconcile → confirmed. 56 tests across effect-execution files. |

---

## Authority Boundary Review

| Boundary | Status | Evidence |
|----------|--------|----------|
| Facts are durable boundary | ✅ | `facts` + `apply_log` + `source_cursors`. Unchanged from prior chapter. |
| Context/work is separate from facts | ✅ | `createDeriveWorkStepHandler` creates `context_records`/`work_items` from `facts`. |
| Evaluation is separate from decision | ✅ | Evaluator produces `evaluations`. Handoff creates `decisions`. |
| Decision is separate from intent/handoff | ✅ | `createHandoffStepHandler` creates both `decisions` and `outbound_commands` as separate rows. |
| Execution requires prior approval | ✅ | `executeApprovedCommands` only processes `approved_for_send`. `pending`/`draft_ready` are skipped. |
| Execution success ≠ confirmation | ✅ | Worker transitions to `submitted`. Reconciliation transitions to `confirmed`. |
| Confirmation requires observation | ✅ | `createLiveReconcileStepHandler` fetches observations from adapter. No self-confirmation. |
| Operator mutation is audited | ✅ | `executeSiteOperatorAction` writes `operator_action_requests` before mutation. |
| Execution attempt is audited | ✅ | `execution_attempts` records every attempt with worker_id, response_json, external_ref. |
| Trace/health are advisory | ✅ | Removing them leaves durable boundaries intact. |

---

## CCC Posture Assessment

The chapter's target was to move `constructive_executability` from `+1 scoped` to `+1 wider scoped` by adding one bounded external effect-execution path.

| Coordinate | Before | After |
|------------|--------|-------|
| semantic_resolution | `0` | `0` (no new semantics; vocabulary stable) |
| invariant_preservation | `0` | `0` (all IAS boundaries held; execution/confirmation separation added) |
| constructive_executability | `+1 scoped` | **`+1 wider scoped`** (effect-execution path attached to kernel spine) |
| grounded_universalization | `0` | `0` (mailbox-like synthetic case; no claim of generic substrate) |
| authority_reviewability | `0` | `0` (operator approval and execution audit are both inspectable) |
| teleological_pressure | `0` | `0` (pressure on useful governed action, not production overclaim) |

**Verdict:** `constructive_executability` for the Cloudflare Site moved from `+1 scoped` to `+1 wider scoped`.

This is a scoped widening, not a universal claim. The effect-execution seam is architecturally real and tested, but its external boundary (Microsoft Graph API) is mocked. Production readiness requires credentialing, egress policy, rate-limit handling, and operational validation that remain deferred.

---

## Residuals

1. **Real Microsoft Graph draft/send** — `GraphDraftClient` is mocked. Real Graph API calls with token refresh, attachment handling, and HTML formatting are deferred.
2. **Effect worker not wired into `runCycle()`** — `executeApprovedCommands` is a standalone function. A cycle step handler that invokes it is deferred.
3. **Per-command retry limit** — Contract specifies max 5 `failed_retryable` before auto-promotion to `failed_terminal`. Not enforced in code.
4. **Additional effect types** — `move_message`, `mark_read`, `set_categories` are specified in contract but not implemented.
5. **Real Graph reconciliation** — `GraphObservationClient` is mocked. Real Graph API polling for sent-item confirmation is deferred.
6. **Cron Trigger wiring** — `runCycle` is test-invoked. Scheduled production cycles require Cron Trigger configuration.
7. **DO RPC via `fetch()`** — Tests call DO methods directly. Production Worker → DO boundary must use `fetch()` RPC.
8. **Production deployment** — No production deploy, credential rotation, or egress policy validation.

---

## Recommended Next Work

1. **Cloudflare Site v1 — Production Effect Execution** (highest pressure)
   - Wire `executeApprovedCommands` into `runCycle()` as a cycle step (step 5.5 or step 7)
   - Real Microsoft Graph API client with credential binding and token refresh
   - Egress policy and rate-limit handling
   - Per-command retry limit enforcement

2. **Cloudflare Site v1 — Live Source Sync**
   - Graph-specific source adapter with delta token pagination
   - Webhook ingress as alternative to polling

3. **Cloudflare Site v1 — Real Charter Runtime**
   - Codex API or Kimi API calls inside Sandbox with real credentials
   - Tool catalog binding and execution

4. **Infrastructure Hardening**
   - Cron Trigger wiring for scheduled cycles
   - DO RPC via `fetch()` for production safety
   - Multi-Site support (`site_id`/`scope_id` separation)

---

## Closure Checklist

- [x] Closure decision exists.
- [x] Tasks 358–363 are assessed.
- [x] Effect boundary table is tabulated.
- [x] No-overclaim review is explicit.
- [x] Submitted vs confirmed boundary is reviewed.
- [x] CCC posture movement is scoped and evidenced.
- [x] Changelog/docs updated.
- [x] No derivative task-status files created.
