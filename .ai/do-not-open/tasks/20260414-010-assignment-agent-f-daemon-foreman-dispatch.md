# Assignment — Agent F — Daemon-Foreman Dispatch

## Role

You are the daemon/runtime integration engineer.

Your job is to define how the long-running daemon hands off from deterministic mailbox sync to control-plane work scheduling until quiescence.

## Scope

Primary target:
- `.ai/do-not-open/tasks/20260414-010-assignment-agent-f-daemon-foreman-dispatch.md`

Read first:
- `.ai/do-not-open/tasks/20260414-002-foreman-core-ontology-and-control-algebra.md`
- `.ai/do-not-open/tasks/20260414-003-identity-lattice-and-canonical-keys.md`
- `.ai/do-not-open/tasks/20260414-004-coordinator-durable-state-v2.md`
- `.ai/do-not-open/tasks/20260413-007-foreman-and-charters-architecture.md`
- `packages/exchange-fs-sync-daemon/src/index.ts`
- `packages/exchange-fs-sync-daemon/src/service.ts`

## Mission

Produce the implementation-ready contract for daemon-triggered control-plane dispatch after mailbox sync.

## Core Invariants

1. Daemon remains the long-running wake/sync substrate.
2. Daemon does not become reasoning authority.
3. Sync completion must lead to opening/superseding work, not directly to mailbox actions.
4. Duplicate wake paths must be safe.
5. Quiescence must be explicit.

---

## Task 1 — Sync-to-Control Boundary

### What the daemon emits after sync

After a successful sync cycle, the daemon emits a **SyncCompletionSignal** to the foreman. The signal contains the minimal set of changed conversation identities observed during the cycle.

```typescript
interface SyncCompletionSignal {
  signal_id: string;              // sn_<uuid> correlation token
  mailbox_id: string;
  synced_at: string;              // ISO 8601
  changed_conversations: ChangedConversation[];
}

interface ChangedConversation {
  conversation_id: string;
  previous_revision_ordinal: number | null;
  current_revision_ordinal: number;
  change_kinds: ("new_message" | "moved" | "flagged" | "draft_observed" | "participant_change")[];
}
```

### What the daemon does NOT do

- The daemon **does not** create `work_item` rows directly.
- The daemon **does not** decide which charters to invoke.
- The daemon **does not** read charter outputs or traces to determine what to do next.
- The daemon **does not** emit outbound commands or call the outbound worker.

### Why changed conversations and not raw revisions

`conversation_revision` is a derived compiler observation. The daemon’s job is to tell the foreman *which conversations changed* so the foreman can decide whether to open work. Passing full revision snapshots would leak compiler internals into the daemon and create unnecessary coupling.

### Why not a durable queue signal

The compiler already writes durable message state to the filesystem. The coordinator database already holds `work_item` and `conversation` state. Adding a third durable queue between daemon and foreman would introduce a new failure mode without adding authority separation. The signal is an **in-memory handoff** within the daemon process; if the daemon crashes before the foreman processes it, the next sync cycle will regenerate the same observation.

---

## Task 2 — Work Opening / Supersession

### Foreman responsibility

The foreman receives the `SyncCompletionSignal` and decides, for each `ChangedConversation`, whether to:

1. **Open a new work item**
2. **Supersede an existing work item**
3. **No-op**

### New work item open

The foreman opens a new `work_item` when **all** of the following are true:
- The conversation has no `opened` or `leased` work item.
- The conversation has no `executing` work item that is expected to complete soon.
- The change kinds are relevant to the mailbox’s attached charters (e.g., `new_message` on a support mailbox always triggers triage).

### Work item supersession

The foreman supersedes an existing work item when:
- A newer revision arrives (`current_revision_ordinal > previous_revision_ordinal`).
- The existing work item is still `opened` or `leased`.
- The new revision materially changes the thread context (e.g., a new inbound message arrives while a draft reply is being planned).

**Supersession rule:** The old work item transitions to `superseded`. A new work item is opened against the latest revision. The old work item must not produce an outbound command after supersession.

### No-op

The foreman no-ops when:
- The conversation already has an `opened` or `leased` work item for a revision ≥ the current one.
- The change is irrelevant to configured charters (e.g., a silent move between synced folders with no new messages).
- The thread is in a terminal coordinator state (e.g., `closed` and policy says do not reopen).

### Daemon visibility

The daemon may log how many work items were opened or superseded, but it does not participate in the decision.

---

