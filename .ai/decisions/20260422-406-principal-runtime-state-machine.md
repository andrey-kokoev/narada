# Decision: Principal Runtime State Machine

**Date:** 2026-04-22
**Task:** 406
**Depends on:** 397 (Session Attachment Semantics), 385 (Mechanical Agent Roster)
**Verdict:** **Design accepted — bounded implementation was added in the same task.**

---

## Summary

Narada now has a canonical `PrincipalRuntime` concept: a first-class state machine for runtime actors that carries attention, availability, budget, attachment posture, and authority envelope across Sites and work items without collapsing any of those dimensions into one another.

The core insight is a **six-layer separation** of everything that tends to be conflated when an "agent" or "operator" interacts with a Site:

1. **`Principal` identity** — who the actor is (static, roster-bound)
2. **`PrincipalRuntime` state** — what the actor is doing right now (ephemeral, attention-bearing)
3. **`SiteAttachment`** — the connection between actor and Site (ephemeral, transport-layer)
4. **`AgentSession`** — durable trace of one execution attempt (kernel, work-item-bound)
5. **`work_item_lease`** — scheduler's exclusive grant for one work item (durable, authority-bearing)
6. **`authority envelope`** — policy-governed capability binding (config + runtime, permission-bearing)

These six layers must never collapse into one another. In particular: **PrincipalRuntime state does not grant authority. Attachment does not imply lease. Lease does not imply broad authority.**

---

## 1. Name Justification

### Why `PrincipalRuntime`?

| Candidate | Why it was rejected | What it conflates |
|-----------|--------------------:|-------------------|
| `Principal` | Too broad. In security semantics, a Principal is an identity that *can* hold authority. We need the runtime state, not the identity. | Identity + authority |
| `Actor` | Too generic. "Actor model" implies message-passing concurrency and mailboxes. Narada principals are not actors in that sense. | Concurrency model + runtime role |
| `Agent` | Already overloaded. Narada uses "agent" for charter runners, operator agents, and AI agents. Adding another Agent concept would create triple overload. | Role + runtime + intelligence |
| `Operator` | Too human-specific. Charter runners and external services are not operators. | Human role + runtime state |
| `CharterRunner` | Too narrow. A CharterRunner is one specific kind of principal. We need a concept that covers human operators, process executors, and external services too. | Implementation role + general concept |

**`PrincipalRuntime` wins because:**
- `Principal` signals that this is about an actor/entity in the system
- `Runtime` signals that this is about live, transient state (attention, budget, mode)
- It does not claim identity (`Principal` alone does), role (`Agent`/`Operator`), or implementation (`CharterRunner`)
- It mirrors `CharterRuntime` (the existing `CharterRunner` + health envelope) without being subordinate to it

---

## 2. Object Boundary

### 2.1 The Six Layers

| Layer | Object | Owner | Durability | Grants Authority? | If Lost... |
|-------|--------|-------|------------|-------------------|------------|
| **Identity** | `Principal` | Operator registry / roster | Static / config | No | Re-create from roster; no state lost |
| **Runtime state** | `PrincipalRuntime` | Console / agent runtime | Ephemeral / cached | **No** | Reattach / respawn; Site continues |
| **Connection** | `SiteAttachment` | Console / agent runtime | Ephemeral | **No** | Reattach; Site continues |
| **Execution trace** | `AgentSession` | Site coordinator | **Durable** | **No** | Already persisted; replayable |
| **Scheduler grant** | `work_item_lease` | Scheduler | **Durable** | **Yes** — for this work item only | Recovered by `recoverStaleLeases()` |
| **Permission** | `authority envelope` | Policy / foreman | Config + runtime | **Yes** — capability binding | Enforced by policy preflight |
| **Construction roster** | `roster entry` | Task governance | File-backed | **No** | Rebuild from task files |

### 2.2 What `PrincipalRuntime` Is NOT

