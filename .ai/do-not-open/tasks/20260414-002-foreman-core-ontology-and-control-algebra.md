# Foreman Core Ontology and Control Algebra

## Mission

Define the irreducible control objects, authority boundaries, and lifecycle algebra for Narada’s mailbox-side coordination layer.

This task exists to remove hidden arbitrariness from the current “daemon wakes agent on thread changes” framing. The system must instead be grounded in explicit durable objects and legal transitions.

## Scope

Architecture/spec only.

Primary target:
- `.ai/do-not-open/tasks/20260414-002-foreman-core-ontology-and-control-algebra.md`

Context to inspect as needed:
- `README.md`
- `AGENTS.md`
- `.ai/do-not-open/tasks/20260413-007-foreman-and-charters-architecture.md`
- `.ai/do-not-open/tasks/20260413-011-charter-tool-bindings.md`
- `.ai/do-not-open/tasks/20260413-012-coordinator-state-and-foreman-handoff.md`
- `packages/exchange-fs-sync/docs/02-architecture.md`
- `packages/exchange-fs-sync/docs/03-persistence.md`
- `packages/exchange-fs-sync-daemon/src/index.ts`
- `packages/exchange-fs-sync-daemon/src/service.ts`

## Goal

Produce a closed ontology for the control plane above deterministic mailbox sync.

The output must answer:

1. What is the smallest durable unit of control work?
2. What objects are authoritative versus derived?
3. What transitions exist?
4. What is Codex/agent execution actually doing in the algebra?
5. What is a trace, and why is it not the centerpiece?

## Core Invariants

1. Remote mailbox truth remains outside Narada.
2. `exchange-fs-sync` remains the deterministic compiler of remote mailbox state into local durable form.
3. The control plane may create local coordination state, but may not redefine mailbox truth.
4. The outbound worker remains the sole authority over mailbox mutations.
5. Commentary, reasoning, and traces must never become required workflow truth.
6. Durable control objects must support crash-safe re-entry.

---

## 1. Ontology

### `conversation`
- **Role**: The canonical real-world email thread. It is the durable identity around which all coordination revolves.
- **Classification**: **canonical**, **durable**
- **Creator**: `exchange-fs-sync` (derived from Graph `conversationId`)
- **Mutator**: `exchange-fs-sync` (updates thread context on every sync); foreman updates coordinator metadata (primary charter, status)
- **Terminal states**: None; a conversation may become `closed` in coordinator state but the identity persists as long as messages exist

### `conversation_revision`
- **Role**: A transient observable snapshot of a conversation at a specific point in time. A revision is caused by any new inbound message, outbound confirmation, or significant thread mutation observed by the compiler.
- **Classification**: **derived**, **ephemeral** (or event-like)
- **Creator**: `exchange-fs-sync` compiler implicitly (each sync cycle produces a new observed state)
- **Mutator**: None; revisions are immutable observations
- **What causes a new revision**: Any sync cycle that detects a change in the thread’s message set, flags, or folder location
- **Supersession**: Newer revisions implicitly supersede older ones for the purpose of *future* work, but old evaluations against old revisions are not retroactively invalidated
- **Work attachment**: Work items attach to the **stable `conversation`**, not to a specific revision. A revision merely provides the input context for a work item.

### `work_item`
- **Role**: The **smallest durable schedulable unit of control work**. A work item represents a concrete decision or action the foreman must perform for a conversation.
- **Classification**: **canonical**, **durable**
- **Creator**: Foreman (when a conversation revision triggers a need for triage, analysis, or response)
- **Mutator**: Foreman (leases, resolves, cancels); daemon scheduler (leases, via foreman API)
- **Terminal states**: `resolved`, `cancelled`, `failed_terminal`
- **Why it is the terminal unit**:
  - `conversation` is too coarse (it may require zero, one, or many independent actions over time)
  - `conversation_revision` is too fine and derived (revisions happen on every sync; most require no work)
  - `outbound_proposal` is derived (it is an *outcome* of resolving a work item)
  - `decision task` is semantically equivalent to `work_item`; we choose `work_item` because it generalizes beyond pure decision-making (e.g., obligation extraction, tool invocation follow-up)

