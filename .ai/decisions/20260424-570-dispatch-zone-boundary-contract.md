---
closes_tasks: [570]
decided_at: 2026-04-24
decided_by: a2
reviewed_by: a2
governance: derive -> propose
---

# Decision 570 — Dispatch Zone Boundary Contract

## Problem

Narada task governance currently has two zones:

- **Assignment** (Agent → Task): an agent claims a task, producing a `TaskAssignment` record
- **Execution** (Agent does the work): the agent reads the task file, plans, implements, reports

There is no distinct zone between assignment and execution. The agent is expected to begin work immediately after claiming, with no formal handoff, no pickup acknowledgment, and no timeout if pickup never occurs. This creates several failure modes:

1. **Silent abandonment**: an agent claims a task, crashes, or loses context, and the task sits claimed indefinitely with no signal that work never began.
2. **No pickup context**: the assignment record carries intent (`primary`, `review`, `repair`, `takeover`) but does not carry the execution context (continuation packet, prior execution notes, relevant files) that the agent needs to actually begin.
3. **No lease semantics**: assignment is an open-ended carriage. There is no expiry, no heartbeat, no re-dispatch if the assigned agent fails to pick up within a bounded window.
4. **Collapsed authority**: the same authority (the assigned agent) governs both "I have been assigned" and "I am executing," with no durable boundary between the two states.

The Narada control plane solves an analogous problem with **scheduler leases**: a `work_item` is opened by the foreman, but execution authority is transferred to a runner only when the runner acquires a lease. The lease has an expiry, a heartbeat, and explicit release semantics. The task governance layer lacks this structural separation.

## Decision

Narada adopts a **Dispatch Zone** as a first-class zone between Assignment and Execution.

### Three-Zone Model

```
Assignment ──[Assignment → Dispatch]──> Dispatch ──[Dispatch → Execution]──> Execution
```

| Zone | Authority Owner | Canonical Question |
|------|-----------------|-------------------|
| **Assignment** | Agent (`claim`) / Operator (`admin`) | "Who is responsible for this task?" |
| **Dispatch** | Dispatch surface (`derive` + `execute`) | "Has the assigned agent picked up the work and received the execution context?" |
| **Execution** | Assigned agent (`claim`) | "Is the agent producing work product toward completion?" |

### What Each Zone Owns

#### Assignment Zone
- `TaskAssignment` record (agent_id, claimed_at, intent, exclusivity)
- Roster state reflection (agent status = `working`)
- Dependency gate evaluation (task is claimable)

**Does NOT own:**
- Whether work has actually begun
- Execution context delivery
- Timeout or heartbeat semantics

#### Dispatch Zone
- `DispatchPacket` artifact (see below)
- Pickup acknowledgment (`picked_up_at`, `picked_up_by`)
- Lease/timeout state (`lease_expires_at`, `heartbeat_at`)
- Re-dispatch eligibility (can another agent pick this up?)

**Does NOT own:**
- Who is *assigned* (that is Assignment)
- What work product is produced (that is Execution)
- Whether the task is complete (that is Review/Closure)

#### Execution Zone
- Work product (code changes, tests, documentation)
- `TaskReport` record (summary, changed_files, verification)
- Body sections in markdown (`## Execution Notes`, `## Verification`)
- Evidence artifact production

**Does NOT own:**
- Assignment state
- Dispatch state
- Closure provenance

### The Dispatch Packet

The `DispatchPacket` is the crossing artifact produced when an assigned agent picks up work. It is the durable record that proves the crossing from Assignment → Dispatch occurred.

```typescript
interface DispatchPacket {
  packet_id: string;
  task_id: string;
  assignment_id: string;
  agent_id: string;
  picked_up_at: string;
  lease_expires_at: string;
  context: {
    task_spec: TaskSpecView;           // goal, required_work, acceptance_criteria
    prior_execution_notes?: string;    // from previous continuations
    continuation_packet?: ContinuationPacket; // from prior budget_exhausted release
    relevant_files: string[];          // files touched in prior attempts
  };
  dispatch_status: 'picked_up' | 'renewed' | 'expired' | 'released';
}
```

### Crossing Regimes

#### Crossing 1: Assignment → Dispatch

| Field | Value |
|-------|-------|
| Source zone | Assignment |
| Destination zone | Dispatch |
| Authority owner | Dispatch surface (`derive` + `execute`) |
| Admissibility regime | Assignment exists and is unreleased; agent matches assignment; no prior unexpired dispatch packet for this assignment; dependency gates still satisfied |
| Crossing artifact | `DispatchPacket` |
| Confirmation rule | Packet is durably recorded; lease timer begins; agent receives context |
| Anti-collapse invariant | Prevents assignment from being mistaken for execution readiness. |