- **Not an identity system.** The `principal_id` comes from the roster or operator registry. `PrincipalRuntime` references it but does not define it.
- **Not a session manager.** `AgentSession` already tracks execution attempts. `PrincipalRuntime` tracks the actor's overall posture, not one execution.
- **Not an attachment record.** `SiteAttachment` tracks the transport connection. `PrincipalRuntime` may reference an attachment but survives attachment changes.
- **Not a lease.** The scheduler owns `work_item_leases`. `PrincipalRuntime` does not acquire, hold, or release leases.
- **Not authority.** Capability envelopes come from `RuntimePolicy` and authority class binding. `PrincipalRuntime` state does not add or remove capabilities.
- **Not a work item.** `PrincipalRuntime` is orthogonal to the work-item lifecycle. A principal may exist with zero work items, and work items exist with zero principals.

### 2.3 What `PrincipalRuntime` IS

`PrincipalRuntime` is the **live state of a runtime actor** — the envelope that carries:
- **Attention**: which Site(s) the principal is focused on
- **Availability**: whether the principal can accept new work
- **Budget**: token/time/cost remaining for this actor
- **Attachment posture**: observe vs. interact vs. detached
- **Activity**: claiming, executing, waiting, idle
- **Health**: whether the principal itself is responsive

This state is **ephemeral by design.** If all `PrincipalRuntime` records are deleted, the Site continues running correctly. The scheduler still assigns leases, the foreman still governs decisions, and workers still execute effects. Principals simply lose their "seat" and must re-establish runtime state when they reconnect.

---

## 3. State Machine

### 3.1 State Definitions

```
                    ┌─────────────────┐
         ┌─────────►│   unavailable   │◄────────┐
         │          │  (boot/offline) │         │
         │          └────────┬────────┘         │
         │                   │ ready            │
         │                   ▼                  │
         │          ┌─────────────────┐         │
         │          │    available    │         │
         │          │  (idle, ready)  │         │
         │          └────────┬────────┘         │
         │                   │ attach           │
         │         ┌─────────┴─────────┐        │
         │         ▼                   ▼        │
         │  ┌─────────────┐    ┌─────────────┐  │
         │  │attached_ob- │    │attached_in- │  │
         │  │   serve     │    │   teract    │  │
         │  │ (read-only) │    │ (control)   │  │
         │  └──────┬──────┘    └──────┬──────┘  │
         │         │                  │         │
         │         │    ┌─────────────┘         │
         │         │    │ claim                 │
         │         │    ▼                     fatal
         │         │  ┌─────────────────┐       │
         │         │  │    claiming     │       │
         │         │  │ (lease request) │       │
         │         │  └────────┬────────┘       │
         │         │           │ acquire        │
         │         │           ▼                │
         │         │  ┌─────────────────┐       │
         │         │  │    executing    │       │
         │         │  │ (lease held,    │       │
         │         │  │  eval running)  │       │
         │         │  └────────┬────────┘       │
         │         │           │ output         │
         │         │           ▼                │
         │         │  ┌─────────────────┐       │
         │         │  │ waiting_review  │       │
         │         │  │ (output pending │       │
         │         │  │  governance)    │       │
         │         │  └────────┬────────┘       │
         │         │           │ resolve        │
         │         └───────────┘                │
         │                     │                │
         │         ┌───────────┘                │
         │         │ detach                     │
         │         ▼                            │
         │  ┌─────────────────┐                 │
         └──┤    detached     │─────────────────┘
            │ (voluntary dc)  │
            └────────┬────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │  stale   │ │budget_ex-│ │  failed  │
  │(implicit │ │ hausted  │ │(unrecov- │
  │  break)  │ │          │ │  erable) │
  └──────────┘ └──────────┘ └──────────┘
```

### 3.2 State Descriptions