### `evaluation`
- **Role**: The structured output produced by a charter when asked to analyze a conversation. The evaluation *process* is transient computation; its **outcome** is persisted as a `charter_output` row.
- **Classification**: **commentary** with a **durable summary**
- **Creator**: Charter/agent runtime (Codex, LLM, or deterministic classifier)
- **Mutator**: None; evaluations are append-only
- **Terminal states**: None; evaluations are facts/observations, not processes
- **Semantic note**: We do not treat the evaluation itself as first-class workflow truth. The foreman *reads* evaluations and *produces* a decision. If an evaluation row is lost, the foreman may re-invoke the charter and regenerate it.

### `outbound_proposal`
- **Role**: A durable, validated intent to mutate the mailbox, emitted by the foreman as the result of resolving a work item.
- **Classification**: **derived**, **durable**
- **Creator**: Foreman (after validating charter evaluations and applying arbitration rules)
- **Mutator**: Outbound worker (transitions `proposed` → `materialized` via command creation); foreman may supersede or reject
- **Terminal states**: `materialized`, `rejected`, `superseded`
- **Why derived**: It has no independent existence separate from the work item that justified it and the outbound command that materializes it.

### `execution_attempt`
- **Role**: A bounded invocation of an agent runtime to perform an evaluation or other computation. It is a *process in time*, not a permanent entity.
- **Classification**: **ephemeral / commentary**
- **Creator**: Foreman (when leasing a work item and invoking a charter)
- **Mutator**: Agent runtime (succeeds or crashes); foreman may mark abandoned if lease expires
- **Terminal states**: `succeeded`, `crashed`, `abandoned`
- **Distinct from**:
  - **session**: a session is a higher-level container that may span multiple attempts across multiple threads
  - **chat**: a chat is an interaction protocol (messages back and forth); an attempt is a single bounded run
  - **work item**: a work item is the durable job; an attempt is one transient execution of that job
  - **trace**: a trace is the *record* of what happened during an attempt; the attempt is the *activity* itself

### `trace`
- **Role**: An audit log of reasoning, observations, and intermediate outputs produced during an `execution_attempt`.
- **Classification**: **commentary**, **durable** (for audit)
- **Creator**: Agent runtime / foreman
- **Mutator**: None; append-only
- **Why it is not the centerpiece**: Traces are **observations of work**, not **drivers of work**. The foreman makes decisions based on structured `evaluation` envelopes and durable `work_item` state, not by re-reading traces. A trace may be deleted without affecting the next scheduling cycle. They exist for human debugging, compliance, and replay analysis.
- **Forbidden**: Traces must never be the sole source of state for resuming a work item, for determining whether an outbound command was emitted, or for calculating lease ownership.

---

## 2. Authority Map

| Object | Authoritative Owner | Allowed Mutators | Derives From |
|--------|--------------------|------------------|--------------|
| `conversation` | `exchange-fs-sync` compiler | Compiler (messages/views); foreman (coordinator metadata) | Graph API mailbox state |
| `conversation_revision` | `exchange-fs-sync` compiler | Compiler only (read-only for foreman) | `conversation` at a point in time |
| `work_item` | Foreman | Foreman (create, resolve, cancel); daemon scheduler (lease via foreman API) | Foreman observing a revision |
| `evaluation` | Charter/agent runtime | Charter creates; foreman reads; nobody mutates | Charter invocation against a revision |
| `outbound_proposal` | Foreman | Foreman creates/supersedes; outbound worker materializes | Resolved work item + evaluations |
| `execution_attempt` | Agent runtime | Runtime executes; foreman initiates/abandons | Leased work item |
| `trace` | Agent runtime / foreman | Runtime/foreman append; nobody mutates | Execution attempt |

### Hard Authority Rules
1. **Only the compiler** may create or update canonical message state in the filesystem.
2. **Only the foreman** may create `work_item`, `outbound_proposal`, or `foreman_decision` records.
3. **Only the outbound worker** may create or mutate Graph drafts and perform mailbox mutations.
4. **Only the tool runner** (under foreman authority) may execute external tools.
5. **Agent runtime** may generate `evaluation` and `trace`, but may never directly mutate `work_item` state or create outbound commands.

---

## 3. Lifecycle Algebra

### Conversation Revision
```
observed ──▶ compiled ──▶ indexed ──▶ [superseded by next revision]
```
- **observed**: The compiler has detected a change in thread messages
- **compiled**: The compiler has normalized events and applied them to local state
- **indexed**: Derived views (`by-thread/`, search indexes) have been updated
- **superseded**: A newer revision has been observed; this revision is no longer the current input for new work items

