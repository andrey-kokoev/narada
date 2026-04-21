# Decision: Unattended Operation Implementation Chapter Closure

**Date:** 2026-04-21  
**Chapter:** Tasks 340–344  
**Verdict:** **Closed — accepted.**

---

## Summary

The unattended operation implementation chapter moved Narada's unattended layer from design (`docs/product/unattended-operation-layer.md`) to executable behavior. Health decay is wired in both the local daemon and the Cloudflare Site substrate; stuck-cycle recovery and operator notification emission are implemented and fixture-proven on Cloudflare. Authority boundaries remain intact.

---

## Task-by-Task Assessment

### Task 340 — Health Decay Wiring

**Delivered:**
- Pure `computeHealthTransition(previousStatus, previousConsecutiveFailures, outcome)` helper in `packages/layers/control-plane/src/health.ts` (canonical) and `packages/sites/cloudflare/src/health-transition.ts` (local mirror).
- Local daemon `service.ts` wires transitions into `runSingleSync`: success resets to `healthy`, failure degrades to `degraded`/`critical`, auth failure sets `auth_failed`.
- Cloudflare runner uses the same transition rules for lock contention, success, and catch-block failure paths.

**Tests:** 17 control-plane health tests, 8 Cloudflare health-transition tests. All pass.

**Docs:** No changes needed — behavior matches `docs/product/unattended-operation-layer.md` §3.

**Residuals:** None.

**Boundary concerns:** None. Health is advisory; `computeHealthTransition` has zero side effects. Daemon health update path only touches `currentHealthStatus` and `stats.consecutiveErrors`.

### Task 341 — Stuck-Cycle Recovery

**Delivered:**
- Cloudflare DO `site_locks` table extended with TTL-based expiry and atomic steal.
- `CycleCoordinator.acquireLock` returns `{ acquired, previousCycleId?, recovered?, stuckDurationMs? }`.
- `recordRecoveryTrace()` persists `RecoveryTraceRecord` to `cycle_recovery_traces` table.
- Runner sets health to `critical` on recovery and continues the cycle.

**Tests:** Site-coordinator tests for expired lock recovery and trace persistence; runner tests for recovery trace recording and lock release. All pass.

**Docs:** No changes needed — behavior matches `docs/product/unattended-operation-layer.md` §2.

**Residuals:** Local daemon does not implement cycle-level stuck-lock recovery (Task 341 explicitly scoped this to Cloudflare because the local daemon already has `FileLock` for sync-level locking and `recoverStaleLeases()` for work-item lease recovery). If local unattended operation becomes a priority, a lightweight `site_locks` equivalent could be added to the coordinator DB without changing Scheduler/Foreman logic.

**Boundary concerns:** None. Recovery is mechanical lock steal only. No work-item failure classification occurs.

### Task 342 — Operator Notification Emission

**Delivered:**
- `OperatorNotification` envelope with site/scope id, severity, health status, summary, detail, suggested action, occurred at, cooldown until.
- `LogNotificationAdapter` (structured JSON to `console.warn`) as zero-config default.
- `DefaultNotificationEmitter` coordinates multiple adapters with rate-limiting via `NotificationRateLimiter` interface.
- `NullNotificationEmitter` for tests and disabled mode.
- Wired in Cloudflare runner for critical transition, auth_failed transition, and stuck-cycle recovery.

**Tests:** 6 focused tests covering emission, suppression, adapter failure, and multi-adapter continuity. All pass.

**Docs:** No changes needed — behavior matches `docs/product/unattended-operation-layer.md` §4.

**Residuals:** Daemon does not emit operator notifications (it computes health transitions but has no notification wiring). This is acceptable for the current scope because the unattended layer's most concrete substrate is Cloudflare. If local unattended operation becomes a priority, a daemon notification path using the same envelope and adapter pattern could be added.

**Boundary concerns:** None. Notifications are wrapped in `try/catch` in the runner; failure does not influence cycle success. No notification success is prerequisite for any control decision.

### Task 343 — Unattended Recovery Fixture