| State | Meaning | Entry Trigger | Exit Trigger |
|-------|---------|---------------|--------------|
| `unavailable` | Principal exists in roster but is not ready to accept work (booting, offline, config loading, health check failing) | Principal record created; principal crashed and is restarting | Config loaded; health check passes; operator brings principal online |
| `available` | Principal is ready but has no Site attachment | `unavailable → ready`; `detached` with no reattach; `stale` after recovery | Operator/agent attaches to a Site |
| `attached_observe` | Principal is connected to a Site in read-only mode | `available → attach` with `mode: observe` | Detach; upgrade to `interact`; Site crashes |
| `attached_interact` | Principal is connected to a Site with control capability | `available → attach` with `mode: interact`; upgrade from `observe` | Detach; downgrade to `observe`; Site crashes |
| `claiming` | Principal is requesting a work item lease from the scheduler | `attached_interact` + operator/agent requests work | Lease acquired → `executing`; lease denied → back to `attached_interact` |
| `executing` | Principal holds a lease and is running evaluation/execution | `claiming` + lease acquired | Evaluation complete → `waiting_review`; execution crashes → `failed` |
| `waiting_review` | Principal produced output; awaiting foreman governance or operator review | `executing` + output submitted | Foreman resolves → back to `attached_interact` or `available`; operator requests changes → back to `executing` |
| `detached` | Principal voluntarily disconnected from Site | `attached_observe` or `attached_interact` + explicit detach command | Reattach → `attached_*`; timeout without reattach → `stale` |
| `stale` | Attachment was implicitly broken (network failure, crash, heartbeat timeout) | `attached_*` + heartbeat lost; `detached` + timeout | Principal reattaches → `attached_*`; principal gives up → `available` or `unavailable` |
| `budget_exhausted` | Principal has depleted token/time/cost budget for this interaction | `executing` or `waiting_review` + budget ceiling hit | Budget reset → `attached_interact`; detach → `detached` |
| `failed` | Principal encountered unrecoverable error (charter crash, tool failure, config corruption) | `executing` + fatal error; health probe repeated failure | Operator resets → `unavailable` → `available`; permanent failure → principal removed from roster |

---

## 4. Transition Authority

### 4.1 Transition Table

| From | To | Trigger | Owner | Mutates Durable State? | Affects Lease? | Changes Authority? |
|------|----|---------|-------|------------------------:|----------------:|-------------------:|
| `unavailable` | `available` | Config loaded; health probe passes | Principal runtime (self) | No | No | No |
| `available` | `attached_observe` | Attach request with `mode: observe` | Operator console / agent runtime | No (attachment is ephemeral) | No | No |
| `available` | `attached_interact` | Attach request with `mode: interact` | Operator console / agent runtime | No | No | No |
| `attached_observe` | `attached_interact` | Upgrade request | Operator console (authority check) | No | No | No |
| `attached_interact` | `attached_observe` | Downgrade request; new interact attachment from other principal | Operator console / Site | No | No | No |
| `attached_interact` | `claiming` | Principal requests work item | Principal runtime (self) | No | No | No |
| `claiming` | `executing` | Scheduler grants lease | **Scheduler** | **Yes** (lease insert) | **Yes** | No |
| `claiming` | `attached_interact` | Scheduler denies lease; no runnable work | Scheduler | No | No | No |
| `executing` | `waiting_review` | Charter evaluation completes | Principal runtime (self) | **Yes** (evaluation persisted) | No | No |
| `executing` | `failed` | Unrecoverable error during execution | Principal runtime (self) | **Yes** (execution attempt marked crashed) | **Yes** (lease released) | No |
| `waiting_review` | `attached_interact` | Foreman resolves; no more work | **Foreman** | **Yes** (decision, work item status) | No | No |
| `waiting_review` | `executing` | Operator requests revision | Operator console | No | No | No |
| `attached_*` | `detached` | Explicit detach command | Operator console / agent runtime | No | No | No |
| `attached_*` | `stale` | Heartbeat timeout; network partition | Console heartbeat checker | No | No | No |
| `detached` | `stale` | Reattach timeout exceeded | Console heartbeat checker | No | No | No |
| `stale` | `attached_*` | Principal reattaches | Operator console / agent runtime | No | No | No |
| `stale` | `available` | Principal gives up; no reattach | Principal runtime (self) | No | No | No |
| `executing` | `budget_exhausted` | Token/time/cost ceiling hit | Principal runtime (self) | No | No | No |
| `waiting_review` | `budget_exhausted` | Token/time/cost ceiling hit | Principal runtime (self) | No | No | No |
| `budget_exhausted` | `attached_interact` | Budget reset | Operator console / billing | No | No | No |
| `budget_exhausted` | `detached` | Principal detaches voluntarily | Principal runtime (self) | No | No | No |
| `failed` | `unavailable` | Operator resets principal | Operator console | No | No | No |
| `failed` | (removed) | Permanent failure; principal decommissioned | Operator console | No | No | No |

