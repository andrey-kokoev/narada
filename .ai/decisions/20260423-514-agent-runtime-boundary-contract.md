# Decision: Agent Runtime Boundary Contract

**Date:** 2026-04-23
**Task:** 514
**Depends on:** 409 (Implicit State Machine Inventory), 412 (PrincipalRuntime Integration Contract), 444 (Task Governance / PrincipalRuntime Bridge)
**Chapter:** Agent Runtime First-Class Modeling (514–517)
**Verdict:** **Contract accepted. Agent runtime is a composition layer, not a new authority boundary.**

---

## 1. Problem Statement

Narada has rich runtime machinery for agents (PrincipalRuntime, AgentSession, AgentTrace, task governance, roster, assignment) but no single document that maps these pieces onto the canonical Narada ontology. This leads to:

- **Authority confusion**: Agents sometimes treated as principals, sometimes as workers, sometimes as operators — without explicit rules for when each framing applies.
- **Boundary drift**: New agent-facing features risk bypassing existing governance (Foreman, Scheduler, IntentHandoff) because "agent" is not explicitly bound to the control-cycle phase model.
- **Ephemeral/durable collapse**: PrincipalRuntime is advisory by design, but task governance is durable. The bridge between them (Decision 444) is implemented but not formally mapped to the Narada object model.
- **Missing legibility**: An external observer cannot determine from code alone what an "agent" is allowed to do, what state it occupies, or how its actions relate to the bounded Control Cycle.

This contract defines the agent runtime **in Narada terms** — mapping every agent-facing concept to an existing canonical object, zone, or authority class — without introducing new authority boundaries.

---

## 2. Core Thesis

> **An agent runtime is not a new layer in Narada. It is a composition of existing concepts observed through a principal-shaped lens.**

The agent runtime boundary is a **read model** and **advisory signal surface** over durable control-plane state. It does not own any authority. It may:

- Observe durable state (task files, work items, evaluations)
- Emit advisory signals (PrincipalRuntime state, health classification)
- Append non-authoritative traces (agent_traces)
- Request operator actions (via operator_action_requests)

It may **not**:

- Create work items directly
- Claim or release leases
- Create foreman decisions
- Create outbound commands or intents
- Mutate task lifecycle state except through governed operators
- Bypass the Control Cycle phase model

---

## 3. Agent Runtime Object → Narada Concept Mapping

### 3.1 Complete Mapping Table

| Agent Runtime Term | Narada Canonical Concept | Location | Durability | Authority |
|-------------------|-------------------------|----------|------------|-----------|
| **Agent** | `Principal` of type `"agent"` | `principal-runtime/types.ts` | Identity: durable (roster); Runtime: ephemeral (registry) | `propose` (charter output), `execute` (if granted lease) |
| **Operator** | `Principal` of type `"operator"` | `principal-runtime/types.ts` | Identity: durable (roster); Runtime: ephemeral | `admin`, `execute`, `resolve`, `derive`, `confirm` (posture-dependent) |
| **Worker** | `Principal` of type `"worker"` | `principal-runtime/types.ts` | Identity: durable (config); Runtime: ephemeral | `execute` (bounded by charter/tool catalog binding) |
| **Session** | `AgentSession` | `coordinator/types.ts` | **Durable** — SQLite `agent_sessions` | Foreman (creation), Scheduler (lifecycle) |
| **Assignment** | `TaskAssignmentRecord` + roster entry | `cli/src/lib/task-governance.ts` | **Durable** — `.ai/agents/assignments.json` + `roster.json` | Task governance operators |
| **Work item** | `WorkItem` | `coordinator/types.ts` | **Durable** — SQLite `work_items` | Scheduler (leases), Foreman (resolution) |
| **Execution** | `ExecutionAttempt` | `coordinator/types.ts` | **Durable** — SQLite `execution_attempts` | Scheduler + executor |
| **Evaluation** | `Evaluation` | `coordinator/types.ts` | **Durable** — SQLite `evaluations` | Charter runtime (`propose`) + Foreman (`resolve`) |
| **Report** | `WorkResultReport` (task file artifact) | Task file body | **Durable** — task file markdown | Agent (author), Reviewer (verdict) |
| **Trace** | `AgentTrace` | `agent/traces/types.ts` | **Durable** — SQLite `agent_traces` | Advisory / read-only |
| **Health** | `PrincipalRuntimeHealth` + `SiteHealthRecord` | `principal-runtime/types.ts`, `health.ts` | Ephemeral (PR) / Durable (Site) | Advisory signal |
| **Budget** | `PrincipalRuntime.budget_remaining` | `principal-runtime/types.ts` | Ephemeral (registry) | Advisory signal |
| **Attachment** | `PrincipalRuntime` state + `AgentSession` linkage | `principal-runtime/state-machine.ts` | Runtime: ephemeral; Session: durable | Self (attach/detach via CLI) |
| **Claim** | `WorkItemLease` acquisition request | `scheduler/scheduler.ts` | **Durable** — SQLite `work_item_leases` | Scheduler grants; PrincipalRuntime filters eligibility |

