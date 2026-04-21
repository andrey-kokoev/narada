# Decision: Cloudflare Live Adapter Spine Chapter Closure

**Date:** 2026-04-21  
**Chapter:** Tasks 351–357  
**Verdict:** **Closed — accepted.**

---

## Summary

The Cloudflare Live Adapter Spine chapter defined a boundary contract for live adapters and implemented four bounded live seams around the fixture-backed kernel spine: source-read, charter-runtime, reconciliation-read, and operator-control. Effect execution remains explicitly out of scope.

**Honest scope:** This is live-safe executability, not production readiness. The live adapters are architecturally real and wired through `runCycle()`, but their external boundaries (Microsoft Graph, OpenAI/Kimi API) are mocked in tests. A production deployment would need real credentials, egress policy, and operational validation.

---

## Task-by-Task Assessment

### Task 351 — Live Adapter Boundary Contract

**Delivered:**
- `docs/deployment/cloudflare-live-adapter-boundary-contract.md` — comprehensive contract document (211 lines).
- Adapter taxonomy: source-read, charter-runtime, reconciliation-read, operator-control (in scope); effect-execution (out of scope).
- Allowed/forbidden behavior for each in-scope seam.
- Authority boundaries adapters cannot cross (fact, foreman, IAS, confirmation, audit, advisory signal).
- No-overclaim language style guide.
- Task reference table mapping 352–357 to contract sections.

**Tests/checks:** Document-only task. Review applied four fixes (wording, expansion, failure-mode paragraphs, identity note). `pnpm verify` passes.

**Residuals:** Contract may need amendment if Tasks 352–355 discover unanticipated edge cases during deeper operational use.

**Boundary concerns:** None. Contract correctly preserves all IAS and foreman boundaries.

---

### Task 352 — Live Source Adapter Spike

**Delivered:**
- `packages/sites/cloudflare/src/source-adapter.ts` — `SourceAdapter` interface, `SourceAdapterError`, `HttpSourceAdapter` with custom transform support.
- `createLiveSyncStepHandler(adapter, options?)` in `cycle-step.ts` — step-2 handler that reads from a live adapter, catches failures before state mutation, admits deltas through the fact/cursor/apply-log boundary.
- `test/unit/live-source-adapter.test.ts` — 8 focused tests.

**Tests:** 8 tests covering live admission, idempotency, network failure, HTTP error, custom transform, deadline skip, missing identity field, and mid-sync deadline cursor safety. All pass.

**Critical fix applied during review:** Cursor advanced past unprocessed deltas when `canContinue()` returned `false` mid-loop. Fixed in both `createSyncStepHandler` and `createLiveSyncStepHandler` by tracking `lastProcessedDelta`.

**Residuals:** `HttpSourceAdapter` does not retry transient failures. Retry is implicit via next Cron invocation + health decay.

**Boundary concerns:** None. Adapter failure caught before coordinator mutation. Cursor advances only to processed deltas.

---

### Task 353 — Sandbox Charter Runtime Attachment

**Delivered:**
- `packages/sites/cloudflare/src/sandbox/charter-runtime.ts` — `createCharterSandboxPayload`, `runCharterInSandbox`, `createMockCharterRunnerForSandbox`.
- `createSandboxEvaluateStepHandler(charterRunner)` in `cycle-step.ts` — step-4 handler that builds a `CharterInvocationEnvelope` from open work items, runs it through `runSandbox`, and persists evaluation records.
- Sandbox timeout/oom/error handling degrades gracefully (logs residual, does not fail cycle).
- `test/unit/sandbox-charter-runtime.test.ts` — 6 focused tests.

**Blocker assessment:** No blockers found. `fetch()` is available in Workers, secrets bind via `env`, no Node.js-specific APIs required.

**Tests:** 6 tests covering full cycle integration, IAS boundary, timeout degradation, error handling, direct sandbox call, and fixture evaluator fallback. All pass.

**Residuals:** Real OpenAI/Kimi API calls not exercised in tests (mock runner used). Tool execution inside Sandbox not proven. Full charter runtime with knowledge injection and prompt materialization deferred.

**Boundary concerns:** None. Evaluator produces evaluations; handoff creates decisions separately.

---

### Task 354 — Live Reconciliation Adapter

**Delivered:**
- `packages/sites/cloudflare/src/reconciliation/live-observation-adapter.ts` — `LiveObservationAdapter` interface, `GraphLiveObservationAdapter` with `GraphObservationClient` boundary.
- `createLiveReconcileStepHandler(adapter)` in `cycle-step.ts` — step-6 handler that fetches observations from a live adapter, confirms outbounds against them, and never fabricates confirmation on adapter failure.
- `test/unit/live-reconciliation-adapter.test.ts` — 16 focused tests.