### 4.2 Authority Rules for Transitions

1. **Only the Scheduler may transition `claiming → executing`.** The PrincipalRuntime may request a lease, but the scheduler decides whether to grant it. This preserves scheduler authority over work assignment.
2. **Only the Foreman may transition `waiting_review → attached_interact` (on resolve).** The PrincipalRuntime produced output; the foreman governs it. This preserves foreman authority over decisions.
3. **The PrincipalRuntime may self-transition to `failed` or `budget_exhausted`.** These are internal health/budget states. The PrincipalRuntime owns its own resource envelope.
4. **Attachment transitions are client-owned.** The operator console or agent runtime decides when to attach, detach, or upgrade. The Site does not initiate attachment transitions.
5. **Stale detection is console-owned.** The heartbeat checker (part of the console/registry layer) marks attachments stale. The Site does not track attachment heartbeats.

---

## 5. Invariant Preservation

### 5.1 Principal State Does Not Grant Authority

> **Invariant:** A `PrincipalRuntime` in any state (`executing`, `attached_interact`, etc.) cannot perform an action unless the action is permitted by the `authority envelope` (policy binding + capability class).

**Defense:**
- Every action request routes through `executeOperatorAction()` or equivalent, which checks authority class independently of PrincipalRuntime state.
- The scheduler grants leases based on work-item status and lease availability, not PrincipalRuntime state.
- The foreman governs evaluations based on policy, not on who produced them.

**Counter-example prevented:** A principal in `attached_interact` cannot approve a draft for send unless the principal's capability envelope includes `execute` authority for the `mail` vertical.

### 5.2 Attachment Does Not Imply Lease

> **Invariant:** A principal may be `attached_interact` to a Site while holding zero leases. A principal may hold a lease while having zero attachments.

**Defense:**
- `SiteAttachment` and `work_item_leases` are stored in different subsystems (console registry vs. Site coordinator SQLite).
- `scanForRunnableWork()` does not check attachment status. It checks work-item status and lease availability.
- `recoverStaleLeases()` recovers expired leases independently of attachment state.

**Counter-example prevented:** A network partition that makes an attachment stale does not release the lease. The lease becomes stale independently and is recovered by the scheduler.

### 5.3 Lease Does Not Imply Broad Authority

> **Invariant:** Holding a lease on one work item does not grant authority to mutate other work items, modify policy, or perform operator actions.

**Defense:**
- A lease is bound to exactly one `work_item_id`.
- The scheduler's `runnerId` identifies the worker family, not the principal's global authority.
- Operator actions require explicit authority class checks that are independent of lease ownership.

**Counter-example prevented:** A charter runner holding a lease on `wi_123` cannot retry `wi_456` or approve a draft for `wi_789`.

### 5.4 Budget Exhaustion Creates Continuation/Handoff State

> **Invariant:** When a principal reaches `budget_exhausted`, the system must preserve all durable state and make the work item available for another principal to claim. No work is lost or hidden.

**Defense:**
- Budget exhaustion triggers a self-transition to `budget_exhausted`. The lease is released (if held) by normal scheduler mechanisms.
- The work item returns to `opened` or `failed_retryable` status, making it discoverable by `scanForRunnableWork()`.
- `continuation_affinity` may hint at the exhausted principal, but the scheduler treats it as advisory — another principal may claim the work.

**Counter-example prevented:** Budget exhaustion does not silently drop the work item, mark it terminal, or hide it from the scheduler.

### 5.5 Principal Memory and Learned Preferences Remain Advisory

> **Invariant:** Any state learned by a principal (prompt memory, tool state, preference weights) is advisory unless separately accepted into durable policy or config.

**Defense:**
- `CharterInvocationEnvelope` is immutable. The charter runtime cannot mutate durable state.
- `AgentSession.resume_hint` is human-readable trace, not authority.
- `SiteAttachment.resume_context_json` is a projection from durable state, not a snapshot of principal memory.
- Learned preferences may be surfaced as advisory signals (§2.12) but never override policy or governance.

**Counter-example prevented:** A charter that "learned" to always escalate a certain sender cannot bypass the foreman's governance rules.

### 5.6 Removing PrincipalRuntime Records Must Not Destroy Durable State

