# Unattended Operation Layer

> Design spec for safe, self-governing Narada Sites that advance Aims through bounded Cycles without constant operator babysitting.
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## 1. Unattended Operation Semantics

An unattended Narada Site advances its Aim through bounded Cycles without requiring a human operator to supervise every step. The operator remains the ultimate authority, but their attention is **pulled by exception** rather than **pushed by routine**.

Five properties define unattended safety:

| Property | Meaning |
|----------|---------|
| **Graceful degradation** | If a Cycle fails, the Site records the failure, releases the lock, and schedules the next Cycle. No cascading crash. |
| **Stuck-cycle detection** | If a Cycle acquires the lock but never releases it (crash, infinite loop, Worker eviction), a later Cycle detects the stale lock and recovers. |
| **Health decay** | Consecutive failures degrade health status and eventually alert the operator. |
| **Operator notification** | When a Site needs human attention (terminal failure, auth expiry, repeated sync errors), the operator is notified via a channel they control. |
| **Restart safety** | Restarting the local daemon or redeploying the Cloudflare Worker must not corrupt durable state. |

### 1.1 Graceful Degradation

A Cycle is a bounded 8-step pipeline:

```
acquire lock → sync → derive work → evaluate → handoff → reconcile → health/trace → release lock
```

If any step throws or returns a terminal error:

1. The runner catches the error at the next safe boundary.
2. The Site writes a failure Trace (`cycle_trace` record with `status: "failed"`, `error`, and `steps_completed`).
3. The lock is released (or allowed to expire) so the next Cycle can begin.
4. The health record increments `consecutive_failures`.
5. The Cycle ends. No retry loop blocks the runner.

Transient source errors (5xx, timeout) are retried with exponential backoff **inside** the sync step, but a sync step that exhausts its retry budget is treated as a Cycle failure.

### 1.2 Stuck-Cycle Detection

A Cycle that crashes between lock acquisition and lock release leaves the Site coordination lock held. Without detection, no future Cycle can ever acquire the lock.

The unattended layer treats lock TTL expiry as a first-class failure mode. See §2 for the full recovery protocol.

### 1.3 Health Decay

Health status is an **advisory signal** (see [`SEMANTICS.md §2.12`](../../SEMANTICS.md)) that influences operator attention. It is non-authoritative: removing health decay logic must leave all durable boundaries intact.

Consecutive Cycle failures degrade the `site_health.status` field:

- `healthy` → `degraded` after the first failure.
- `degraded` → `critical` after the third consecutive failure.
- A stuck-cycle recovery immediately transitions to `critical`.
- An auth failure (401/403 from Graph API or other source) transitions directly to `auth_failed`.

Recovery is automatic: one fully successful Cycle resets `consecutive_failures` to 0 and transitions status back to `healthy`.

### 1.4 Operator Notification

Notification is an advisory side effect, not a control dependency. The Cycle proceeds regardless of whether the notification channel is reachable.

Notifications are emitted when:

- Health status transitions to `critical`.
- Health status transitions to `auth_failed`.
- A stuck cycle is recovered.

See §4 for the notification surface design.

### 1.5 Restart Safety

Durable state (cursor, apply-log, health record, lock timestamp) is never held only in memory.

- **Local daemon restart**: The new process reads health and cursor from the filesystem. It does not attempt to resurrect the previous Cycle. The next scheduled Cycle detects any stale lock via TTL comparison and recovers normally.
- **Cloudflare Worker redeploy**: Platform termination of in-flight Workers may leave a DO lock unreleased. The next Cron Trigger fires a new Worker, which contacts the DO. The DO detects the stale lock via `expires_at` comparison and recovers.

No special "restart recovery" code path is required. The stuck-cycle protocol (§2) handles all restart and redeploy scenarios.

---

## 2. Stuck-Cycle Recovery Protocol

### 2.1 Problem