### 3.2 What Each Mapping Means

**Agent → Principal (`principal_type: "agent"`)**

An agent is a `Principal` with a persistent identity in the roster and an ephemeral runtime record. The agent does not exist as a separate ontological category. What distinguishes an "agent" from an "operator" or "worker" is:

- Its authority envelope (agents typically hold `propose` + `execute`, not `admin`)
- Its attachment behavior (agents attach in `interact` mode to claim work)
- Its lifecycle binding (agents produce `WorkResultReport`s and await review)

**Session → `AgentSession`**

A session is not a chat conversation. It is a **durable operator-facing interpretive record** anchored to a `work_item_id`. Sessions survive agent restarts because they live in the coordinator SQLite. The `resume_hint` field carries continuity context across agent invocations.

**Assignment → `TaskAssignmentRecord` + roster**

The operational assignment ("who is working on what") is stored separately from the task lifecycle state. This is intentional: an agent may be assigned in the roster without the task being `claimed`, and vice versa. The bridge (Decision 444) keeps them in sync as an advisory side effect.

**Trace → `AgentTrace`**

Agent traces are commentary, not authority. Removing all traces from the system leaves all durable boundaries intact. Traces are anchored to `execution_id` (not `work_item_id` or `session_id`) because execution is the canonical unit of agent work.

---

## 4. Authority Boundaries

### 4.1 What the Agent Runtime May Do

| Action | Mechanism | Authority Required | Durable Effect |
|--------|-----------|-------------------|----------------|
| Observe task state | Read task files, roster, assignments | None (inspection) | None |
| Observe control-plane state | Query `CoordinatorStoreView` | None (inspection) | None |
| Produce charter output | Run charter runtime with bounded envelope | `propose` | Creates `Evaluation` (if foreman admits) |
| Request work | Call `canClaimWork()` → request lease | `claim` (scheduler grants) | Creates `WorkItemLease` (if scheduler admits) |
| Execute leased work | Run tools within granted lease | `execute` | Updates `ExecutionAttempt` status |
| Submit report | Write to task file body | None (task file mutation via governance) | Updates task file |
| Append trace | Call `AgentTraceStore.writeTrace()` | None (advisory append) | Creates `AgentTrace` row |
| Request operator action | Emit `operator_action_request` | None (request, not approval) | Creates pending request |
| Attach/detach self | `principal attach/detach` CLI | Self (runtime identity) | Updates ephemeral `PrincipalRuntime` |

### 4.2 What the Agent Runtime Must NOT Do

| Forbidden Action | Why Forbidden | Correct Path |
|-----------------|---------------|--------------|
| Create `work_item` rows directly | Foreman owns work opening (AGENTS.md Invariant 6) | Produce charter output → foreman governance → work opening |
| Create `foreman_decision` rows | Foreman owns evaluation resolution (Invariant 7) | Produce evaluation → foreman `resolveWorkItem()` |
| Insert `outbound_handoff` rows | `OutboundHandoff` owns intent creation (Invariant 10) | Foreman decision → `IntentHandoff.admitIntentFromDecision()` |
| Mutate task status directly | Task governance operators own lifecycle | Use `task claim`, `task report`, `task release`, `task finish` |
| Claim/release leases directly | Scheduler owns mechanical lifecycle (Invariant 9) | Request lease via scheduler; scheduler grants/releases |
| Delete or mutate historical traces | Traces are append-only audit commentary | Append new trace with correction context |
| Bypass `executeOperatorAction()` for mutations | UI cannot become hidden authority (Invariant 21) | Route all mutations through audited operator-action path |
| Override authority class checks | Authority is not derived from principal state | Authority is derived from config binding + posture + explicit challenge |

### 4.3 The Golden Rule

> **PrincipalRuntime state does not grant authority.**
>
> A principal in `executing` state may still be blocked by policy. A principal in `attached_interact` may still lack `claim` authority for a given work item. The scheduler checks authority independently of PrincipalRuntime state. PrincipalRuntime is an **eligibility filter**, not an **authority source**.

---

## 5. Agent Runtime vs Control Cycle Phase Model

