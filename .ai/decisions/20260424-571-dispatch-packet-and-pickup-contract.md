---
closes_tasks: [571]
decided_at: 2026-04-24
decided_by: a2
reviewed_by: a2
governance: derive -> propose
---

# Decision 571 — Dispatch Packet And Pickup Contract

## Goal

Define the canonical dispatch packet shape, pickup semantics, lease lifecycle, and operator visibility for the Dispatch Zone established in Decision 570.

---

## 1. Dispatch Packet Shape

### 1.1 Core Packet (`DispatchPacket`)

The packet is the durable crossing artifact for Assignment → Dispatch.

```typescript
interface DispatchPacket {
  /** Stable identity: `disp_{task_id}_{assignment_id}_{seq}` */
  packet_id: string;

  task_id: string;
  assignment_id: string;
  agent_id: string;

  /** When the agent picked up the work (or when the packet was auto-created on assignment) */
  picked_up_at: string;

  /** Lease expiry timestamp. After this, the packet is eligible for expiry. */
  lease_expires_at: string;

  /** Last heartbeat timestamp. Null until first heartbeat. */
  heartbeat_at: string | null;

  /** Current state in the lease lifecycle */
  dispatch_status:
    | "picked_up"
    | "renewed"
    | "expired"
    | "released"
    | "superseded";

  /** Sequence number for this assignment. Starts at 1. Incremented on re-dispatch. */
  sequence: number;

  /** How the packet was created */
  created_by: "agent_pickup" | "auto_on_claim" | "operator_override";
}
```

### 1.2 Packet Context (`DispatchContext`)

The context is a read-only view assembled at pickup time. It is **not** authoritative — it is a convenience snapshot for the agent.

```typescript
interface DispatchContext {
  /** Task specification (from markdown body) */
  task_spec: {
    title: string;
    goal: string;
    required_work: string;
    acceptance_criteria: string[];
  };

  /** Prior execution notes from the most recent report or markdown body */
  prior_execution_notes: string | null;

  /** Prior verification notes from the most recent report */
  prior_verification: string | null;

  /** Continuation packet from a prior budget_exhausted release */
  continuation_packet: import("../lib/task-governance.js").ContinuationPacket | null;

  /** Files touched in prior attempts (from most recent report) */
  files_touched: string[];

  /** Active dependency statuses (from SQLite lifecycle) */
  dependency_statuses: Array<{
    task_number: number;
    status: string;
    blocking: boolean;
  }>;

  /** Review findings from the most recent review, if any */
  latest_review_findings: Array<{
    severity: string;
    description: string;
  }> | null;
}
```

### 1.3 Identity Format

```
packet_id = "disp_" + task_id + "_" + assignment_id + "_" + sequence
```

Example: `disp_20260424-562-test_assign-abc123_1`

Rationale: includes task and assignment for debugging; sequence allows multiple packets per assignment.

---

## 2. Pickup Semantics

### 2.1 What Counts as "Visible"

A task is visible in an agent's dispatch queue when **all** of the following hold:

1. The task has an **unreleased** assignment for that agent.
2. The task's `task_lifecycle.status` is `claimed` or `needs_continuation`.
3. The task's dependencies are satisfied (all `depends_on` tasks are terminal and complete by evidence).
4. **No active dispatch packet** exists for this assignment with `dispatch_status: 'picked_up'` or `'renewed'`.

If condition 4 fails (there is an active packet), the task is visible as **"already picked up — renew or release"** rather than as a new pickup.

### 2.2 What Counts as "Admitted"

A pickup request is admitted when **all** of the following hold:

1. The assignment exists and is unreleased.
2. The requesting agent matches `assignment.agent_id`.
3. The task status is `claimed` or `needs_continuation`.
4. No active packet exists for this assignment (status `'picked_up'` or `'renewed'`).
5. Dependency gates are still satisfied.

Admissibility is checked at pickup time, not at claim time. Dependencies may have changed since claim.

### 2.3 What Counts as "Picked Up"