A Cycle that crashes, is evicted, or exceeds its wall-clock ceiling after acquiring the lock but before releasing it leaves the Site permanently locked. The lock owner is gone and will never release it.

### 2.2 Protocol

Every Cycle begins by attempting to acquire the Site coordination lock with a **TTL** (time-to-live).

```
1. New Cycle begins.
2. Attempt to acquire lock with TTL = lockTtlMs (e.g. 35 000 ms).
3. If lock is free:
   → Acquire succeeds. Record lock_acquired_at, cycle_id. Run Cycle.
4. If lock is held:
   → Read lock timestamp and/or expires_at.
   → If now < timestamp + TTL:
      → Another Cycle is legitimately active. Fail fast with "lock held".
      → Record a lock-contention Trace. Increment consecutive_failures.
   → If now >= timestamp + TTL:
      → Lock is stale. The previous Cycle is stuck.
      → Record stuck-cycle Trace (previous_cycle_id, stuck_duration_ms).
      → Atomically steal the lock: UPDATE with new cycle_id and fresh timestamp.
      → Proceed with the new Cycle.
5. At Cycle end, release the lock (or let it expire naturally on hard failure).
```

### 2.3 Trace Record for Stuck-Cycle Recovery

When a stuck lock is recovered, the Site writes a Trace:

```json
{
  "cycle_id": "cycle_abc123",
  "event": "stuck_cycle_recovered",
  "previous_cycle_id": "cycle_def456",
  "lock_ttl_ms": 35000,
  "stuck_duration_ms": 42000,
  "recovered_at": "2026-04-20T15:41:00Z"
}
```

This Trace is appended to the Site's `cycle_traces` table / collection. It is non-authoritative for control logic but essential for operator debugging.

### 2.4 Substrate Mapping

The protocol is substrate-agnostic. Only the lock-storage implementation differs.

| Substrate | Lock Mechanism | TTL Enforcement | Steal Signal |
|-----------|---------------|-----------------|--------------|
| **Local SQLite** | `site_locks` row in coordinator DB: `cycle_id`, `lock_acquired_at`, `expires_at` | Wall-clock comparison against `expires_at` | `UPDATE site_locks SET cycle_id = ?, lock_acquired_at = ?, expires_at = ? WHERE site_id = ?` |
| **Cloudflare DO** | `site_locks` table in DO SQLite with `expires_at` | Wall-clock comparison against `expires_at` | Same atomic `UPDATE` pattern inside DO transaction |

Both substrates must ensure that lock steal is atomic with respect to other concurrent stealers. On SQLite this is guaranteed by the single writer. On Cloudflare DO this is guaranteed by the DO's single-threaded request handling.

---

## 3. Health Alerting Thresholds

### 3.1 Health Status Transitions

A Site maintains one health record per `scope_id`. The record transitions based on Cycle outcomes.

| Condition | Health Status | Operator Action |
|-----------|---------------|-----------------|
| 0 consecutive failures, all steps complete | `healthy` | None |
| 1–2 consecutive failures, partial steps | `degraded` | Review at next scheduled check |
| 3+ consecutive failures or stuck cycle | `critical` | Alert operator immediately |
| Auth failure (401 from Graph API or other source) | `auth_failed` | Alert operator; do not retry until auth fixed |

### 3.2 State Machine

```
        +-----------+
        |  healthy  |
        +-----------+
              |
    +---------+---------+
    | failure           | success
    v                   v
+-----------+     +-----------+
| degraded  | --> |  healthy  |
+-----------+     +-----------+
    |
    | 3rd failure
    v
+-----------+
| critical  | --> alert operator
+-----------+
    |
    | auth failure (401/403)
    v
+-----------+
|auth_failed| --> alert operator; pause sync
+-----------+
```

### 3.3 Health Record Schema

```typescript
interface SiteHealthRecord {
  site_id: string;
  scope_id: string;
  status: "healthy" | "degraded" | "critical" | "auth_failed";
  last_cycle_at: string;           // ISO timestamp
  last_cycle_duration_ms: number;
  consecutive_failures: number;
  message: string;
  updated_at: string;
}
```

