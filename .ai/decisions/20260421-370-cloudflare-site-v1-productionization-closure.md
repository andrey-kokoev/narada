# Decision: Cloudflare Site v1 Productionization Chapter Closure

**Date:** 2026-04-21  
**Chapter:** Tasks 365–370  
**Verdict:** **Closed — accepted.**

---

## Summary

The Cloudflare Site v1 Productionization chapter moved the Site from bounded mocked effect-execution proof to production-shaped mechanics: the effect worker participates in the Cycle as a first-class step, real Graph credential and client binding seams exist without requiring live credentials in tests, retry limits and backoff are enforced, and production substrate boundaries (Worker→DO RPC and Cron-triggered Cycle entry) are fixture-proven.

**Honest scope:** This is production-shaped mechanics, not production readiness. The external Graph API boundary is mocked in tests. No real email is sent. Production deployment would need credential rotation, egress policy, rate-limit tuning, and operational monitoring.

---

## Task-by-Task Assessment

### Task 365 — v1 Productionization Boundary Contract

**Delivered:**
- `docs/deployment/cloudflare-v1-productionization-boundary-contract.md` — comprehensive contract document (298 lines).
- Production-shaped vs production-ready distinction table.
- In-scope/out-of-scope task mapping for 365–370.
- No-overclaim constraints: no autonomous send, no API-success-as-confirmation, no production-readiness claim, no generic abstraction.
- Cycle integration boundaries: effect worker as step 6, reconcile as step 7.
- Credential/client binding seam: required env bindings, token provider interface, fetch-based draft client, factory with fail-closed validation.
- Retry limit and backoff semantics.
- Production substrate boundaries: Worker→DO RPC and Cron entry.

**Tests/checks:** Document-only task. `pnpm verify` passes at package level.

**Residuals:** Contract may need amendment if additional effect types, multi-site scheduling, or live manual trial work is pursued.

**Boundary concerns:** None. Contract correctly preserves all IAS boundaries and explicitly forbids every shortcut that would collapse them.

---

### Task 366 — Wire Effect Worker Into Cloudflare Cycle

**Delivered:**
- `createEffectExecuteStepHandler(adapter)` in `packages/sites/cloudflare/src/cycle-step.ts` — step-6 handler that wraps `executeApprovedCommands` in the `CycleStepHandler` contract.
- 9-step cycle ordering: sync(2) → derive_work(3) → evaluate(4) → handoff(5) → effect_execute(6) → reconcile(7) → health/trace(8) → lock release(9).
- Fixture reconcile made submitted-only: `createReconcileStepHandler` processes only `submitted` outbounds; `pending` outbounds are skipped.
- Handoff fix: `createHandoffStepHandler` creates outbounds with `actionType: "send_reply"` so the effect worker's allowed-action gate passes them.
- Effect-worker exception handling: unexpected exceptions return `status: "failed"`, not `"completed"`.
- `test/unit/effect-worker-cycle.test.ts` — 8 focused tests.

**Tests:** 8 tests covering cycle integration, approved-only execution, unapproved skip, submitted≠confirmed, adapter failure handling, and step result shape. All pass.

**Residuals:** None. Effect worker is fully integrated as a Cycle step.

**Boundary concerns:** None. Step preserves all worker gates (approved-only, action-type, lease, health). Reconciliation remains the only path to `confirmed`.

---

### Task 367 — Real Graph Credential And Client Binding

**Delivered:**
- `packages/sites/cloudflare/src/effects/graph-token-provider.ts` — `GraphTokenProvider` interface, `StaticBearerTokenProvider`, `ClientCredentialsTokenProvider` with caching and invalidation.
- `packages/sites/cloudflare/src/effects/fetch-graph-draft-client.ts` — `FetchGraphDraftClient` implementing `GraphDraftClient` with real Graph semantics:
  - `createDraftReply`: `POST /users/{scopeId}/messages/{parentMessageId}/createReply`
  - `sendDraft`: `POST /users/{scopeId}/messages/{draftId}/send` — handles Graph's `202 Accepted` empty-body response gracefully; `sentMessageId` is optional.