Pickup creates a `DispatchPacket` row with:
- `dispatch_status: 'picked_up'`
- `picked_up_at: nowIso()`
- `lease_expires_at: nowIso() + DEFAULT_LEASE_MINUTES`
- `sequence: 1` (or `max(prior sequences) + 1` for re-dispatch)
- `created_by: 'agent_pickup'`

The agent receives the `DispatchContext` snapshot. No roster state is mutated at pickup (roster was already updated at claim time).

### 2.4 Auto-Creation on Claim

When `task-claim` (or `task-continue`) is executed with an optional `auto_dispatch` flag, the dispatch packet is created immediately with:
- `created_by: 'auto_on_claim'`
- `dispatch_status: 'picked_up'`
- Same lease expiry as manual pickup

This collapses Assignment → Dispatch into a single operator action for agents that do not need a separate pickup step. The two-zone model is still respected because the packet exists as a durable artifact.

---

## 3. Lease Lifecycle

### 3.1 Lease Constants

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `DEFAULT_LEASE_MINUTES` | 30 | Enough for a single work session; short enough to detect abandonment quickly |
| `HEARTBEAT_EXTENSION_MINUTES` | 15 | Each heartbeat buys a modest extension |
| `MAX_LEASE_MINUTES` | 240 | 4-hour ceiling prevents runaway leases |
| `HEARTBEAT_INTERVAL_MINUTES` | 15 | Agents should heartbeat at least every 15 minutes |

### 3.2 Heartbeat

An agent sends a heartbeat by updating `heartbeat_at` to the current time and extending `lease_expires_at` by `HEARTBEAT_EXTENSION_MINUTES`, capped at `MAX_LEASE_MINUTES`.

The heartbeat is idempotent: repeated heartbeats within the same minute produce the same state.

Heartbeats do **not** mutate `dispatch_status` (it remains `'picked_up'` or `'renewed'`).

### 3.3 Expiry

A packet transitions to `expired` when `lease_expires_at < now()` and no heartbeat has renewed it.

Expiry is a **passive** transition: no daemon is required. The next read query that encounters the packet classifies it as expired.

An expired packet:
- Cannot be renewed
- Cannot be used to begin execution
- Makes the task eligible for re-dispatch (if assignment is still unreleased)

### 3.4 Release

A packet transitions to `released` when:
- The agent explicitly releases the assignment (`task-release`)
- The operator forces release (`task-release --override`)
- The task is closed or confirmed

Release is **active**: it requires a governed operator.

### 3.5 Superseded

A packet transitions to `superseded` when:
- A new assignment is created for the same task (e.g., `takeover`)
- The new packet has a higher `sequence` for the new assignment

Superseded packets are historical artifacts. They are not expired or released — they were overtaken by a new assignment.

---

## 4. Re-Dispatch Rules

### 4.1 Re-Dispatch Eligibility

A task is re-dispatchable when **all** of the following hold:

1. The assignment is still unreleased.
2. The most recent dispatch packet for this assignment is `expired` or `released`.
3. The task status is still `claimed` or `needs_continuation`.
4. Dependencies are still satisfied.

### 4.2 Re-Dispatch Within Same Assignment

If the same agent picks up again within the same assignment:
- A new packet is created with `sequence = max(prior) + 1`
- The prior packet is **not** mutated (append-only history)

### 4.3 Re-Dispatch After Takeover

If a `takeover` assignment is created:
- The old assignment is released with reason `transferred`
- The old assignment's active packet (if any) is marked `superseded`
- The new assignment starts with `sequence = 1`

---

## 5. Ack / Lease / Takeover Posture

### 5.1 Acknowledgment

Pickup is the acknowledgment. There is no separate "ack" operation beyond creating the packet. The packet row is the durable ack.

### 5.2 Lease vs Assignment

| Aspect | Assignment | Dispatch Packet |
|--------|-----------|-----------------|
| Authority | `claim` / `admin` | `derive` + `execute` |
| Expiry | None | Bounded (30 min default, 4 hr max) |
| Heartbeat | None | Required every 15 min |
| Re-dispatch | Requires new claim or takeover | Can re-dispatch within same assignment |
| Mutability | Released once, immutable history | Multiple packets per assignment, append-only |

### 5.3 Takeover Interaction