The `site_health` table is updated at the end of every Cycle (step 7 of the pipeline). It is an advisory observation artifact, not an authoritative control boundary. Work items, leases, and cursor state remain the source of truth for runtime decisions.

### 3.4 Recovery Path

When an operator addresses the root cause:

1. Operator fixes the issue (e.g., refreshes auth token, resolves source error).
2. The next successful Cycle automatically transitions health back to `healthy` and resets `consecutive_failures` to 0.
3. No manual health reset is required.

---

## 4. Notification Surface Design

### 4.1 Design Principles

| Principle | Requirement |
|-----------|-------------|
| **Pluggable** | Email, Slack, webhook, or local OS notification. The operator chooses their channel per Site. |
| **Rate-limited** | A Site may emit at most one alert per notification channel per `cooldown_minutes` (default: 15). Bursting failures do not spam the operator. |
| **Actionable** | Every notification includes: Site ID, scope ID, health status, failure reason, and a link or CLI command to resolve. |
| **Non-blocking** | Notification failure does not stop the Cycle. The notification is a side effect, not a dependency. |

### 4.2 Notification Envelope

```typescript
interface OperatorNotification {
  site_id: string;
  scope_id: string;
  severity: "warning" | "critical";
  health_status: "degraded" | "critical" | "auth_failed";
  summary: string;              // Human-readable one-liner
  detail: string;               // Multi-line explanation
  suggested_action: string;     // CLI command or URL
  occurred_at: string;          // ISO timestamp
  cooldown_until: string;       // ISO timestamp; no further alerts until this time
}
```

### 4.3 v0 Notification Adapter

For the initial unattended layer, a simple **webhook** or **structured-log** adapter is sufficient.

**Webhook adapter:**

```json
{
  "adapter": "webhook",
  "config": {
    "url": "https://hooks.slack.com/services/...",
    "method": "POST",
    "headers": { "Content-Type": "application/json" }
  }
}
```

**Log adapter (fallback):**

```json
{
  "adapter": "log",
  "config": {
    "level": "warn"
  }
}
```

The log adapter writes the `OperatorNotification` envelope as a structured JSON log line. It is the zero-config default and ensures the unattended layer works even when no external channel is configured.

Future adapters (email, SMS, PagerDuty) follow the same envelope shape.

### 4.4 Rate-Limiting Logic

```
Before emitting a notification:
  1. Look up last_notification_at for (site_id, scope_id, channel).
  2. If now < last_notification_at + cooldown_minutes:
     → Drop the notification. Log a suppression Trace.
  3. Otherwise:
     → Emit notification.
     → Update last_notification_at.
```

The cooldown is **per channel**, not global. A critical alert to Slack and a critical alert to a webhook are independent.

Suppressed notifications are recorded as Traces so the operator can see that alerting was throttled:

```json
{
  "event": "notification_suppressed",
  "site_id": "site_abc",
  "scope_id": "scope_help",
  "channel": "webhook",
  "reason": "cooldown_active",
  "cooldown_until": "2026-04-20T16:00:00Z"
}
```

---

## 5. Restart Safety

### 5.1 Local Daemon Restart

When the local daemon restarts:

1. It reads the health file and cursor from durable storage (filesystem).
2. It does **not** attempt to recover in-flight Cycles. Cycles are process-local; a restart means the previous Cycle is gone.
3. The next scheduled Cycle will detect any stale lock (via TTL comparison) and recover normally.
4. No special "restart recovery" code path is needed.

### 5.2 Cloudflare Worker Redeploy

When the Cloudflare Worker is redeployed:

1. In-flight Workers are terminated by the platform. Any unreleased DO lock is left behind.
2. The next Cron Trigger fires a new Worker, which contacts the DO.
3. The DO detects the stale lock (via `expires_at` comparison) and recovers.
4. No special "deploy recovery" code path is needed.

