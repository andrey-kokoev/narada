# Assignment — Agent A — Scheduler and Lease Model

## Role

You are the scheduler/runtime engineer for Narada’s control plane.

Your job is to realize the post-ontology control algebra as a crash-safe scheduler that can select, lease, execute, and retire work without allowing duplicate authority or hidden in-memory state.

## Scope

Primary target:
- `.ai/tasks/20260414-005-assignment-agent-a-scheduler-and-leases.md`

Read first:
- `.ai/tasks/20260414-002-foreman-core-ontology-and-control-algebra.md`
- `.ai/tasks/20260414-003-identity-lattice-and-canonical-keys.md`
- `.ai/tasks/20260414-004-coordinator-durable-state-v2.md`

Likely implementation surfaces to inspect:
- `packages/exchange-fs-sync-daemon/src/`
- `packages/exchange-fs-sync/`
- any current coordinator/foreman-related packages or docs

## Mission

Produce the implementation-ready scheduler/lease design for the control plane.

This task must define exactly how runnable work is discovered, claimed, executed, retried, and retired.

## Core Invariants

1. Scheduler does not redefine mailbox truth.
2. Scheduler operates on first-class work items, not free-floating threads.
3. At most one live execution authority exists per leased work item.
4. Crashes must lead to durable recoverability, not ambiguous partial state.
5. Duplicate wake signals must not create duplicate side effects.

---

## Task 1 — Runnable Selection

### Preconditions for Runnable Status
A `work_item` is **runnable** when **all** of the following hold:

1. `status = 'opened'`
2. No other `work_item` for the same `conversation_id` is currently `leased` or `executing` (conversation-level serialization)
3. The referenced `conversation_id` exists in `thread_records`
4. The conversation is not in a terminal coordinator status that blocks all work (e.g., `archived`)
5. No active `outbound_command` for the same `conversation_id` is in `blocked_policy` awaiting override (optional hard stop depending on policy)
6. The work item has not been `superseded` by a newer work item on the same conversation

### Ordering / Prioritization Rules
The scheduler selects runnable work items in the following priority order:

1. **Urgency**: `work_item.urgency` (or inferred from thread status: `blocked` > `active` > `waiting_*` > `new`)
2. **Age**: `created_at` ascending (older first)
3. **Mailbox fairness**: Round-robin across mailboxes if the scheduler is multi-mailbox aware

### Bounded Batch Selection Behavior
The scheduler operates in **bounded batches**:
- `SELECT ... LIMIT {batch_size}` from the runnable set
- `batch_size` defaults to `10` and is configurable
- The scheduler does not hold a long-running cursor; each cycle re-evaluates the runnable set
- This prevents stale selection after a crash or concurrent state change

### Handling of Superseded Work
Before a work item transitions to `leased`, the scheduler verifies it is still the **latest non-terminal** work item for its conversation. If a newer work item exists, the older item is atomically marked `superseded` and skipped.

---

## Task 2 — Lease Semantics

### What Object Is Leased
The **work item** is the leased object. The lease grants exclusive execution authority for that work item to a specific scheduler runner instance.

### How Lease Ownership Is Represented
Leases are represented as **durable SQLite records** in a `work_item_leases` table (or embedded in the `work_items` table as lease columns). The design favors a dedicated table for audit clarity:

```
work_item_leases:
  lease_id        text primary key   -- ls_<uuid>
  work_item_id    text not null      -- references work_items(work_item_id)
  runner_id       text not null      -- unique id for the scheduler runner
  acquired_at     text not null      -- ISO timestamp
  expires_at      text not null      -- ISO timestamp
  released_at     text               -- null until release
  release_reason  text               -- 'success' | 'crash' | 'abandoned' | 'superseded' | 'cancelled'
```

A work item is considered **leased** when the most recent lease record for it has `released_at IS NULL` and `expires_at > now()`.

### How Lease Expiry Works
- `lease_duration_ms` defaults to `60000` (1 minute)
- `expires_at = acquired_at + lease_duration_ms`
- The runner must renew the lease before expiry by updating `expires_at`
- If the runner fails to renew, the lease becomes **stale**

### How Lease Recovery Works After Crash
After a crash, the scheduler on restart:
1. Scans for stale leases (`expires_at <= now()` AND `released_at IS NULL`)
2. For each stale lease, writes a release record with `release_reason = 'abandoned'`
3. Transitions the associated `work_item` from `leased` → `failed_retryable` (or directly back to `opened` if retry policy permits immediate retry)
4. Resumes normal selection