### Work Item
```
opened ──▶ leased ──▶ executing ──▶ resolved
  │          │           │
  │          │           ├──▶ failed_retryable ──▶ [leased | failed_terminal]
  │          │           │
  │          │           └──▶ cancelled
  │          │
  │          └──▶ abandoned (lease expired)
  │
  └──▶ superseded (by newer work_item on same conversation)
       cancelled (by policy or human override)
```

| Transition | Condition |
|------------|-----------|
| `opened` | Foreman decides a conversation requires action |
| `leased` | Daemon scheduler assigns the work item to a worker process |
| `executing` | Worker begins charter invocation or foreman evaluation |
| `resolved` | Foreman has produced an `outbound_proposal`, tool result, or no-op decision |
| `superseded` | A newer `work_item` on the same conversation makes this one obsolete |
| `cancelled` | Human operator or policy cancels the work item before resolution |
| `failed_retryable` | Execution attempt crashed or timed out; lease may be retried |
| `failed_terminal` | Max retries exceeded or unrecoverable error; work item ends |
| `abandoned` | Lease expired without heartbeat from worker |

### Execution Attempt
```
started ──▶ active ──▶ succeeded
              │
              ├──▶ crashed
              │
              └──▶ abandoned (by lease timeout or external kill)
```

| Transition | Condition |
|------------|-----------|
| `started` | Agent runtime process begins |
| `active` | Runtime is processing (charter inference, tool calls, etc.) |
| `succeeded` | Runtime returned a valid structured output |
| `crashed` | Runtime threw, timed out, or returned unparseable output |
| `abandoned` | Foreman/daemon killed the attempt due to lease expiry or shutdown |

### Outbound Proposal
```
proposed ──▶ accepted ──▶ materialized
    │
    ├──▶ rejected (by foreman policy check or human)
    │
    └──▶ superseded (by newer proposal for same thread)
```

| Transition | Condition |
|------------|-----------|
| `proposed` | Foreman emits a validated action intent |
| `accepted` | Proposal passes any required policy/override gates |
| `materialized` | Outbound worker has created the corresponding `outbound_command` |
| `rejected` | Policy blocks the proposal (e.g., `blocked_policy` state) |
| `superseded` | A newer proposal or human action replaces this one |

---

## 4. Boundary Rules

### Exchange / Graph
- **Responsibility**: Source of truth for mailbox state (messages, drafts, folders, flags)
- **Boundary**: Narada may only mutate Graph state through the outbound worker. No other layer may send HTTP requests that modify mailbox state.

### `exchange-fs-sync` Compiler
- **Responsibility**: Deterministically compile remote mailbox deltas into local filesystem state
- **Boundary**: The compiler does not know about charters, foremen, work items, or outbound proposals. It produces `conversation_id`-indexed message state and triggers revision observations.

### Daemon
- **Responsibility**: Lifecycle management (start, stop, polling, webhook handling), lease scheduling, health reporting
- **Boundary**: The daemon does not make routing or arbitration decisions. It asks the foreman for leaseable work items and invokes the foreman on schedule. The daemon is a *scheduler*, not a *decider*.

### Foreman
- **Responsibility**: Thread ownership, charter routing, arbitration, work item lifecycle, outbound proposal emission, tool request validation
- **Boundary**:
  - May read compiler output (messages, views)
  - May read charter evaluations
  - May write coordinator SQLite state (threads, work items, decisions, proposals)
  - May invoke charters and the tool runner
  - **Must not** directly execute Graph mutations
  - **Must not** use traces as workflow state

### Charters
- **Responsibility**: Policy interpretation, structured evaluation generation, action proposal generation
- **Boundary**:
  - May consume thread context, knowledge sources, and tool results
  - May output `evaluation` (classifications, facts, proposed actions)
  - **Must not** independently own outbound side effects
  - **Must not** expand their own action authority beyond what the foreman supplies

### Tool Bindings
- **Responsibility**: Declare available external capabilities and their execution constraints
- **Boundary**:
  - Charters may *request* tool use in output
  - Foreman validates requests against bindings
  - Tool runner executes the actual invocation
  - **Must not** receive credentials from charter-generated text