- `packages/sites/cloudflare/src/effects/graph-client-factory.ts` — `createGraphDraftClient(env)` factory with credential resolution precedence (static bearer > OAuth client credentials) and fail-closed `GraphCredentialError`.
- `packages/sites/cloudflare/test/unit/fetch-graph-draft-client.test.ts` — 18 focused tests with mocked `global.fetch` proving factory validation, token caching, response mapping, 401/403/429 error classification, timeout/network errors, and 202 empty-body handling.

**Tests:** 18 tests. All pass.

**Corrections applied during review:**
- `createDraftReply` changed from incorrect `POST /messages` to correct `POST /messages/{parentMessageId}/createReply`.
- `sendDraft` changed from unconditionally parsing JSON response to handling `202 Accepted` empty body, which is real Graph behavior.
- `sentMessageId` made optional throughout the chain so the adapter does not crash when Graph cannot provide it.

**Residuals:** Live Graph API calls not exercised. Token refresh beyond 60-second expiry skew not proven under load. Attachment and HTML body formatting deferred.

**Boundary concerns:** None. Factory fails closed before mutation. All tests use mocked `fetch`. No real email sent.

---

### Task 368 — Effect Execution Retry Limit And Backoff

**Delivered:**
- `packages/sites/cloudflare/src/effect-worker.ts` — retry limit gate, backoff gate, and auto-promotion to `failed_terminal` with audit record.
- `packages/sites/cloudflare/src/coordinator.ts` — `countRetryableAttempts(outboundId)` SQL COUNT of `failed_retryable` attempts.
- Per-command retry limit (default 5): count ≥ limit → auto-promote to `failed_terminal` with `errorCode: RETRY_LIMIT_EXHAUSTED`.
- Exponential backoff: `min(baseDelayMs * 2^(count-1), maxDelayMs)`.
- `test/unit/effect-execution-retry-limit.test.ts` — 9 focused tests.

**Tests:** 9 tests covering below-limit retryable, at-limit terminal promotion, backoff skip, expired backoff retry, terminal promotion skips adapter, backoff residual recording, and zero-count first attempt. All pass.

**Honest residual:** Retry-After header support is **not implemented**. The adapter boundary does not expose `Retry-After` data to the worker. This is explicitly documented in the contract and task file. No false claim exists.

**Boundary concerns:** None. Retry limit and backoff are purely mechanical gates. They do not change authority boundaries.

---

### Task 369 — Production RPC And Cron Wiring

**Delivered:**
- `packages/sites/cloudflare/src/coordinator.ts` — DO `fetch()` HTTP routing for `/status`, `/control/actions`, and `/cycle`.
- `packages/sites/cloudflare/src/runner.ts` — `runCycleOnCoordinator(siteId, coordinator, env, ...)` extracted so DO `fetch()` and Cron handlers can delegate to the same cycle path.
- `packages/sites/cloudflare/src/index.ts` — Worker `scheduled` handler using `env.SITE_ID` (not `event.cron`) for site identity.
- `test/integration/do-rpc-handler.test.ts` — 6 tests including Worker→DO stub `fetch()` test proving the production-shaped RPC boundary.
- `test/integration/cron-handler.test.ts` — 2 tests proving scheduled cycle entry.

**Tests:** 8 integration tests (6 RPC + 2 Cron). All pass.

**Corrections applied during review:**
- `event.cron` no longer used as site identifier. Site identity comes from `env.SITE_ID` with `"default"` fallback.
- DO `/control/actions` route now validates `action_type` against known set (`approve`, `reject`, `retry`, `cancel`) before calling `executeSiteOperatorAction`.
- Contract doc §7 updated to reflect stub-based test pattern and correct Cron code sample.

**Residuals:** Full DO RPC under real Cloudflare traffic not load-tested. Cron schedule tuning and monitoring deferred. Multi-site scheduling (`site_id`/`scope_id` separation) not built.

**Boundary concerns:** None. DO `fetch()` routing is a mechanical substrate boundary. It does not change authority boundaries.

---

## Effect Boundary Table