A `takeover` assignment is created by `task-continue` or operator override. It supersedes the prior primary assignment.

When a takeover occurs:
1. Old assignment is released with `release_reason: 'transferred'`
2. Old active packet is marked `superseded`
3. New assignment is created with `intent: 'takeover'`
4. New packet starts with `sequence: 1`

The takeover agent must pick up the new assignment explicitly (unless `auto_dispatch` is enabled).

---

## 6. Operator Visibility and Intervention

### 6.1 What Operators Can See

| Surface | Data |
|---------|------|
| `narada task dispatch status <task>` | Active packet (status, lease_expires_at, heartbeat_at, agent) |
| `narada task dispatch history <task>` | All packets for the task (sequence, status, created_by) |
| `narada task dispatch queue <agent>` | Visible pickups for an agent (task_id, lease_expiry, context summary) |

### 6.2 What Operators Can Do

| Action | Authority | Effect |
|--------|-----------|--------|
| Force expiry | `admin` | Marks packet `expired` immediately; makes task re-dispatchable |
| Force release | `admin` | Releases assignment + marks packet `released`; task returns to `opened` |
| Override pickup | `admin` | Creates packet for a different agent (requires new assignment) |
| View queue | `derive` | Read-only inspection of any agent's queue |

### 6.3 Audit Trail

Every packet mutation (pickup, heartbeat, expiry, release, superseded) is recorded as a new row in the `dispatch_packets` table. The table is append-only. No row is ever mutated in place — status transitions are represented by new rows or by the passage of time relative to `lease_expires_at`.

---

## 7. SQLite Schema (for Task 572)

The following schema is the canonical persistence shape for dispatch packets. Task 572 will implement this.

```sql
create table dispatch_packets (
  packet_id text primary key,
  task_id text not null,
  assignment_id text not null,
  agent_id text not null,
  picked_up_at text not null,
  lease_expires_at text not null,
  heartbeat_at text,
  dispatch_status text not null,
  sequence integer not null default 1,
  created_by text not null,
  context_json text,  -- serialized DispatchContext snapshot
  foreign key (task_id) references task_lifecycle(task_id),
  foreign key (assignment_id) references task_assignments(assignment_id)
);

create index idx_dispatch_packets_task_id
  on dispatch_packets(task_id);

create index idx_dispatch_packets_assignment_id
  on dispatch_packets(assignment_id);

create index idx_dispatch_packets_agent_status
  on dispatch_packets(agent_id, dispatch_status);

create index idx_dispatch_packets_lease_expires
  on dispatch_packets(lease_expires_at)
  where dispatch_status in ('picked_up', 'renewed');
```

### 7.1 Schema Notes

- `context_json` is a convenience snapshot, not authoritative. The agent may re-read the task file and SQLite state at any time.
- The `lease_expires_at` partial index supports efficient expiry scanning.
- `sequence` is per-assignment, not global.

---

## 8. Deferred / Out of Scope

| Item | Why Deferred |
|------|-------------|
| **SQLite implementation** | Task 572 |
| **Heartbeat daemon** | Requires a background process or cron; not needed for v0 (expiry is passive) |
| **Auto-dispatch flag in claim** | Can be added to `task-claim` without changing this contract |
| **CLI commands (`dispatch status`, `dispatch history`, `dispatch queue`)** | Task 572 or follow-up |
| **Integration with workbench** | UI rendering of dispatch state is deferred |
| **Crossing regime inventory entry** | Will be added when the first concrete crossing is implemented (Task 572) |

---

## 9. Verification Evidence

- Dispatch packet shape is explicit with TypeScript interfaces ✅
- Pickup semantics (visible, admitted, picked up) are explicit ✅
- Lease lifecycle (heartbeat, expiry, release, superseded) is explicit ✅
- Re-dispatch rules are explicit ✅
- Ack/lease/takeover posture is explicit ✅
- Operator visibility and intervention points are explicit ✅
- SQLite schema is defined for Task 572 ✅
- `pnpm verify`: 5/5 steps pass ✅
- `pnpm typecheck`: all 11 packages clean ✅

---

**Closed by:** a2  
**Closed at:** 2026-04-24