> **Invariant:** Deleting all `PrincipalRuntime` records (crash, bug, deliberate cleanup) must leave facts, work items, decisions, intents, executions, and confirmations intact.

**Defense:**
- `PrincipalRuntime` state is stored outside the Site's coordinator SQLite (console registry or agent runtime state).
- The Site's durable state (facts, work items, decisions, etc.) is independent.
- If all PrincipalRuntime records are lost, the Site continues running. The scheduler assigns leases to the next available runner. The foreman governs decisions. Workers execute effects.
- Principals simply lose their "seat" and must re-establish runtime state.

**Counter-example prevented:** A console registry deletion does not abort in-flight executions, cancel pending outbound commands, or roll back foreman decisions.

---

## 6. Mapping Current Precursors

### 6.1 `.ai/agents/roster.json` (Task 385)

**Current:** File-backed roster tracking agent assignments, status, and capabilities.

**Future relationship:** The roster is the **static identity layer** for principals. Each roster entry (`agent_id`, `role`, `capabilities`) maps to a `Principal` identity. The `PrincipalRuntime` references the roster entry but does not replace it.

- `status: "working"` in roster → `PrincipalRuntime` is likely `attached_interact`, `claiming`, `executing`, or `waiting_review`
- `status: "idle"` in roster → `PrincipalRuntime` is `available` or `detached`
- `capabilities` in roster → seeds the `authority envelope` (with runtime policy overlay)

**Key rule:** Roster updates are operator tracking (advisory). PrincipalRuntime transitions are runtime mechanics. They may diverge temporarily (e.g., roster says "working" but PrincipalRuntime is `stale` due to network partition).

### 6.2 `task roster` CLI

**Current:** `narada task roster show/assign/review/done/idle` updates `.ai/agents/roster.json`.

**Future relationship:** Task roster commands update **Principal identity + assignment state**, not `PrincipalRuntime` state. A `task roster assign` does not attach the principal to a Site. The principal must separately `narada principal attach` to establish runtime state.

### 6.3 `AgentSession` (kernel)

**Current:** Durable trace record bound to a work_item. Tracks execution attempt lifecycle.

**Future relationship:** `AgentSession` remains the **kernel-layer execution trace**. `PrincipalRuntime` may reference the active `AgentSession` (e.g., "this principal is `executing` with session `sess_abc`"), but the session's lifecycle is owned by the scheduler/foreman, not the PrincipalRuntime.

- One `PrincipalRuntime` may reference zero or many `AgentSession` records over time.
- One `AgentSession` is referenced by zero or one `PrincipalRuntime` at a time (the principal that produced it).

### 6.4 `SiteAttachment` (Task 397)

**Current:** Ephemeral connection between operator/agent and Site.

**Future relationship:** `SiteAttachment` is the **transport layer**. `PrincipalRuntime` is the **actor state layer**. They are correlated but independent:
- A principal may have a `PrincipalRuntime` without a `SiteAttachment` (e.g., `available` state)
- A principal may have a `SiteAttachment` that is `stale` while the `PrincipalRuntime` is `available` (reattach pending)
- A principal may have multiple `SiteAttachment` records (one per Site) but one `PrincipalRuntime` state machine

### 6.5 `continuation_affinity` (Task 212)

**Current:** Soft routing hint on `WorkItem` for scheduler reordering.

**Future relationship:** `continuation_affinity` remains **advisory** (SEMANTICS.md §2.12). `PrincipalRuntime` may **consume** affinity signals when deciding whether to claim work, but it may also ignore them. The scheduler does not check PrincipalRuntime state when honoring affinity.

- A work item with `preferred_agent_id: "a2"` will be reordered higher in `scanForRunnableWork()`.
- Principal `a2` in `available` state may see this work item and decide to claim it.
- Principal `a3` may also claim it if `a2` does not act quickly enough.

### 6.6 Charter Runtime Health (Task 284)

**Current:** `CharterRunner.probeHealth()` returns `healthy` / `degraded_draft_only` / `partially_degraded` / `broken` / `unconfigured`.