### 5.3 Invariant

> Durable state (cursor, apply-log, health record, lock timestamp) is never held only in memory. A restart or redeploy can only lose ephemeral progress, not corrupt durable boundaries.

---

## 6. Failure Mode Matrix

| Failure | Detection | Automatic Response | Operator Alert |
|---------|-----------|-------------------|----------------|
| Cycle throws exception | `try/catch` around runner | Release lock, record failure Trace, increment `consecutive_failures` | Yes, if 3+ consecutive or critical |
| Cycle exceeds wall-clock ceiling | Deadline check inside runner | Graceful abort at next safe boundary, release lock, record partial Trace | Yes, if partial becomes pattern |
| Stuck lock (crash, eviction) | TTL comparison on next lock acquisition | Steal lock, record stuck-cycle Trace | Yes, immediately |
| Source auth failure (401/403) | HTTP status from source adapter | Abort sync, set `auth_failed`, do not retry sync | Yes, immediately |
| Source transient error (5xx, timeout) | HTTP status / timeout | Retry with backoff inside sync step; counts as failure if exhausted | Yes, after 3 consecutive |
| Charter runtime error | Try/catch around charter invocation | Mark execution attempt failed, release lease | No (single failure); yes if pattern |
| Notification channel failure | Try/catch around notification emit | Log suppression Trace, continue Cycle | No (notification is advisory) |
| Lock contention (legitimate) | TTL not yet expired on acquisition | Fail fast, record contention Trace, increment failures | No (single contention); yes if pattern |

---

## 7. Relation to Existing Concepts

### 7.1 Operator Loop

The unattended layer does not replace the operator loop. It changes the **frequency** and **urgency** of operator attention:

| Mode | Operator Attention | Trigger |
|------|-------------------|---------|
| **Attended (today)** | Every few hours | Manual `narada ops` check |
| **Unattended (target)** | When alerted | Exception: `critical`, `auth_failed`, or stuck cycle |

The operator loop commands (`narada ops`, `narada doctor`, `narada status`) remain the primary inspection surface. The unattended layer ensures that when the operator does check, the system has already survived its own failures.

### 7.2 Authority Boundaries

The unattended layer respects existing authority boundaries:

- **Foreman** owns work opening and governance. The unattended layer does not open work items or create decisions.
- **Scheduler** owns leases and mechanical lifecycle. The unattended layer does not claim or release work-item leases.
- **Outbound workers** own mutation. The unattended layer does not create or mutate outbound commands.
- **Observation** is read-only. Health records and Traces are advisory signals, not authoritative control state.

### 7.3 Advisory Signals

Health status, notifications, and `consecutive_failures` are advisory signals per [`SEMANTICS.md §2.12`](../../SEMANTICS.md). Removing the entire unattended layer must leave all durable boundaries intact and all authority invariants satisfiable. The kernel can still run attended without health decay or notifications.

---

## 8. Non-Goals

- No metrics platform or dashboards (use existing observation API).
- No auto-remediation without human oversight (e.g., no automatic auth token refresh).
- No public alerting service.
- No derivative task-status files.
- No modification of the core kernel pipeline (sync → fact → context → work → policy → intent → execution → confirmation). The unattended layer wraps the pipeline, it does not alter it.

---

## Related Documents

- [`docs/product/operator-loop.md`](operator-loop.md) — The minimal operator rhythm
- [`docs/deployment/cloudflare-site-materialization.md`](../deployment/cloudflare-site-materialization.md) — Cloudflare Site design
- [`SEMANTICS.md §2.14`](../../SEMANTICS.md) — Aim / Site / Cycle / Act / Trace definitions
- [`SEMANTICS.md §2.12`](../../SEMANTICS.md) — Advisory signals clan
- [`AGENTS.md`](../../AGENTS.md) — Agent navigation hub and critical invariants
