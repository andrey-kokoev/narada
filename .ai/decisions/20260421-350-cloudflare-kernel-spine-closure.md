# Decision: Cloudflare Kernel Spine Port Chapter Closure

**Date:** 2026-04-21  
**Chapter:** Tasks 345–350  
**Verdict:** **Closed — accepted.**

---

## Summary

The Cloudflare Kernel Spine Port chapter replaced the Cycle runner's placeholder steps 2–6 with a bounded, fixture-backed Narada kernel spine. The spine proves that a Cloudflare Site can execute the shape of Narada's governed-control grammar — delta admission, context formation, work opening, evaluation, decision, intent handoff, and confirmation — without live Graph access, real charter runtime, or effect execution.

**Honest scope:** This is a structural kernel-spine proof, not production readiness. All kernel behavior is fixture-backed. Live source sync, real charter runtime, tool execution, and production send remain deferred.

---

## Task-by-Task Assessment

### Task 345 — Cycle Step Contract

**Delivered:**
- Typed step contract (`CycleStepId`, `CycleStepName`, `CycleStepResult`, `CycleStepContext`, `CycleStepHandler`) in `packages/sites/cloudflare/src/cycle-step.ts`.
- `runCycle` refactored to invoke steps 2–6 through handlers rather than bare `stepsCompleted.push`.
- `stepHandlers` parameter for test injection.
- `stepResults` included in `CycleResult` and `CycleTraceRecord`.

**Tests:** 5 tests covering order, skip, failure, trace evidence. All pass.

**Residuals:** None.

**Boundary concerns:** None. Lock/health/notification behavior preserved.

### Task 346 — Delta/Facts Persistence Step

**Delivered:**
- DO schema extended with `source_cursors`, `apply_log`, `facts` tables.
- `CycleCoordinator` interface extended with fact/cursor/apply-log methods.
- `createSyncStepHandler(deltas)` factory deduplicates by event ID, persists facts, updates cursor.

**Tests:** 6 tests covering persistence, idempotency, cursor update, downstream visibility. All pass.

**Residuals:** Live Graph sync and webhook ingestion deferred to v1.

**Boundary concerns:** None. Facts are admitted but do not open work directly.

### Task 347 — Governance Spine Step

**Delivered:**
- DO schema extended with `context_records`, `work_items`, `evaluations`, `decisions`, `outbound_commands` tables.
- `evaluation_id` added to `decisions` for explicit IAS linkage.
- `fixtureEvaluate` — pure deterministic evaluator with zero side effects.
- `createDeriveWorkStepHandler` — creates contexts/work items from unadmitted facts.
- `createEvaluateStepHandler` — persists evaluation records for open work items.
- `createHandoffStepHandler` — creates decisions and outbound commands.

**Tests:** 12 tests covering derivation, evaluation, handoff, and IAS boundary preservation. All pass.

**Residuals:** Real Kimi/OpenAI charter runtime, tool execution, and email send deferred to v1.

**Boundary concerns:** None. Evaluation, decision, and intent are separately persisted and queryable.

### Task 348 — Confirmation/Reconciliation Step

**Delivered:**
- DO schema extended with `fixture_observations` table.
- `createReconcileStepHandler(observations)` — confirms outbound commands only against externally-provided observations.
- Self-confirmation is structurally impossible: observations are input, not generated.

**Tests:** 6 tests covering confirmation, missing observation, failed observation, partial confirmation, self-confirmation impossibility. All pass.

**Residuals:** Live reconciliation against Graph API or webhook observation deferred to v1.

**Boundary concerns:** None. Confirmation requires separate observation.

### Task 349 — Kernel Spine Fixture

**Delivered:**
- End-to-end fixture through `runCycle()` with real SQLite-backed coordinator.
- Two-cycle pattern: first cycle creates pipeline, second cycle reconciles with actual observation.
- IAS boundary assertions: facts ≠ context/work, evaluation ≠ decision, decision ≠ intent/handoff, confirmation requires observation, trace/health are advisory.

**Tests:** 6 tests. All pass.

**Residuals:** None.

**Boundary concerns:** None.

---

## No-Overclaim Verification