## Task 3 — Dispatch Loop

After a successful sync cycle, the daemon enters a **control dispatch phase** that runs until the control plane is quiescent for this mailbox.

### Phase sequence

```
sync_success
    │
    ▼
signal_foreman(changed_conversations)
    │
    ▼
foreman opens / supersedes work items
    │
    ▼
scheduler.scan_for_runnable_work()
    │
    ├──▶ no runnable work
    │       │
    │       ▼
    │   quiescent → sleep until next wake
    │
    └──▶ runnable work found
            │
            ▼
    lease_work_item(work_item_id)
            │
            ▼
    dispatch_execution_attempt(work_item_id, execution_id)
            │
            ▼
    wait for attempt completion (or lease expiry)
            │
            ▼
    repeat from scheduler.scan_for_runnable_work()
```

### Quiescence definition

A mailbox is **quiescent** when all of the following hold:
1. No `opened` work items exist for the mailbox.
2. No `leased` or `executing` work items exist for the mailbox.
3. The most recent sync cycle produced no new `ChangedConversation` signals that the foreman has not yet processed.
4. No retry timers are scheduled for `failed_retryable` work items whose backoff has expired.

**Note:** `failed_retryable` work items with future retry timers do **not** block quiescence. The scheduler will wake the daemon when the timer fires.

### Dispatch phase rules

1. The daemon runs the dispatch phase **in the same process** as the sync loop (v1).
2. The daemon may interleave sync and dispatch for multiple mailboxes, but dispatch for one mailbox does not block sync for another.
3. If a new wake signal arrives during dispatch, the daemon finishes the current dispatch phase before starting a new sync cycle. This prevents sync from racing ahead of unresolved work.
4. If sync fails, the dispatch phase is skipped. The daemon retries sync with backoff.

---

## Task 4 — Wake Sources

### Permitted wake sources

| Source | Trigger | Priority |
|--------|---------|----------|
| **Manual trigger** | Operator calls `daemon.wake()` or sends SIGUSR1 | 1 (highest) |
| **Webhook signal** | Microsoft Graph notification of mailbox change | 2 |
| **Internal retry timer** | A `failed_retryable` work item’s lease retry window expires | 3 |
| **Poll interval** | `polling_interval_ms` elapsed since last sync start | 4 (lowest) |

### Wake merging and deduplication

The daemon maintains a **pending wake bitmap** (or event queue) per mailbox:

```typescript
type WakeReason = "manual" | "webhook" | "retry" | "poll";
```

**Coalescing rules:**
- Multiple wakes of the same or lower priority while a cycle is running are **coalesced** into a single pending wake.
- A higher-priority wake replaces a lower-priority pending wake.
- After a sync+dispatch cycle completes, the daemon checks the pending wake. If none exists, it sleeps until the next poll or external signal.

**Example:**
1. Daemon is sleeping.
2. Poll timer fires → start sync+dispatch.
3. While running, webhook arrives → coalesce as pending webhook wake.
4. While still running, manual trigger arrives → upgrade pending wake to manual.
5. Cycle finishes → immediately start next cycle because a wake is pending.
6. After that cycle, no pending wake → sleep until next poll.

### Safety against duplicate wakes

- Sync is idempotent (`apply_log` + cursor store prevents duplicate event application).
- The foreman deduplicates `SyncCompletionSignal` by checking `current_revision_ordinal` against the last processed ordinal for each conversation.
- The scheduler deduplicates work leasing by row-level `work_item` state and lease tokens.
- Therefore, duplicate webhook deliveries or overlapping poll intervals are safe.

### Retry timer integration

- The scheduler writes the next retry timestamp into the `work_item` row (or a sidecar retry queue).
- The daemon polls these timestamps during its idle sleep using the **minimum** of:
  - `polling_interval_ms`
  - `next_retry_at - now` (if any retries are pending)
- When a retry timer fires, the daemon treats it as a `"retry"` wake for the relevant mailbox.

---

## Task 5 — Error Boundaries

### Sync succeeds, dispatch fails

**Scenario:** `exchange-fs-sync` completes successfully, but the foreman crashes or the scheduler throws during work opening or leasing.

**Behavior:**
1. The daemon logs the dispatch failure.
2. The daemon does **not** treat this as a fatal sync error; the mailbox state is already durably compiled.
3. The daemon retries the **dispatch phase only** with its own backoff (shorter than sync backoff, e.g., 2s, 4s, 8s).
4. The next successful dispatch will read the same compiled mailbox state from coordinator SQLite and resume opening/superseding work.
5. If dispatch failures exceed a threshold, the daemon marks the mailbox health as `degraded` but continues polling.