**Future relationship:** Charter runtime health feeds into the **PrincipalRuntime availability** dimension. A charter runner whose health is `broken` may cause its owning `PrincipalRuntime` to transition to `unavailable` or `failed`. A `partially_degraded` runner may keep the PrincipalRuntime in `attached_interact` but with reduced budget or degraded mode.

### 6.7 Process Executor Runner IDs

**Current:** `process_executor` worker in `WorkerRegistry` with `singleton` concurrency policy.

**Future relationship:** The `process_executor` worker is a **PrincipalRuntime instance** with:
- `principal_type: "worker"`
- `principal_id: "process_executor"`
- `authority envelope`: `execute` for `process` family intents
- States: `available` → `claiming` → `executing` → `available`

The process executor's distinct lease/recovery model (Task 359) maps to PrincipalRuntime as follows: the executor claims a process intent, transitions to `executing`, and returns to `available` when the subprocess exits.

### 6.8 Cloudflare / Windows Site Worker Identities

**Current:** Cloudflare Sites have worker IDs in `ExecutionAttemptRecord.workerId`. Windows Sites have `site_id` and `cycle_id`.

**Future relationship:** Each Site worker identity maps to a `PrincipalRuntime` instance scoped to that Site:
- Cloudflare `workerId` → `principal_id` within the Site's principal runtime registry
- Windows Site process → `principal_id` derived from `site_id` + process PID

Site-scoped principals have narrower authority envelopes than global principals. A Cloudflare worker may only `execute` for its own Site's outbound commands, not for other Sites.

---

## 7. Implementation Recommendation

### 7.1 Verdict: Bounded Implementation Added

Implementation code was added with this task despite the original design-task non-goal.

Implemented surfaces observed in the working tree:
- `packages/layers/control-plane/src/principal-runtime/` — types, transition validation, capability predicates, in-memory registry, JSON registry, and exports.
- `packages/layers/cli/src/commands/principal.ts` — `principal status`, `principal list`, `principal attach`, and `principal detach` command handlers.
- `packages/layers/cli/src/main.ts` — CLI wiring for `narada principal ...`.
- `packages/layers/cli/src/commands/doctor.ts` — principal-runtime health check.
- `packages/layers/control-plane/src/index.ts` — public exports.

This implementation remains bounded if and only if `PrincipalRuntime` stays ephemeral/advisory and does not acquire scheduler lease authority, foreman decision authority, or durable Site truth authority.

### 7.2 Proposed Follow-Up Tasks

| Order | Task Title | What It Does | Depends On |
|-------|------------|--------------|------------|
| 1 | **Review task:** PrincipalRuntime implementation review | Verify the implementation preserves advisory/ephemeral semantics, has focused tests, and does not bypass scheduler/foreman authority. | 406 |
| 2 | **Runtime task:** Wire PrincipalRuntime into dispatch loop, if still needed | Modify dispatch only after review proves the runtime semantics are safe. | Review task |
| 3 | **Observation task:** PrincipalRuntime in health/observation API, if still needed | Surface PrincipalRuntime state without making it authoritative. | Review task |

### 7.3 What NOT to Implement

- **No generic IAM system.** PrincipalRuntime is not a user directory. It does not replace OAuth, RBAC, or ACL.
- **No distributed consensus.** PrincipalRuntime state is local to the console/agent runtime. Multi-principal coordination is out of scope.
- **No persistent principal memory.** Learned preferences remain advisory. There is no "principal knowledge graph" or "persistent prompt state."
- **No automatic task assignment.** The scheduler owns work assignment. PrincipalRuntime does not auto-claim work items.

---

## 8. Acceptance Criteria

- [x] Decision artifact exists at `.ai/decisions/20260422-406-principal-runtime-state-machine.md`.
- [x] Object boundary distinguishes `PrincipalRuntime` from `SiteAttachment`, `AgentSession`, lease, authority envelope, and roster.
- [x] State machine is defined with transition owners.
- [x] Design preserves intelligence-authority separation (6 invariants explicitly stated and defended).
- [x] Design states whether implementation should follow and what kind; closure notes record that bounded implementation was added.
- [x] Canonical docs are not modified (no terminology changes needed; existing concepts map cleanly).
- [x] Implementation code was added and must be reviewed as bounded/advisory before deeper runtime use.
- [x] No derivative task-status files are created.