### Outbound Worker
- **Responsibility**: The sole authority over mailbox mutations. Manages draft creation, sending, retries, reconciliation, and versioned command durability.
- **Boundary**:
  - Accepts `outbound_command` rows from foreman
  - Transitions commands through the state machine
  - Observes inbound sync to confirm `submitted` → `confirmed`
  - **No other layer may create or modify Graph drafts**

### Traces / Commentary
- **Responsibility**: Audit, debugging, reasoning transparency
- **Boundary**:
  - Append-only
  - Never read by the scheduler to determine what to do next
  - Never required for crash recovery (recovery uses `work_item` and `outbound_command` state)
  - May be pruned or archived without functional impact

---

## 5. Codex Role

Codex (or any bounded agent runtime) is explicitly constrained to the following roles:

### Allowed
1. **Evaluator**: Analyze a conversation revision and produce structured classifications, facts, and escalations.
2. **Planner**: Within the bounds of a charter, plan a sequence of proposed actions to achieve a goal.
3. **Proposal Generator**: Emit `proposed_actions` and `tool_requests` for foreman validation.
4. **Summarizer**: Compress thread history or prior evaluations into concise context for the foreman.

### Rejected
- **Source of truth**: Codex may not decide whether an outbound command is actually emitted. That authority belongs to the foreman.
- **State mutator**: Codex may not directly update `work_item`, `thread_record`, or `outbound_command` state.
- **Unbounded executor**: Codex may not invoke tools or send mail directly; it must propose and await foreman/tool-runner execution.

---

## 6. Rejected Alternatives

### 1. Making `conversation_revision` the terminal work unit
**Why it seems right**: Every sync produces a revision, so scheduling work per-revision feels natural.
**Why it is wrong**:
- Most revisions require no action (e.g., a read-receipt or a moved message).
- Work would be scheduled far too fine-grained, creating an explosion of no-op work items.
- Revisions are derived compiler observations, not control decisions. The control plane should schedule based on *need*, not on *observation frequency*.

### 2. Making `outbound_proposal` the terminal work unit
**Why it seems right**: The ultimate goal of the system is often to produce a mailbox mutation, so scheduling around proposals feels outcome-oriented.
**Why it is wrong**:
- Not all work produces an outbound proposal (e.g., obligation extraction, internal follow-up creation, primary-charter reassignment).
- It inverts causality: a proposal is an *outcome* of work, not the work itself.
- Retry and crash recovery would be awkward: if a proposal fails to materialize, we need the original work context (charter inputs, evaluations) to regenerate it.

### 3. Making `trace` the centerpiece of workflow state
**Why it seems right**: LLM systems often use conversation history as implicit state. Re-reading the trace to “remember” what happened is intuitive.
**Why it is wrong**:
- Traces are commentary; they may be missing, truncated, or logically inconsistent.
- Recovery would require parsing unstructured or semi-structured text to reconstruct state, which violates crash-safety invariant #6.
- It conflates observation with authority. The system must be able to resume from durable `work_item` and `outbound_command` rows even if all traces are deleted.

---

## 7. Proposed Normative Language

These short rules are suitable for copy into future specs and code comments:

1. **Work Item Primacy**: The `work_item` is the terminal durable unit of control work.
2. **Revision is Input, Not State**: `conversation_revision` provides context but is not a first-class scheduling target.
3. **Evaluation is Commentary with a Durable Summary**: Charter outputs are persisted, but the evaluation process itself is transient.
4. **Proposal is Derived**: An `outbound_proposal` has no independent existence; it is the outcome of a resolved `work_item`.
5. **Trace is Audit**: Traces are append-only commentary. They must never be required to resume or drive workflow state.
6. **Compiler Authority**: Only `exchange-fs-sync` may create canonical message state.
7. **Foreman Authority**: Only the foreman may create `work_item`, `evaluation` inputs, and `outbound_proposal` records.
8. **Outbound Authority**: Only the outbound worker may create or mutate Graph drafts and perform mailbox mutations.
9. **Tool Authority**: Only the tool runner may execute external tools, and only after foreman validation.
10. **Daemon Neutrality**: The daemon schedules leases but does not route, arbitrate, or decide.

---

## Definition of Done

- [x] First-class control objects are explicitly defined
- [x] Work unit is chosen and justified
- [x] Legal transitions are defined
- [x] Trace role is demoted and bounded
- [x] Codex role is explicitly constrained
- [x] Output can serve as normative base for follow-on schema/runtime tasks