**Delivered:**
- `packages/sites/cloudflare/test/unit/unattended-recovery.test.ts` with two narrative fixtures:
  1. Failure decay → critical notification → success resets health.
  2. Stuck lock recovery → notification + trace → success.

**Tests:** 2/2 pass.

**Docs:** Fixture comments document authority boundary invariants.

**Residuals:** None.

**Boundary concerns:** None. The fixture explicitly notes that the Cloudflare runner does not interact with Foreman, Scheduler, or outbound stores.

---

## Authority Boundary Review

| Boundary | Status | Evidence |
|----------|--------|----------|
| Health remains advisory | ✅ | `computeHealthTransition` is pure. Removing it leaves all durable boundaries intact. Daemon and Cloudflare health writes are side-effect-only observations. |
| Notifications remain advisory | ✅ | `try/catch` around every `emit`. No control decision depends on notification delivery. |
| Stuck-cycle recovery is mechanical | ✅ | Only steals expired cycle locks. Does not open, classify, or mutate work items. |
| Foreman authority unchanged | ✅ | No `work_item` inserts, no `foreman_decision` mutations, no `evaluation` resolution outside `DefaultForemanFacade`. |
| Scheduler authority unchanged | ✅ | No lease inserts/releases. No `execution_attempt` state mutations. |
| Outbound authority unchanged | ✅ | No `outbound_command` / `outbound_handoff` mutations. No managed draft creation. |
| Observation read-only | ✅ | No writes in observation paths. Health and traces are written by runner/worker code, not observation queries. |

---

## Constructive Executability Assessment

The chapter's target was to move `constructive_executability` from `-1` to `0` for the Cloudflare mechanical unattended layer. The local daemon received health decay wiring; stuck-cycle recovery and notifications remain Cloudflare-scoped.

| Coordinate | Before | After |
|------------|--------|-------|
| semantic_resolution | `0` | `0` (no new semantics introduced) |
| invariant_preservation | `0` | `0` (all invariants held) |
| constructive_executability | `-1` | `0` (health decay, stuck recovery, and notification are now executable and fixture-proven) |
| grounded_universalization | `0` | `0` (no Runtime Locus abstraction introduced) |
| authority_reviewability | `+1` | `0` (review is now load-bearing over fixture evidence) |
| teleological_pressure | `0` | `0` (pressure moved from design to executable behavior) |

**Verdict: Pressure relieved.** The unattended layer is no longer a design document; it is executable, tested, and bounded.

---

## Residuals

1. **Daemon notification wiring** — The local daemon computes health transitions but does not emit operator notifications. Acceptable for current scope; Cloudflare is the primary unattended substrate.
2. **Daemon stuck-cycle recovery** — The local daemon has sync-level `FileLock` and scheduler lease recovery, but no site-level cycle lock with TTL-based stuck recovery. Acceptable; Task 341 explicitly scoped to Cloudflare.
3. **Webhook adapter** — Only `LogNotificationAdapter` exists. Webhook/email/SMS adapters are future work.
4. **Real Narada kernel in Cloudflare runner** — Steps 2–6 of the Cloudflare Cycle runner remain placeholder no-ops (real sync, evaluate, govern, handoff, reconcile are deferred to v1). This was not in scope for the unattended layer chapter.

---

## Recommended Next Work

1. **Cloudflare Site v1** — Replace placeholder Cycle steps with real Narada kernel logic (sync, evaluate, govern, handoff, reconcile) inside the Cloudflare Sandbox. This is the natural continuation after the unattended mechanical layer is proven.
2. **Local daemon notification wiring** — If local unattended operation becomes a priority, wire `DefaultNotificationEmitter` into `daemon/src/service.ts` using the same envelope and adapter pattern.
3. **Additional notification adapters** — Webhook, email, or OS notification adapters can be added without changing the envelope or emitter logic.

---

## Closure Checklist

- [x] Closure decision exists.
- [x] Tasks 340–343 are assessed.
- [x] Authority boundary review is explicit.
- [x] Fixture proof is assessed.
- [x] `CHANGELOG.md` updated.
- [x] No derivative task-status files created.