This requires **no in-memory state** to recover.

### Whether Heartbeats Are Needed
**Yes.** The runner must write heartbeat updates to extend `expires_at`.
- Heartbeat interval: `lease_duration_ms / 3` (e.g., every 20s for a 60s lease)
- Heartbeat is an `UPDATE work_item_leases SET expires_at = ? WHERE lease_id = ?`
- Missing two consecutive heartbeats = stale lease = abandonment

---

## Task 3 — Execution Loop

### Durable Write Sequence

#### A. Lease Acquisition (Runnable → Leased)
```sql
BEGIN;
  -- 1. Verify still runnable
  SELECT status FROM work_items WHERE work_item_id = ? FOR UPDATE;
  -- must be 'opened' and not superseded

  -- 2. Insert lease record
  INSERT INTO work_item_leases (...);

  -- 3. Transition work item
  UPDATE work_items SET status = 'leased', updated_at = ? WHERE work_item_id = ?;
COMMIT;
```

#### B. Execution Start (Leased → Executing)
When the runner actually begins the charter/foreman execution:
```sql
BEGIN;
  -- 1. Verify lease is still valid
  SELECT * FROM work_item_leases WHERE lease_id = ? AND released_at IS NULL AND expires_at > now();

  -- 2. Insert execution attempt record
  INSERT INTO execution_attempts (execution_id, work_item_id, runner_id, started_at, status)
  VALUES (?, ?, ?, ?, 'active');

  -- 3. Transition work item
  UPDATE work_items SET status = 'executing', updated_at = ? WHERE work_item_id = ?;
COMMIT;
```

#### C. Success (Executing → Resolved)
When the foreman successfully resolves the work item (emits outbound proposal or no-op):
```sql
BEGIN;
  -- 1. Update execution attempt
  UPDATE execution_attempts
  SET status = 'succeeded', completed_at = ?, output_summary = ?
  WHERE execution_id = ?;

  -- 2. Release lease
  UPDATE work_item_leases
  SET released_at = ?, release_reason = 'success'
  WHERE lease_id = ?;

  -- 3. Insert outbound proposal if any
  INSERT INTO foreman_decisions (...) VALUES (...);

  -- 4. Insert outbound command if any
  INSERT INTO outbound_commands (...) VALUES (...);
  INSERT INTO outbound_versions (...) VALUES (...);

  -- 5. Transition work item
  UPDATE work_items
  SET status = 'resolved', resolved_at = ?, resolution_kind = ?
  WHERE work_item_id = ?;
COMMIT;
```

#### D. Crash / Failure (Executing → Failed Retryable)
When the execution attempt crashes or returns unrecoverable error:
```sql
BEGIN;
  -- 1. Update execution attempt
  UPDATE execution_attempts
  SET status = 'crashed', completed_at = ?, error_summary = ?
  WHERE execution_id = ?;

  -- 2. Release lease
  UPDATE work_item_leases
  SET released_at = ?, release_reason = 'crash'
  WHERE lease_id = ?;

  -- 3. Transition work item
  UPDATE work_items
  SET status = 'failed_retryable',
      retry_count = retry_count + 1,
      next_retry_at = ?,
      updated_at = ?
  WHERE work_item_id = ?;
COMMIT;
```

#### E. Abandonment (Leased/Executing → Failed Retryable)
Performed by the scheduler recovery scanner when a stale lease is detected:
```sql
BEGIN;
  -- 1. Close any active execution attempt (if one was started)
  UPDATE execution_attempts
  SET status = 'abandoned', completed_at = ?
  WHERE work_item_id = ? AND status = 'active';

  -- 2. Release lease
  UPDATE work_item_leases
  SET released_at = ?, release_reason = 'abandoned'
  WHERE lease_id = ? AND released_at IS NULL;

  -- 3. Transition work item
  UPDATE work_items
  SET status = 'failed_retryable',
      retry_count = retry_count + 1,
      next_retry_at = ?,
      updated_at = ?
  WHERE work_item_id = ?;
COMMIT;
```

---

## Task 4 — Retry / Backoff Semantics

### Retryable Failures
A work item may be retried when:
- Execution crashed (runtime error, timeout, unparseable output)
- Lease abandoned (runner died)
- Tool runner transient failure
- Graph API transient read failure during charter context hydration