| Claim | Status | Evidence |
|-------|--------|----------|
| Live Graph sync | ❌ Not claimed | All deltas are fixture-provided `FixtureSourceDelta[]`. No Graph API calls. |
| Production Cloudflare readiness | ❌ Not claimed | Fixture-backed only. No Cron Trigger wiring, no production deploy. |
| Real charter runtime in Sandbox | ❌ Not claimed | `fixtureEvaluate` is pure function. No OpenAI/Kimi calls. No Sandbox tool execution. |
| Real email draft/send | ❌ Not claimed | Outbound commands are SQLite rows with `status: "pending"`. No Graph draft creation. |
| Generic Runtime Locus abstraction | ❌ Not claimed | No abstraction layer. Cloudflare-specific types and handlers. |

---

## Authority Boundary Review

| Boundary | Status | Evidence |
|----------|--------|----------|
| Facts are durable boundary | ✅ | `facts` table with `admitted` flag. `apply_log` for idempotency. |
| Context/work is separate from facts | ✅ | `context_records` and `work_items` tables created by derive_work step. |
| Evaluation is separate from decision | ✅ | `evaluations` and `decisions` are separate tables. `decisions.evaluation_id` links them. |
| Decision is separate from intent/handoff | ✅ | `decisions` and `outbound_commands` are separate tables. Decision creates outbound. |
| Confirmation requires observation | ✅ | `createReconcileStepHandler` receives `FixtureObservation[]` as input. Cannot self-confirm. |
| Trace/health are advisory | ✅ | `cycle_traces` and `site_health` are observation-only. Removing them leaves durable boundaries intact. |

---

## CCC Posture Assessment

The chapter's target was to move `constructive_executability` from `-1` to `0` for the Cloudflare fixture-backed kernel spine.

| Coordinate | Before | After |
|------------|--------|-------|
| semantic_resolution | `0` | `0` (no new semantics; existing ontology preserved) |
| invariant_preservation | `0` | `0` (all IAS boundaries held) |
| constructive_executability | `-1` | `0` (steps 2–6 perform real fixture-backed kernel work instead of no-op step counting) |
| grounded_universalization | `0` | `0` (fixture-backed mailbox-like synthetic case; no claim of live Graph completeness) |
| authority_reviewability | `0` | `0` (review is load-bearing over fixture evidence) |
| teleological_pressure | `0` | `0` (pressure moved from design to executable kernel behavior) |

**Verdict: `constructive_executability` for the Cloudflare fixture-backed kernel spine moved from `-1` to `0`.** No broader posture movement is claimed.

---

## Residuals

1. **Live source sync** — `createSyncStepHandler` admits fixture deltas. Real Microsoft Graph sync and webhook ingestion are deferred.
2. **Real charter runtime** — `fixtureEvaluate` is a pure synthetic function. Running actual charter evaluation with tool catalog inside the Cloudflare Sandbox is deferred.
3. **Real effect execution** — Outbound commands are SQLite rows. No Graph draft creation, no email send.
4. **Live reconciliation** — Confirmation uses fixture observations. Real-world observation (Graph API polling, webhook callbacks) is deferred.
5. **Cron Trigger wiring** — The runner is invoked via `runCycle()`. Cron Trigger scheduling is not implemented.
6. **DO RPC via `fetch()`** — Tests call DO methods directly. Production Worker → DO boundary must use `fetch()` RPC.
7. **Multi-Site support** — One Site per Worker for v0. Shared Worker pool is deferred.
8. **Operator mutations** — Read-only operator surface. Approve/reject/retry via endpoint is deferred.

---

## Recommended Next Work

1. **Cloudflare Site v1** — Replace fixture-backed handlers with live behavior:
   - Step 2: Live Graph sync via `@microsoft/microsoft-graph-client` or direct REST
   - Step 4: Real charter runtime in Cloudflare Sandbox with tool catalog
   - Step 5: Real foreman governance with policy enforcement
   - Step 6: Live reconciliation via Graph API polling or webhook callbacks
2. **Cron Trigger wiring** — Schedule `runCycle` via Cloudflare Cron Triggers
3. **DO RPC via `fetch()`** — Replace direct method calls with DO `fetch()` RPC for production safety
4. **Operator mutations** — Add `POST` endpoints for approve/reject/retry actions

---

## Closure Checklist

- [x] Closure decision exists.
- [x] Tasks 345–349 are assessed.
- [x] IAS boundary review is explicit.
- [x] No-overclaim verification is explicit.
- [x] CCC posture movement is scoped and evidenced.
- [x] Changelog/docs updated.
- [x] No derivative task-status files created.
