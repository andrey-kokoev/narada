# Decision: PrincipalRuntime Integration Contract

**Date:** 2026-04-22
**Task:** 412
**Depends on:** 406 (Principal Runtime State Machine), 410 (Construction Operation Boundary Contract), 411 (Assignment Planner Design)
**Chapter:** Construction Operation (410–415)
**Verdict:** **Contract accepted. Planner may consume PrincipalRuntime state as advisory input.**

---

## 1. Aim Statement

Define how `PrincipalRuntime` state (Decision 406) integrates with task governance (`packages/layers/cli/src/lib/task-governance.ts`) and assignment recommendation (Task 411) **without collapsing the ephemeral/durable boundary**.

The contract preserves three distinct layers:

| Layer | Durability | Owner | Authority |
|-------|------------|-------|-----------|
| **Task graph** | Durable (file-backed) | Task governance | Authoritative for task lifecycle |
| **Roster** | Durable (file-backed) | Operator / task governance | Advisory tracking of assignments |
| **PrincipalRuntime** | Ephemeral / cached | Console / agent runtime | Advisory signal for availability |

> **Golden rule:** If all PrincipalRuntime records are deleted, assignment recommendations must still be producible from the task graph and roster alone. The planner degrades gracefully; it does not fail.

---

## 2. Data Flow

### 2.1 Planner Inputs (Read-Only)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Assignment Planner (Task 411)               │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Task Graph  │  │    Roster    │  │ PrincipalRuntime     │  │
│  │  (*.md files)│  │(roster.json) │  │ Registry (ephemeral) │  │
│  │  ─────────── │  │ ──────────── │  │ ──────────────────── │  │
│  │  • status    │  │ • agent_id   │  │ • state              │  │
│  │  • depends_on│  │ • status     │  │ • scope_id           │  │
│  │  • affinity  │  │ • task       │  │ • budget_remaining   │  │
│  │  • title     │  │ • capabilities│  │ • can_claim_work    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                     │              │
│         └─────────────────┴─────────────────────┘              │
│                           │                                    │
│                    ┌──────▼──────┐                             │
│                    │  Ranking    │                             │
│                    │  Algorithm  │                             │
│                    └──────┬──────┘                             │
│                           │                                    │
│                    ┌──────▼──────┐                             │
│                    │Recommendation│ ← advisory, no authority   │
│                    │  (ordered)   │                             │
│                    └─────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Directionality Rules

| Source | Direction | Mutability | Planner Action |
|--------|-----------|------------|----------------|
| Task graph (`*.md`) | → Planner | Read-only | Parse status, dependencies, affinity |
| Roster (`roster.json`) | → Planner | Read-only | Map agent capabilities, read assignment status |
| PrincipalRuntime registry | → Planner | **Read-only** | Filter by availability, budget, attachment |
| Planner | → Operator | Write (advisory) | Emit recommendation record; **never** mutate task file or roster |

**No reverse arrows.** The planner never writes to:
- Task files (status, affinity)
- Roster (`status`, `task`)
- PrincipalRuntime registry (state transitions)

---

## 3. Conflict Resolution

### 3.1 Conflict Scenarios

| Scenario | Roster Says | PrincipalRuntime Says | Resolution |
|----------|-------------|----------------------|------------|
| **A** | `working` on task T | `detached` / `stale` | **Roster wins for historical record; PrincipalRuntime wins for availability.** Recommendation: principal is not available for new work. Existing claim remains valid until operator releases. |
| **B** | `idle` | `executing` | **PrincipalRuntime wins for availability; roster is stale.** Recommendation: principal is busy, do not assign new work. Log warning that roster is out of date. |
| **C** | `working` on task T | `available` (no attachment) | **Roster wins for claim record; PrincipalRuntime wins for availability.** Principal lost attachment but claim persists. Recommend operator review — possible stale claim. |
| **D** | `blocked` | `attached_interact` | **Roster wins for classification; PrincipalRuntime wins for capability.** Principal is online but roster marks blocked (e.g., dependency wait). Do not recommend new work. |
| **E** | Agent A not in roster | `available` in PrincipalRuntime | **Roster wins for identity.** Unrostered principals are invisible to the planner. Log warning: orphaned PrincipalRuntime. |
| **F** | Roster file missing / corrupt | PrincipalRuntime has entries | Degrade to roster-less mode: recommend based on task graph + PrincipalRuntime availability only. Log severe warning. |