### Terminal Failures
A work item becomes `failed_terminal` when:
- `retry_count >= max_retries` (default `3`)
- The error is structurally unrecoverable (e.g., invalid charter output schema, missing required field, policy violation that cannot be overridden)

### Retry Delay / Backoff Source
```
delay_ms = base_delay_ms * (2 ^ retry_count) + jitter_ms
base_delay_ms = 5000
max_delay_ms = 300000  -- 5 minutes
jitter_ms = random(0, 1000)
```

The `next_retry_at` field on `work_items` stores the calculated retry time. The scheduler only selects `failed_retryable` items as runnable when `next_retry_at <= now()`.

### Supersession Behavior When a New Revision Arrives During Retry
If a new `conversation_revision` is observed while a work item is in `failed_retryable`:
1. The foreman may create a **new** `work_item` for the new revision
2. The old `failed_retryable` work item is marked `superseded`
3. The old work item is never retried; all retry state is retired with it

---

## Task 5 — Quiescence

System quiescence for the scheduler means:
1. No runnable work items exist (`status = 'opened'`)
2. No `failed_retryable` work items have `next_retry_at <= now()`
3. No active leases are stale (all leased/executing work items have valid heartbeats)

When quiescent, the scheduler:
- Sleeps until the next wake signal (inbound sync completion, webhook, or retry timer)
- Does not spin or repeatedly query the database
- Wakes on a configurable polling interval (default 30s) as a safety net

---

## Task 6 — Failure Modes

### Duplicate Wake
**Scenario**: Two inbound sync cycles finish closely together, or a webhook and a poll both fire.
**Handling**:
- The scheduler uses atomic lease acquisition. Only one wake will successfully lease a given work item.
- The second wake will find no runnable work items and return to quiescence.
- Duplicate wakes are idempotent at the selection boundary.

### Crash After Lease, Before Execution
**Scenario**: The runner acquires a lease, writes `status = 'leased'`, then crashes before starting the execution attempt.
**Handling**:
- Lease expires after `lease_duration_ms` with no heartbeats.
- Recovery scanner marks lease `abandoned`.
- Work item returns to `failed_retryable` with `retry_count + 1`.
- No execution attempt record exists, so no partial evaluation state is left.

### Crash During Execution
**Scenario**: The runner is in `executing` state, has written an `execution_attempts` record, then crashes.
**Handling**:
- Lease expires, recovery scanner detects stale lease.
- Active execution attempt is marked `abandoned`.
- Work item returns to `failed_retryable`.
- Any traces written by the crashed attempt remain (commentary, not state).
- No `foreman_decision` or `outbound_command` was committed, so no partial side effects exist.

### Stale Lease
**Scenario**: A runner loses network connectivity but does not crash; heartbeats stop.
**Handling**:
- After `lease_duration_ms` elapses without heartbeat, another scheduler runner may acquire a new lease for the same work item **only after** the recovery scanner has released the stale lease.
- This prevents split-brain execution.
- The old runner, if it resumes, will fail heartbeat validation and must gracefully abort.

### Work Item Superseded Mid-Execution
**Scenario**: A new conversation revision arrives while a work item is `executing`.
**Handling**:
- The current execution is **not** forcibly killed. The foreman inside the execution is responsible for detecting supersession at resolution time.
- If the foreman tries to commit its decision, it must re-check that the work item is still the latest non-terminal work item for the conversation.
- If superseded, the foreman rolls back the transaction and the execution returns `superseded` as the completion reason.
- The scheduler then marks the work item `superseded` and creates a new work item for the new revision.

---

## Scheduler State Machine

```
                       ┌─────────────────┐
                       │  work_item      │
                       │  opened         │
                       └────────┬────────┘
                                │ (scheduler selects)
                                ▼
                       ┌─────────────────┐
                       │  leased         │◄────┐
                       └────────┬────────┘     │
                                │ (runner      │
                                │  starts)     │ heartbeat
                                ▼              │ renewal
                       ┌─────────────────┐     │
                       │  executing      │─────┘
                       └────────┬────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │   resolved    │   │failed_retryable│  │  superseded   │
    └───────────────┘   └───────┬───────┘   └───────────────┘
                                │
                    ┌───────────┴───────────┐
                    │  (retry after backoff) │
                    ▼                        ▼
            ┌───────────────┐        ┌───────────────┐
            │   opened      │        │failed_terminal│
            │  (re-queue)   │        └───────────────┘
            └───────────────┘
```

---

## Lease Model Normative Rules