**Tests:** 16 tests covering send_reply confirmation via internetMessageId and header, non-send actions (mark_read, move_message, set_categories), missing observation leaves pending, adapter failure does not fabricate confirmation, partial confirmation, and custom client behavior. All pass.

**Residuals:** Real Microsoft Graph API calls not exercised in tests (mock client used). Webhook observation path not proven.

**Boundary concerns:** None. Adapter provides observations; reconcile handler performs confirmation. Adapter failure returns empty observations, not fabricated confirmations.

---

### Task 355 — Operator Mutation Surface

**Delivered:**
- `packages/sites/cloudflare/src/operator-actions.ts` — `executeSiteOperatorAction` with audit-first pattern (`pending` → `executed`/`rejected`).
- Four bounded actions: `approve`, `reject` (target outbounds), `retry`, `cancel` (target work items).
- `test/unit/operator-mutation.test.ts` — 17 unit tests.
- `test/integration/operator-action-handler.test.ts` — 14 integration tests for HTTP endpoint.
- DO schema extended with `operator_action_requests` table.

**Tests:** 31 tests (17 unit + 14 integration) covering audit invariant, all four actions, lifecycle constraints, invalid transition rejection, request_id consistency, auth, payload validation, and read-only observation preservation. All pass.

**Residuals:** Authentication beyond basic `ADMIN_TOKEN` check is minimal. Operator actions do not execute effects directly (approve transitions to `approved_for_send`, but actual send is deferred).

**Boundary concerns:** None. Audit is always written before mutation attempt. Rejected actions return 422 without hidden mutation.

---

### Task 356 — Live-Safe Spine Proof

**Delivered:**
- `test/unit/live-safe-spine-proof.test.ts` — 3 focused tests proving the bounded live-safe path.
- Test 1: Full cycle through `runCycle()` using live adapters for sync (HttpSourceAdapter), evaluate (sandbox mock runner), and reconcile (GraphLiveObservationAdapter).
- Test 2: Operator mutation audit — `approve` succeeds and audits; `reject` on invalid state fails and still audits.
- Test 3: Documentation contract test enumerating all 7 seams with their live/fixture/blocked status.

**Tests:** 3 tests. All pass.

**Residuals:** None.

**Boundary concerns:** None. All IAS boundaries asserted in tests.

---

## Live vs Fixture vs Blocked Seam Table

| Seam | Status | Adapter / Handler | External Boundary | Tests |
|------|--------|-------------------|-------------------|-------|
| **source-read** | **LIVE** | `HttpSourceAdapter` + `createLiveSyncStepHandler` | HTTP endpoint (mocked in tests) | 8 |
| **charter-runtime** | **LIVE** | `MockCharterRunner` in `runSandbox` + `createSandboxEvaluateStepHandler` | Sandbox execution (mock runner, no live API) | 6 |
| **reconciliation-read** | **LIVE** | `GraphLiveObservationAdapter` + `createLiveReconcileStepHandler` | Graph API (mocked client in tests) | 16 |
| **operator-control** | **LIVE** | `executeSiteOperatorAction` | HTTP endpoint (real against DO SQLite) | 31 |
| derive_work | fixture | `createDeriveWorkStepHandler` | None — internal governance | 12 |
| handoff | fixture | `createHandoffStepHandler` | None — internal governance | 12 |
| **effect-execution** | **BLOCKED / out of scope** | None | Graph mutate APIs (send, draft, move) | — |

---

## No-Overclaim Verification

| Claim | Status | Evidence |
|-------|--------|----------|
| Production readiness | ❌ Not claimed | Tests use mocked `fetch`, mock charter runner, mock Graph client. No production deploy. |
| Full Graph sync parity | ❌ Not claimed | `HttpSourceAdapter` is a generic HTTP poller, not a full Graph delta sync. |
| Real charter runtime calling OpenAI/Kimi | ❌ Not claimed | `MockCharterRunner` simulates output. No live API keys used. |
| Autonomous send | ❌ Not claimed | Effect execution is explicitly out of scope. Outbounds confirmed but never sent. |
| Generic Runtime Locus abstraction | ❌ Not claimed | All types and handlers are Cloudflare-specific. No abstraction layer. |
| Live-safe executability | ✅ Claimed and evidenced | Four live seams wired through `runCycle()`. 197 tests pass. |

---

## Authority Boundary Review