Every agent action maps to one or more Control Cycle phases (SEMANTICS.md §2.14.7):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Control Cycle Phases                               │
├─────────────┬───────────────────────────────────────────────────────────────┤
│ Phase       │ Agent Runtime Role                                            │
├─────────────┼───────────────────────────────────────────────────────────────┤
│ 1. Read     │ Agent does not directly read sources; Site/Cycle does         │
│ 2. Admit    │ Agent observes admitted facts via observation API             │
│ 3. Form     │ Agent does not form contexts; foreman context strategy does   │
│ 4. Evaluate │ Agent runs charter → produces `Evaluation` (if granted lease) │
│ 5. Govern   │ Agent does not govern; foreman resolves evaluations           │
│ 6. Handoff  │ Agent does not handoff; foreman + IntentHandoff create intent │
│ 7. Execute  │ Agent executes tools within granted lease → `ExecutionAttempt`│
│ 8. Confirm  │ Agent does not confirm; reconciler observes external state    │
│ 9. Trace    │ Agent appends `AgentTrace` records (advisory commentary)      │
└─────────────┴───────────────────────────────────────────────────────────────┘
```

**Key insight**: Agents participate primarily in phases 4 (Evaluate) and 7 (Execute), with advisory participation in phase 9 (Trace). All other phases are owned by kernel components (source adapter, foreman, scheduler, outbound workers, reconciler).

---

## 6. Composition Architecture

The agent runtime is a **composition layer** over existing kernel and CLI components:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Agent Runtime Composition                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │ Task Graph  │  │   Roster    │  │ Principal   │  │ AgentSession    │    │
│  │ (*.md)      │  │ (roster.json)│  │ Runtime     │  │ (SQLite)        │    │
│  │ ─────────── │  │ ─────────── │  │ (ephemeral) │  │ ─────────────── │    │
│  │ Durable     │  │ Durable     │  │ Advisory    │  │ Durable         │    │
│  │ Governance  │  │ Operational │  │ Eligibility │  │ Interpretive    │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘    │
│         │                │                │                   │             │
│         └────────────────┴────────────────┴───────────────────┘             │
│                                   │                                         │
│                    ┌──────────────▼──────────────┐                          │
│                    │   Assignment Planner        │  ← Task 411, Decision 412│
│                    │   (recommendation engine)   │                          │
│                    └──────────────┬──────────────┘                          │
│                                   │                                         │
│         ┌─────────────────────────┼─────────────────────────┐               │
│         ▼                         ▼                         ▼               │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐       │
│  │ Task Claim  │           │ Task Report │           │ Principal   │       │
│  │ (governed)  │           │ (governed)  │           │ Bridge      │       │
│  └─────────────┘           └─────────────┘           └─────────────┘       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Kernel Durable Boundaries                        │   │
│  │  Fact → Context → WorkItem → Evaluation → Decision → Intent → Exec   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Composition invariants:**

1. The agent runtime never writes directly to kernel durable boundaries.
2. All agent-runtime → kernel interactions route through governed operators or scheduler claims.
3. The agent runtime may read from any observation surface.
4. PrincipalRuntime is the only agent-runtime-specific component; everything else is shared kernel or CLI machinery.

---

## 7. In-Scope for Agent Runtime Modeling

| # | Boundary | Rationale |
|---|----------|-----------|
| 1 | **PrincipalRuntime as eligibility filter** | Already implemented (Task 406); this contract validates its role |
| 2 | **Task governance → PrincipalRuntime bridge** | Already implemented (Task 444); this contract maps it to canonical phases |
| 3 | **AgentSession as durable interpretive record** | Already implemented; this contract clarifies its relationship to work items |
| 4 | **AgentTrace as advisory commentary** | Already implemented; this contract anchors it to execution_id |
| 5 | **Roster as operational source of truth** | Already implemented; this contract distinguishes it from task lifecycle |
| 6 | **Assignment record as durable claim evidence** | Already implemented; this contract maps it to WorkItemLease semantics |
| 7 | **Authority class enforcement per principal type** | Already implemented (Task 406); this contract documents the mapping |
| 8 | **Self-governance boundary** | Already implemented (Decision 510); this contract places it in the phase model |

### 7.1 Out-of-Scope (Deferred to Tasks 515–517)

| # | Boundary | Why Deferred |
|---|----------|--------------|
| 1 | **Architect-Operator pair model** | Task 515 — requires role semantics beyond principal types |
| 2 | **Agent swarm coordination** | Task 516 — multi-agent scheduling not yet needed |
| 3 | **Cross-agent communication surface** | Task 516 — no runtime messaging layer exists |
| 4 | **Agent capability envelope negotiation** | Task 517 — dynamic tool catalog binding deferred |
| 5 | **Agent memory / learning persistence** | Task 517 — learning artifacts are advisory only (Decision 396) |
| 6 | **Generic "Agent" abstraction** | Deferred — `Principal` with `principal_type` is sufficient for v0 |

---

## 8. Interface Contract

### 8.1 Agent Runtime Query Surface (Read-Only)

```typescript
// packages/layers/control-plane/src/observability/types.ts (existing)