### Dispatch succeeds, evaluation fails

**Scenario:** A work item is leased and an execution attempt is dispatched, but the charter runtime crashes or returns unparseable output.

**Behavior:**
1. The execution attempt record is updated to `crashed` or `abandoned` by the foreman/scheduler.
2. The work item transitions to `failed_retryable` (if retry budget remains) or `failed_terminal` (if exhausted).
3. The daemon does not need to take action; the scheduler will re-queue the work item according to retry policy.
4. The daemon logs the failure for observability.

### Daemon restarts mid-cycle

**Scenario:** The daemon process restarts while a sync cycle or dispatch phase is running.

**Behavior:**
1. On startup, the daemon runs an initial sync cycle. The compiler’s `apply_log` ensures idempotency.
2. After sync, the daemon enters the dispatch phase.
3. The foreman reads `work_item` and `execution_attempt` state from coordinator SQLite.
4. Any `leased` work items with expired leases are marked `abandoned` and re-opened for scheduling.
5. Any `executing` work items with no heartbeat are similarly recovered.
6. **No logs or traces are read for recovery.** Recovery uses only durable coordinator state.

### Repeated failing work item causing livelock risk

**Mitigations:**
1. **Retry budget:** Each `work_item` has a max retry count (default: 3). After exhaustion, it transitions to `failed_terminal` and is ignored by the scheduler.
2. **Per-conversation circuit breaker:** If a conversation generates `failed_terminal` work items repeatedly (e.g., 3 in a row), the foreman may pause opening new work items for that conversation for a cooldown period (e.g., 10 minutes).
3. **Exponential backoff for retries:** Retry timers use exponential backoff with jitter to prevent thundering herds.
4. **Daemon does not spin:** The dispatch phase terminates when no runnable work exists. A failing work item in `failed_retryable` with a future timer does not keep the dispatch loop running.

---

## Task 6 — Visibility / Observability

### What the daemon logs

| Event | Log Level | Fields |
|-------|-----------|--------|
| Sync cycle start | `info` | `mailbox_id`, `signal_reason` |
| Sync cycle complete | `info` | `mailbox_id`, `applied_count`, `duration_ms` |
| Sync failure | `warn` / `error` | `mailbox_id`, `error`, `retryable` |
| Dispatch phase start | `info` | `mailbox_id`, `changed_conversations_count` |
| Work items opened | `info` | `mailbox_id`, `conversation_id`, `work_item_id` |
| Work item leased | `info` | `mailbox_id`, `work_item_id`, `execution_id` |
| Execution attempt complete | `info` | `mailbox_id`, `work_item_id`, `execution_id`, `attempt_status` |
| Dispatch phase quiescent | `debug` | `mailbox_id`, `open_work_items`, `leased_work_items` |
| Wake signal received | `debug` | `mailbox_id`, `reason` |
| Wake signal coalesced | `debug` | `mailbox_id`, `pending_reason` |

### Health file extensions

The daemon’s health file (`health.json`) is extended with control-plane fields:

```typescript
interface HealthStatus {
  status: "healthy" | "degraded" | "stopped";
  lastSyncAt: string | null;
  cyclesCompleted: number;
  eventsApplied: number;
  errors: number;
  consecutiveErrors: number;
  pid: number;
  // Control-plane fields
  controlPlane?: {
    openWorkItems: number;
    leasedWorkItems: number;
    failedRetryableWorkItems: number;
    lastDispatchAt: string | null;
  };
}
```

### What must NOT be logged as correctness state

- The daemon must not write logs saying "work item X is resolved" and then rely on log parsing to confirm resolution.
- The daemon must not use log timestamps to determine lease expiry.
- The daemon must not use trace store queries to decide whether to wake the foreman.

**Normative rule:**
> All scheduling and recovery truth resides in coordinator SQLite (`work_item`, `execution_attempt`, `outbound_commands`). Logs and health files are for human operators and monitoring; they must never be parsed by the daemon to make control decisions.

---

## Sync-to-Dispatch Sequence