1. **Lease is on work_item, not conversation**: A lease grants authority over one specific work item. Multiple work items for the same conversation may exist sequentially, each with its own lease.
2. **One live lease per work_item**: At any moment, a work item may have at most one unreleased, unexpired lease.
3. **Lease implies status**: `work_item.status = 'leased'` or `'executing'` if and only if a valid unreleased lease exists.
4. **Heartbeat is mandatory**: Runners must heartbeat at least every `lease_duration_ms / 3`.
5. **Lease expiry is deterministic**: A lease is stale when `expires_at <= now()`, regardless of runner process state.
6. **Recovery scanner is the only legitimate abandon-er**: No running process may release another process's lease directly; only the recovery scanner may do so after detecting staleness.
7. **Lease abandonment increments retry_count**: Every abandonment (crash or stale lease) counts as a retryable failure.
8. **No lease = no execution**: A runner must verify its lease is still valid before every durable write.

---

## Concurrency Rules for Single-Writer / Multi-Runner Safety

### Single-Writer per Conversation
Only one work item per `conversation_id` may be `leased` or `executing` at a time. This is enforced by the runnable selection query, which filters out conversations that already have active work items.

### Multi-Runner via Lease Atomicity
Multiple scheduler runners (processes or threads) may compete to acquire leases. The winner is determined by the first successful `INSERT INTO work_item_leases ...` + `UPDATE work_items SET status = 'leased'` in a transaction.

### SQLite Isolation
All lease operations use `BEGIN IMMEDIATE` or equivalent to ensure exclusive locking during lease acquisition. SQLite serializes writers, so concurrent lease attempts on the same work item are naturally ordered.

### Read-Only Runners
Execution of charter code may happen in separate OS processes, but they are read-only with respect to the lease table except for heartbeats (which update `expires_at` on their own lease row).

---

## Test Matrix for Unit / Integration Implementation

### Unit Tests

| Test | Scenario | Expected Result |
|------|----------|-----------------|
| U1 | Select runnable with `status = 'opened'` | Returns work item |
| U2 | Select skips `leased` work item | Returns empty or next item |
| U3 | Select skips superseded work item | Returns empty or next item |
| U4 | Lease acquisition succeeds atomically | Status becomes `leased`, lease row exists |
| U5 | Concurrent lease acquisition on same work item | Exactly one succeeds |
| U6 | Heartbeat extends expiry | `expires_at` updated |
| U7 | Stale lease detection | Scanner marks `abandoned`, status → `failed_retryable` |
| U8 | Execution start writes attempt record | `execution_attempts` row with `status = 'active'` |
| U9 | Success path commits proposal + command | `resolved`, decision and command rows exist |
| U10 | Crash path increments retry | `failed_retryable`, `retry_count = 1`, `next_retry_at` set |
| U11 | Max retries → terminal | `failed_terminal` after 3rd crash |
| U12 | Supersession during retry | Old item `superseded`, new item `opened` |

### Integration Tests

| Test | Scenario | Expected Result |
|------|----------|-----------------|
| I1 | Full cycle: sync → work item → lease → execute → resolve | End state: `resolved`, outbound command exists |
| I2 | Crash after lease, before execution, then recovery | Stale lease abandoned, work item retried, no duplicate commands |
| I3 | Crash during execution, then recovery | Active attempt abandoned, no partial proposal committed |
| I4 | Duplicate wake signals | Second wake finds no runnable work, idempotent |
| I5 | New revision arrives during execution | Current execution completes or is superseded, new work item created |
| I6 | Multi-runner contention | 10 runners, 100 work items, zero duplicate leases |
| I7 | Backoff quiescence | Scheduler sleeps until `next_retry_at`, no busy-wait |
| I8 | Heartbeat failure mid-execution | Lease goes stale, second runner cannot steal until scanner runs |

---

## Deliverables Checklist

- [x] Scheduler state machine
- [x] Lease model with normative rules
- [x] Durable write sequence for acquire/start/success/failure/abandon
- [x] Concurrency rules for single-writer / multi-runner safety
- [x] Test matrix for unit/integration implementation

---

## Parallel To

May run in parallel with:
- Agent B — Charter Invocation v2
- Agent C — Tool Binding Runtime
- Agent D — Outbound Handoff v2
- Agent E — Replay and Recovery Tests
- Agent F — Daemon-Foreman Dispatch

## Constraints

Do not:
- redesign ontology
- redesign identity lattice
- implement charter payloads
- implement outbound command materialization
- rely on traces as scheduler truth