### 3.2 Resolution Heuristic

```
FOR each runnable task:
  FOR each agent in roster (ordered by affinity):
    IF agent roster.status == 'blocked' → SKIP
    IF agent not found in PrincipalRuntime → USE roster state (degraded)
    IF PrincipalRuntime.state in UNAVAILABLE_STATES → SKIP
    IF PrincipalRuntime.budget_remaining is low → WARN, but do not block
    IF PrincipalRuntime.can_claim_work == false → SKIP
    IF PrincipalRuntime.active_work_item_id exists → SKIP (busy)
    ADD to recommendation list with confidence score
```

**Conservative principle:** When in doubt, skip the agent. The operator may manually override. The planner must never recommend an agent that PrincipalRuntime says is `unavailable`, `stale`, `failed`, or `budget_exhausted`.

---

## 4. Availability Model

### 4.1 PrincipalRuntime States and Recommendation Eligibility

| State | Eligible for Recommendation? | Rationale |
|-------|------------------------------|-----------|
| `unavailable` | ❌ No | Booting, offline, or health check failing |
| `available` | ✅ Yes | Ready, no attachment, can accept work |
| `attached_observe` | ❌ No | Read-only mode; cannot claim work (`canClaimWork` returns false) |
| `attached_interact` | ✅ Yes | Interactive mode; may claim work |
| `claiming` | ⚠️ No (transient) | In the middle of requesting a lease; race-prone |
| `executing` | ❌ No | Already has active work |
| `waiting_review` | ❌ No | Awaiting governance; not free for new work |
| `detached` | ❌ No | Voluntarily disconnected; may reattach soon |
| `stale` | ❌ No | Attachment broken; principal may not be reachable |
| `budget_exhausted` | ❌ No | Cannot perform work until budget reset |
| `failed` | ❌ No | Unrecoverable error; operator intervention required |

### 4.2 Mapping to Roster Status

| Roster Status | Typical PrincipalRuntime State | Recommendation Behavior |
|---------------|-------------------------------|------------------------|
| `idle` | `available`, `detached` | Eligible if `available` |
| `working` | `attached_interact`, `claiming`, `executing`, `waiting_review` | Not eligible for new work |
| `reviewing` | `attached_observe`, `attached_interact` | Not eligible for new work |
| `blocked` | `attached_interact`, `available` | Not eligible (operator classification) |
| `done` | `available`, `detached` | Eligible if `available` |

### 4.3 Invariant Preservation

The availability model respects all six PrincipalRuntime invariants from Decision 406:

1. **State does not grant authority** ✅ — The planner only uses state to filter recommendations. Actual claiming still requires `claim` authority from the roster/authority envelope.
2. **Attachment does not imply lease** ✅ — `attached_interact` makes an agent eligible, but the scheduler (not the planner) grants the lease.
3. **Lease does not imply broad authority** ✅ — The planner is unaware of lease state. It only knows `can_claim_work`.
4. **Budget exhaustion creates handoff** ✅ — `budget_exhausted` principals are excluded from recommendations.
5. **Principal memory is advisory** ✅ — The planner does not consume learned preferences from PrincipalRuntime.
6. **Deleting records is safe** ✅ — If PrincipalRuntime is missing, the planner falls back to roster state (degraded but functional).

---

## 5. Budget / Handoff Model

### 5.1 Budget Surfaces in Recommendations

PrincipalRuntime carries `budget_remaining` and `budget_unit`. The planner uses this as an **advisory signal**, not a hard gate:

| Condition | Planner Behavior |
|-----------|-----------------|
| `budget_remaining === null` | No budget data; proceed normally |
| `budget_remaining > threshold` | Healthy; recommend normally |
| `budget_remaining <= threshold && budget_remaining > 0` | Low budget; include in recommendation with `budget_warning: true` |
| `budget_remaining <= 0` | Exclude from recommendations (treat as `budget_exhausted`) |

**Threshold defaults:**
- Tokens: 20% of typical task cost (advisory; operator-configurable)
- Seconds: 5 minutes remaining
- Cost cents: $0.50 remaining

### 5.2 Handoff on Budget Exhaustion

When a principal transitions to `budget_exhausted` while holding work:

1. **Scheduler releases the lease** (normal lease timeout/recovery).
2. **Work item returns to `opened` or `failed_retryable`** (scheduler-owned).
3. **Planner excludes the exhausted principal** from future recommendations for that work item.
4. **`continuation_affinity` may hint at the exhausted principal** — advisory; another principal may claim it.
5. **Operator sees budget exhaustion in observation surface** — as a warning, not an error.