| Seam | Status | Adapter / Handler | External Boundary | Tests |
|------|--------|-------------------|-------------------|-------|
| **source-read** | LIVE | `HttpSourceAdapter` + `createLiveSyncStepHandler` | HTTP endpoint (mocked) | 8 |
| **charter-runtime** | LIVE | `MockCharterRunner` in sandbox + `createSandboxEvaluateStepHandler` | Sandbox execution (mock runner) | 6 |
| **reconciliation-read** | LIVE | `GraphLiveObservationAdapter` + `createLiveReconcileStepHandler` | Graph API read (mocked client) | 16 + 9 + 6 |
| **operator-control** | LIVE | `executeSiteOperatorAction` | HTTP endpoint (real DO SQLite) | 31 |
| **effect-execution** | **MOCKED / production-shaped** | `executeApprovedCommands` + `GraphDraftSendAdapter` + `createSendReplyEffectAdapter` + `FetchGraphDraftClient` | Graph mutate APIs (mocked client; real seam exists) | 16 + 17 + 8 + 6 + 8 + 9 |
| **credential seam** | **PRODUCTION-SHAPED** | `createGraphDraftClient` + `GraphTokenProvider` | Env bindings / Microsoft identity | 18 |
| **substrate RPC** | **PRODUCTION-SHAPED** | DO `fetch()` routing + Worker `scheduled` | Cloudflare Workers runtime | 8 |
| derive_work | fixture | `createDeriveWorkStepHandler` | None | 12 |
| handoff | fixture | `createHandoffStepHandler` | None | 12 |

**Total:** 33 test files, 297 tests pass across the Cloudflare package.

---

## No-Overclaim Verification

| Claim | Status | Evidence |
|-------|--------|----------|
| Production readiness | ❌ Not claimed | Tests use mocked `fetch`, mock Graph client. No production deploy. Contract and docs use "production-shaped mechanics." |
| Autonomous send | ❌ Not claimed | Explicit operator `approve` action required before `executeApprovedCommands` processes a command. Worker skips `pending`/`draft_ready`. |
| Full Graph parity | ❌ Not claimed | Only `send_reply` via draft+send is implemented. No move, mark_read, set_categories. |
| Real external mutation | ❌ Not claimed | `FetchGraphDraftClient` exists but all tests mock `global.fetch`. No real email sent. |
| Confirmation from API success | ❌ Not claimed | Worker transitions to `submitted` only. Reconciliation transitions to `confirmed` only. |
| Generic execution abstraction | ❌ Not claimed | All types remain Cloudflare-specific. No multi-provider substrate. |
| Effect worker in Cycle | ✅ Claimed and evidenced | Step 6 handler proven. 8 tests. Full 9-step cycle proven in runner tests. |
| Credential/client binding seam | ✅ Claimed and evidenced | Factory, token provider, and fetch client exist. 18 tests. Fail-closed before mutation. |
| Retry limit and backoff | ✅ Claimed and evidenced | Per-command max 5 with exponential backoff. 9 tests. Auto-promotion audited. |
| Worker→DO RPC and Cron entry | ✅ Claimed and evidenced | DO `fetch()` routing and `scheduled` handler fixture-proven. 8 integration tests. |
| Bounded production-shaped proof | ✅ Claimed and evidenced | Full path: approve → execute → submitted → reconcile → confirmed. All IAS boundaries held. |

---

## Authority Boundary Review

| Boundary | Status | Evidence |
|----------|--------|----------|
| Facts are durable boundary | ✅ | `facts` + `apply_log` + `source_cursors`. Unchanged from prior chapters. |
| Context/work is separate from facts | ✅ | `createDeriveWorkStepHandler` creates `context_records`/`work_items` from `facts`. |
| Evaluation is separate from decision | ✅ | Evaluator produces `evaluations`. Handoff creates `decisions`. |
| Decision is separate from intent/handoff | ✅ | `createHandoffStepHandler` creates both `decisions` and `outbound_commands` as separate rows. |
| Execution requires prior approval | ✅ | `executeApprovedCommands` only processes `approved_for_send`. `pending`/`draft_ready` are skipped. |
| Execution success ≠ confirmation | ✅ | Worker transitions to `submitted`. Reconciliation transitions to `confirmed`. |
| Confirmation requires observation | ✅ | `createLiveReconcileStepHandler` fetches observations from adapter. No self-confirmation. |
| Operator mutation is audited | ✅ | `executeSiteOperatorAction` writes `operator_action_requests` before mutation. |
| Execution attempt is audited | ✅ | `execution_attempts` records every attempt with worker_id, response_json, external_ref. |
| Trace/health are advisory | ✅ | Removing them leaves durable boundaries intact. |
| Credential seam fails closed | ✅ | `createGraphDraftClient` throws `GraphCredentialError` before any mutation. |