#### Crossing 2: Dispatch → Execution

| Field | Value |
|-------|-------|
| Source zone | Dispatch |
| Destination zone | Execution |
| Authority owner | Assigned agent (`claim`) |
| Admissibility regime | Dispatch packet exists and lease has not expired; agent acknowledges context receipt |
| Crossing artifact | Agent trace / execution attempt record (advisory) |
| Confirmation rule | Work product begins to accumulate (execution notes, file changes, reports) |
| Anti-collapse invariant | Prevents dispatch acknowledgment from being mistaken for work completion. |

### Why Assignment Alone Is Insufficient

**1. Authority collapse.**
Assignment and execution are different authority grammars. Assignment decides *who is responsible*. Execution decides *what is being produced*. Collapsing them means a claimed task with no work product is indistinguishable from a claimed task with active work — both show `status: claimed`. The Dispatch Zone introduces `dispatch_status: picked_up` as a distinct durable state.

**2. No timeout semantics.**
Assignment has no expiry. An agent can claim a task, lose context, and the task remains `claimed` forever. Dispatch introduces `lease_expires_at`, enabling automatic re-dispatch or escalation when pickup does not occur within a bounded window.

**3. No pickup context.**
The `TaskAssignment` record is minimal (agent_id, intent, claimed_at). It does not contain the task specification, prior notes, or continuation state. The `DispatchPacket` carries this context explicitly, ensuring the agent has everything needed to begin.

**4. No re-dispatch path.**
If assignment = execution readiness, there is no way to re-offer a task to another agent without releasing the first assignment (which is a heavy operation). Dispatch allows a task to be re-dispatched within the same assignment if the lease expires, or to transition to a new assignment via `takeover`.

**5. Control-plane analogy.**
The Narada control plane already separates:
- `work_item` (what needs to be done) from
- `work_item_leases` (who has authority to execute it right now)

Task governance should mirror this separation: `TaskAssignment` is the work item; `DispatchPacket` is the lease.

### Relationship to Existing Zones

The Dispatch Zone fits into the Narada topology as follows:

```
Recommendation ──[promotion]──> Assignment ──[pickup]──> Dispatch ──[begin]──> Execution ──[report]──> Review/Closure
```

- Dispatch is **advisory** in the same sense as `Work → Evaluation`: it is an intermediate state that proves a handoff occurred, but the canonical commitment happens at the next zone boundary (Execution → Review/Closure).
- Dispatch is **not** a new canonical crossing in the core pipeline. It is a task-governance-local zone, analogous to how `Recommendation` is a task-governance-local zone.

### Invariants

1. **At most one active dispatch packet per assignment.** An assignment may have multiple historical dispatch packets (expired, released), but at most one with `dispatch_status: 'picked_up'` or `'renewed'`.
2. **Lease expiry is bounded.** Default lease is 30 minutes. Heartbeat renewal extends by 15 minutes. Maximum lease is 4 hours.
3. **Re-dispatch requires assignment validity.** A task may be re-dispatched only if the underlying assignment is still unreleased. If the assignment is released, a new assignment is required.
4. **Dispatch does not mutate task specification.** The `DispatchPacket.context` is a read-only view of the task spec. The agent may read it but cannot mutate it through the dispatch surface.
5. **Pickup is idempotent.** Repeated pickup attempts for the same assignment by the same agent produce the same packet (same `packet_id`) if the prior packet is still valid.

### Deferred / Out of Scope

| Item | Why Deferred |
|------|-------------|
| **Concrete `DispatchPacket` schema** | Task 571 will define the exact TypeScript schema and persistence shape |
| **SQLite table for dispatch** | Task 572 will add the table and read/write surface |
| **Heartbeat/renewal mechanism** | Requires a daemon or cron; deferred to runtime automation |
| **Automatic re-dispatch on expiry** | Requires scheduler logic; deferred to Task 572+ |
| **Integration with control-plane leases** | Control-plane `work_item_leases` are a separate substrate; unification is future work |

### Verification Evidence

- Zone boundary is defined with three distinct zones ✅
- Assignment, dispatch, and execution are not collapsed ✅
- Two crossings are explicit with six-field regime declarations ✅
- Rationale for why assignment alone is insufficient is documented ✅
- Invariants are explicit and bounded ✅
- `pnpm verify`: 5/5 steps pass ✅
- `pnpm typecheck`: all 11 packages clean ✅

---

**Closed by:** a2  
**Closed at:** 2026-04-24