| Boundary | Status | Evidence |
|----------|--------|----------|
| Facts are durable boundary | ✅ | `facts` + `apply_log` + `source_cursors`. Live adapter admits through same boundary. |
| Context/work is separate from facts | ✅ | `createDeriveWorkStepHandler` creates `context_records`/`work_items` from `facts`. |
| Evaluation is separate from decision | ✅ | `createSandboxEvaluateStepHandler` persists `evaluations`. Handoff creates `decisions`. |
| Decision is separate from intent/handoff | ✅ | `createHandoffStepHandler` creates both `decisions` and `outbound_commands` as separate rows. |
| Confirmation requires observation | ✅ | `createLiveReconcileStepHandler` fetches observations from adapter. No self-confirmation. |
| Operator mutation is audited | ✅ | `executeSiteOperatorAction` writes `operator_action_requests` before mutation. |
| Trace/health are advisory | ✅ | Notifications, traces, health — all advisory. Removing them leaves durable boundaries intact. |

---

## CCC Posture Assessment

The chapter's target was to move `constructive_executability` from `0` to `+1` scoped for bounded live-safe Cloudflare Site operation.

| Coordinate | Before | After |
|------------|--------|-------|
| semantic_resolution | `0` | `0` (no new semantics; ontology preserved) |
| invariant_preservation | `0` | `0` (all IAS boundaries held; audit boundary added) |
| constructive_executability | `0` | **`+1` scoped** (four live seams attached to kernel spine) |
| grounded_universalization | `0` | `0` (mailbox-like synthetic case; no claim of live Graph completeness) |
| authority_reviewability | `0` | `0` (operator mutations are audited; review is load-bearing) |
| teleological_pressure | `0` | `0` (pressure on useful live operation, not production overclaim) |

**Verdict: `constructive_executability` for the Cloudflare Site moved from `0` to `+1` scoped.**

This is a scoped `+1`, not a universal claim. The live seams are architecturally real and tested, but their external boundaries (Graph API, OpenAI/Kimi) are mocked. Production readiness requires credentialing, egress policy, and operational validation that remain deferred.

---

## Residuals

1. **Real Microsoft Graph sync** — `HttpSourceAdapter` is generic HTTP. A Graph-specific adapter with delta pagination, token refresh, and rate-limit handling is deferred.
2. **Real charter runtime with live API** — `MockCharterRunner` simulates output. Real OpenAI/Kimi calls with knowledge injection and prompt materialization are deferred.
3. **Real effect execution** — Outbound commands are SQLite rows. No Graph draft creation, no email send. Effect execution remains explicitly out of scope.
4. **Real Graph reconciliation** — `GraphObservationClient` is mocked. Real Graph API polling for sent-item confirmation is deferred.
5. **Webhook ingestion** — Webhook-to-DO ingress for real-time sync not implemented.
6. **Cron Trigger wiring** — `runCycle` is test-invoked. Scheduled production cycles require Cron Trigger configuration.
7. **DO RPC via `fetch()`** — Tests call DO methods directly. Production Worker → DO boundary must use `fetch()` RPC.
8. **Multi-Site support** — `site_id`/`scope_id` conflation exists for v0 single-Site setups.
9. **Transaction wrapping** — `insertFact` + `markEventApplied` are separate SQL exec calls. Full atomicity is a future enhancement.

---

## Recommended Next Work

1. **Cloudflare Site v1 — Effect Execution Chapter** (highest pressure)
   - Real Graph draft creation from `approved_for_send` outbounds
   - Send worker that executes `send_reply` via Graph API
   - Two-stage completion: `submitted` → `confirmed` via live reconciliation
   - This is the natural next step because operator approval (Task 355) currently has nothing to execute

2. **Cloudflare Site v1 — Live Source Sync**
   - Graph-specific source adapter with delta token pagination
   - Token refresh and rate-limit handling
   - Webhook ingress as alternative to polling

3. **Cloudflare Site v1 — Real Charter Runtime**
   - Codex API or Kimi API calls inside Sandbox with real credentials
   - Tool catalog binding and execution
   - Knowledge injection and prompt materialization

4. **Infrastructure Hardening**
   - Cron Trigger wiring for scheduled cycles
   - DO RPC via `fetch()` for production safety
   - Egress policy and secret binding validation

---

## Closure Checklist

- [x] Closure decision exists.
- [x] Tasks 351–356 are assessed.
- [x] Live/fixture/blocked seams are tabulated.
- [x] No-overclaim review is explicit.
- [x] CCC posture movement is scoped and evidenced.
- [x] Changelog/docs updated.
- [x] No derivative task-status files created.