---

## CCC Posture Assessment

The chapter's target was to move `constructive_executability` from `+1 wider scoped` to `+1 production-shaped`, and `teleological_pressure` from `0` to `+1 bounded`.

| Coordinate | Before | After |
|------------|--------|-------|
| semantic_resolution | `0` | `0` (no new semantics; vocabulary stable) |
| invariant_preservation | `0` | `0` (all IAS boundaries held; execution/confirmation separation strengthened) |
| constructive_executability | `+1 wider scoped` | **`+1 production-shaped`** (effect worker in cycle + credential seam + retry limits + RPC/Cron substrate) |
| grounded_universalization | `0` | `0` (mailbox-like synthetic case; no claim of generic substrate) |
| authority_reviewability | `0` | `0` (operator approval, execution audit, and action audit are all inspectable) |
| teleological_pressure | `0` | **`+1 bounded`** (unattended execution mechanics present without production overclaim) |

**Verdict:** `constructive_executability` moved from `+1 wider scoped` to `+1 production-shaped`. `teleological_pressure` moved to `+1 bounded`.

This is a scoped, honest movement. The production-shaped seams are architecturally real and tested, but their external boundaries (Microsoft Graph API, Cloudflare Workers runtime) are mocked or fixture-proven. Production readiness requires credential rotation, egress policy, rate-limit tuning, and operational validation that remain deferred.

---

## Residuals

1. **Live Microsoft Graph draft/send** — `FetchGraphDraftClient` is tested with mocked `fetch`. Real Graph API calls with token refresh under load, attachment handling, and HTML formatting are deferred.
2. **Retry-After header support** — Not implemented. Adapter boundary does not expose `Retry-After` data to the worker. Exponential backoff is used instead.
3. **Production deployment** — No production deploy, credential rotation, egress policy validation, or operational monitoring.
4. **Rate-limit tuning** — Backoff parameters are defaults. Production load patterns may require different values.
5. **Multi-Site support** — `site_id`/`scope_id` conflation exists for v0 single-Site setups. `env.SITE_ID` with `"default"` fallback is the current mechanism.
6. **Cron schedule tuning** — Cron entry point exists but schedule interval, jitter, and retry policy are Cloudflare dashboard concerns.
7. **Real charter runtime** — `MockCharterRunner` simulates output. Real OpenAI/Kimi calls with knowledge injection and prompt materialization are deferred.
8. **Real Graph reconciliation** — `GraphObservationClient` is mocked. Real Graph API polling for sent-item confirmation is deferred.
9. **Additional effect types** — `move_message`, `mark_read`, `set_categories` are specified in the effect-execution contract but not implemented.
10. **Transaction wrapping** — `insertFact` + `markEventApplied` are separate SQL exec calls. Full atomicity is a future enhancement.

---

## Recommended Next Work

1. **Cloudflare Site — Live Operational Trial** (highest pressure)
   - Manual live trial with real Graph credentials in a non-production tenant
   - End-to-end test: real mailbox → sync → evaluate → handoff → operator approve → effect execute → real send → reconcile → confirmed
   - Validate token refresh, rate-limit behavior, and error classification against real Graph responses

2. **Cloudflare Site — Retry-After And Rate-Limit Hardening**
   - Expose `Retry-After` data through `EffectExecutionAdapter` result interface
   - Store retry timing in execution attempts
   - Tune backoff parameters based on observed Graph behavior

3. **Cloudflare Site — Multi-Site And Infrastructure Hardening**
   - Separate `site_id` from `scope_id` in routing and bindings
   - Cron schedule configuration per site
   - DO RPC load testing and error handling under real traffic

4. **Cloudflare Site — Real Charter Runtime**
   - Codex API or Kimi API calls inside Sandbox with real credentials
   - Tool catalog binding and execution
   - Knowledge injection and prompt materialization

---

## Closure Checklist

- [x] Closure decision exists.
- [x] Tasks 365–369 are assessed.
- [x] Effect boundary table is tabulated.
- [x] No-overclaim review is explicit.
- [x] Authority boundary review is explicit.
- [x] CCC posture movement is scoped and evidenced.
- [x] Residuals are concrete and prioritized.
- [x] Changelog/docs updated.
- [x] No derivative task-status files created.