/** Observation-facing view of agent runtime state */
export interface AgentRuntimeView {
  /** Principals attached to this scope */
  principals: PrincipalRuntimeSnapshot[];

  /** Active sessions for this scope */
  sessions: AgentSession[];

  /** Recent traces for this scope */
  recentTraces: AgentTrace[];

  /** Work items currently leased to agents */
  activeWorkItems: WorkItem[];

  /** Health classification per principal */
  principalHealth: PrincipalRuntimeHealth[];
}
```

### 8.2 Agent Runtime Mutation Surface (Governed Only)

```typescript
// All mutations route through existing operators:

// Task governance (CLI)
taskClaimCommand(options)      // claim → creates assignment + updates task
taskReportCommand(options)     // report → appends to task file
taskReleaseCommand(options)    // release → closes assignment
taskFinishCommand(options)     // finish → report + roster done + evidence check

// Principal runtime (CLI)
principalAttachCommand(options)  // attach → ephemeral PR state
principalDetachCommand(options)  // detach → ephemeral PR state

// Bridge (post-commit advisory)
updatePrincipalRuntimeFromTaskEvent(stateDir, event)  // best-effort PR sync
```

### 8.3 Scheduler Integration Point

```typescript
// Scheduler consults PrincipalRuntime when granting leases (advisory only)

// packages/layers/control-plane/src/scheduler/scheduler.ts (existing pattern)
function isPrincipalEligibleForWork(
  principal: PrincipalRuntime,
  workItem: WorkItem,
): boolean {
  return (
    canClaimWork(principal.state) &&
    principal.scope_id === workItem.scope_id &&
    principal.budget_remaining !== 0 &&
    principal.state !== "stale" &&
    principal.state !== "failed"
  );
}
```

> **Note:** The scheduler may ignore this check. It is an advisory filter, not a mandatory gate. The scheduler's own authority checks (lease uniqueness, work-item status) remain authoritative.

---

## 9. Verification

This contract is verified by inspection against existing code:

| Claim | Evidence | Status |
|-------|----------|--------|
| PrincipalRuntime is advisory | `principal-runtime/types.ts`: "Ephemeral by design — if all records deleted, Sites continue" | ✅ Verified |
| AgentSession is durable | `coordinator/types.ts`: `AgentSession` stored in SQLite; survives restart | ✅ Verified |
| AgentTrace is commentary | `agent/traces/types.ts`: "Traces are commentary, not authority" | ✅ Verified |
| Task governance owns lifecycle | `task-governance.ts`: `isValidTransition`, `writeTaskFile` enforce state machine | ✅ Verified |
| Bridge is unidirectional | `principal-bridge.ts`: "Task Governance → PrincipalRuntime (advisory/post-commit)" | ✅ Verified |
| Scheduler owns leases | `scheduler/scheduler.ts`: `insertLease`, `releaseLease` — no agent direct access | ✅ Verified |
| Foreman owns work opening | `foreman/facade.ts`: `onContextsAdmitted()` is sole work-item insert path | ✅ Verified |
| Authority not from PR state | `state-machine.ts`: `canClaimWork()` is eligibility, not authority | ✅ Verified |

---

## 10. Cross-References

| Document | Relationship |
|----------|--------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Aim / Site / Cycle / Act / Trace definitions; portable invariant spine |
| [`SEMANTICS.md §2.14.7`](../../SEMANTICS.md) | Control Cycle phase vocabulary — agent actions map to phases 4, 7, 9 |
| [`SEMANTICS.md §2.15`](../../SEMANTICS.md) | Crossing regime — agent runtime does not introduce new zones |
| [`AGENTS.md`](../../AGENTS.md) | Kernel invariants 6–18 that agent runtime must not violate |
| [`.ai/decisions/20260422-406-principal-runtime-state-machine.md`](20260422-406-principal-runtime-state-machine.md) | PrincipalRuntime design (11 states, 4 types, transition validation) |
| [`.ai/decisions/20260422-412-principal-runtime-integration-contract.md`](20260422-412-principal-runtime-integration-contract.md) | Planner integration contract (read-only, no collapse) |
| [`.ai/decisions/20260422-444-task-governance-principal-runtime-bridge.md`](20260422-444-task-governance-principal-runtime-bridge.md) | Unidirectional bridge: Task Governance → PrincipalRuntime |
| [`.ai/task-contracts/agent-task-execution.md`](../../.ai/task-contracts/agent-task-execution.md) | Agent-facing execution contract (roster, reports, closure) |
| `packages/layers/control-plane/src/principal-runtime/` | Implementation of PrincipalRuntime state machine and registry |
| `packages/layers/control-plane/src/agent/traces/` | Implementation of AgentTrace store and types |
| `packages/layers/cli/src/lib/principal-bridge.ts` | Implementation of Task Governance → PrincipalRuntime bridge |