```text
1. WAKE (poll / webhook / manual / retry)
        │
        ▼
2. SYNC CYCLE
        │
        ├──▶ fatal → stop daemon (or skip mailbox)
        ├──▶ retryable → backoff sleep → goto 1
        └──▶ success
                │
                ▼
3. BUILD SyncCompletionSignal from changed conversations
        │
        ▼
4. FOREMAN.onSyncCompleted(signal)
        │
        ├──▶ open work items
        ├──▶ supersede stale work items
        └──▶ no-op irrelevant changes
                │
                ▼
5. DISPATCH LOOP
        │
        ├──▶ scheduler.scan_for_runnable_work()
        │       │
        │       ├──▶ none → QUIESCENT → goto 6
        │       └──▶ found
        │               │
        │               ▼
        │       lease_work_item()
        │               │
        │               ▼
        │       dispatch_execution_attempt()
        │               │
        │               ▼
        │       wait for completion / expiry
        │               │
        │               ▼
        │       goto 5 (repeat)
        │
        ▼
6. SLEEP until next wake
```

---

## Wake Source Model with Dedupe and Precedence Rules

### Wake precedence

1. `manual` — overrides any pending wake, interrupts sleep immediately.
2. `webhook` — overrides `retry` and `poll`, interrupts sleep immediately.
3. `retry` — overrides `poll`, interrupts sleep if the retry timer fires before the poll interval.
4. `poll` — baseline timer that fires after `polling_interval_ms` of idleness.

### Dedupe rules

- While a cycle is running, at most **one** pending wake is retained per mailbox.
- The pending wake stores the **highest-priority** reason seen since the cycle started.
- After the cycle finishes, if a pending wake exists, the next cycle starts immediately with that reason.
- If multiple mailboxes have pending wakes, the daemon may process them in round-robin or parallel depending on implementation, but each mailbox gets at most one pending wake slot.

---

## Quiescence Definition

A mailbox reaches **quiescence** at the end of a dispatch phase when:

1. `COUNT(work_item WHERE status IN ('opened', 'leased', 'executing') AND mailbox_id = ?) == 0`
2. The foreman has processed all `ChangedConversation` signals from the most recent sync cycle.
3. No `retry` timer for that mailbox fires within the next scheduler quantum (e.g., 1 second).

**Global quiescence** (for multi-mailbox daemon):
- All mailboxes are quiescent, and no cross-mailbox batch work is pending.

---

## Error Handling Rules

1. **Sync fatal → stop daemon** (existing behavior).
2. **Sync retryable → backoff, re-sync** (existing behavior).
3. **Dispatch failure → retry dispatch with short backoff; do not roll back compiled mailbox state.**
4. **Evaluation failure → scheduler/foreman handles retry budget and terminal state; daemon logs only.**
5. **Daemon restart → resume from SQLite state; no trace/log parsing for recovery.**
6. **Livelock prevention → retry budgets, circuit breakers, and explicit quiescence.**

---

## Integration Notes for Package/Module Ownership

### `packages/exchange-fs-sync-daemon`
- Owns the long-running process, wake loop, health reporting, and sync scheduling.
- Owns the call into the foreman after sync (`foreman.onSyncCompleted`).
- Does not own work-item logic, charter invocation, or outbound command execution.

### Foreman (future package, likely `packages/exchange-fs-sync-foreman` or within coordinator)
- Owns `SyncCompletionSignal` processing, work item opening/supersession, and evaluation validation.
- Exposes an interface like `ForemanFacade.onSyncCompleted(signal): Promise<DispatchResult>`.
- The daemon imports and calls this facade.

### Scheduler (future module within foreman or standalone)
- Owns `scan_for_runnable_work()`, `lease_work_item()`, and `dispatch_execution_attempt()`.
- The daemon may call the scheduler directly, or the foreman may orchestrate the scheduler internally.

### Compiler (`packages/exchange-fs-sync`)
- Owns deterministic mailbox compilation.
- The compiler output (filesystem state + views) is read by the foreman to build thread context.
- The compiler does not know about the daemon’s dispatch loop.

---

## Deliverables Checklist

- [x] Sync-to-dispatch sequence
- [x] Wake source model with dedupe and precedence rules
- [x] Quiescence definition
- [x] Error handling rules
- [x] Integration notes for package/module ownership

## Parallel To

May run in parallel with:
- Agent A — Scheduler and Leases
- Agent B — Charter Invocation v2
- Agent C — Tool Binding Runtime
- Agent D — Outbound Handoff v2
- Agent E — Replay and Recovery Tests

## Constraints

Do not:
- redesign scheduler internals
- redesign ontology
- let daemon call outbound worker directly for side effects
- treat logs as control truth