```
PrincipalRuntime: budget_exhausted
         │
         ▼
Scheduler: recoverStaleLeases() releases lease
         │
         ▼
Work item: status → opened (durable)
         │
         ▼
Planner: next recommendation excludes this principal
         │
         ▼
Operator: sees "budget exhausted — work returned to pool"
```

### 5.3 No Auto-Reset

The planner **does not** auto-reset budgets, transition principals out of `budget_exhausted`, or recommend budget top-ups. Budget reset is an operator action (billing console, config change, or explicit `narada principal reset-budget`).

---

## 6. Observation Surface Design

### 6.1 What the Operator Sees

The integrated observation surface shows three columns side by side:

```
┌─────────────────┬─────────────────┬─────────────────────────────┐
│  Task Graph     │  Roster         │  PrincipalRuntime (live)    │
│  (authoritative)│  (advisory)     │  (advisory, may be stale)   │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ Task 412        │ agent: alpha    │ alpha: attached_interact    │
│ status: claimed │ status: working │ scope: local                │
│ assigned: alpha │ task: 412       │ budget: 12k tokens          │
│                 │                 │ work_item: wi_412_1         │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ Task 413        │ agent: beta     │ beta: available             │
│ status: opened  │ status: idle    │ scope: —                    │
│                 │                 │ budget: 50k tokens          │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

### 6.2 Visual Indicators for Conflict

| Indicator | Meaning |
|-----------|---------|
| ⚠️ Roster stale | Roster says `working`, PrincipalRuntime says `available` or `detached` |
| 🚫 Unavailable | PrincipalRuntime says `unavailable`, `stale`, `failed`, or `budget_exhausted` |
| 💰 Low budget | `budget_remaining` below threshold |
| ❓ Missing runtime | Agent in roster but no PrincipalRuntime record found |

### 6.3 CLI Surface

```bash
# Integrated view (new, Task 411/412)
narada task recommend --integrated    # shows task + roster + runtime state

# PrincipalRuntime-only view (existing, Task 406)
narada principal list
narada principal status <id>

# Roster-only view (existing, Task 385)
narada task roster show
```

The `--integrated` flag is the only new surface. It is **read-only** and **advisory**.

---

## 7. Package Boundaries

No package boundaries change. The integration is a **consumer relationship**:

| Package | Role in Integration |
|---------|---------------------|
| `packages/layers/control-plane/src/principal-runtime/` | Produces ephemeral state; exposes `PrincipalRuntimeRegistry` interface |
| `packages/layers/cli/src/lib/task-governance.ts` | Produces durable task/roster state; exposes `AgentRoster`, `ChapterTaskInfo` |
| `packages/layers/cli/src/commands/task-recommend.ts` (Task 411) | Consumes both; produces advisory recommendation |

**No new dependencies.** The planner imports types from both packages but does not introduce a circular dependency.

---

## 8. Explicit Non-Goals (Preserved from Task 412)

| Non-Goal | Why Preserved |
|----------|---------------|
| **Do not implement integration code** | This is a design contract. Implementation is Task 411 + subsequent wiring tasks. |
| **Do not make PrincipalRuntime authoritative** | Task files remain the authority. PrincipalRuntime is advisory signal only. |
| **Do not auto-transition principals** | PrincipalRuntime transitions are self-owned or console-owned. Task state does not drive them. |
| **Do not merge roster and PrincipalRuntime** | Roster = durable identity + assignment tracking. PrincipalRuntime = ephemeral live state. They remain separate objects. |
| **Do not add new AGENTS.md sections** | Package boundaries unchanged; no new navigation needed. |

---

## 9. Acceptance Criteria

- [x] Decision artifact exists at `.ai/decisions/20260422-412-principal-runtime-integration-contract.md`.
- [x] Data flow diagram shows read-only consumption from PrincipalRuntime.
- [x] Conflict resolution rules are explicit and conservative (favor operator knowledge / roster history).
- [x] Availability model respects the six PrincipalRuntime invariants from Decision 406.
- [x] Budget/handoff model defines how exhaustion surfaces without auto-recovery.
- [x] Observation surface is read-only and advisory.
- [x] No implementation code is added.
- [x] No package boundary changes; AGENTS.md update not required.
- [x] No derivative task-status files are created.
