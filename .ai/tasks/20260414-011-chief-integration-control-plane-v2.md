# Chief Integration — Control Plane v2

## Role

You are the chief integrator for the Narada control-plane v2 workstream.

You do not own all detailed design decisions. You own integration, conflict resolution, dependency tracking, and final coherence across the task outputs.

## Scope

Primary target:
- `.ai/tasks/20260414-011-chief-integration-control-plane-v2.md`

Consume outputs from:
- `20260414-002-foreman-core-ontology-and-control-algebra.md`
- `20260414-003-identity-lattice-and-canonical-keys.md`
- `20260414-004-coordinator-durable-state-v2.md`
- `20260414-005-assignment-agent-a-scheduler-and-leases.md`
- `20260414-006-assignment-agent-b-charter-invocation-v2.md`
- `20260414-007-assignment-agent-c-tool-binding-runtime.md`
- `20260414-008-assignment-agent-d-outbound-handoff-v2.md`
- `20260414-009-assignment-agent-e-replay-and-recovery-tests.md`
- `20260414-010-assignment-agent-f-daemon-foreman-dispatch.md`

Also inspect and update as needed:
- `README.md`
- `AGENTS.md`
- architecture docs under `packages/exchange-fs-sync/docs/`
- any package-level README/docs touched by the integrated design

## Mission

Integrate the control-plane v2 task outputs into one coherent architecture and implementation plan.

## Core Responsibilities

1. Detect contradictions between task outputs.
2. Resolve cross-task naming drift.
3. Ensure one canonical identity lattice survives integration.
4. Ensure one canonical control algebra survives integration.
5. Ensure daemon, foreman, charter, outbound, and trace boundaries remain coherent.
6. Produce final normative language suitable for repo docs and future implementation tasks.

---

## Task 1 — Dependency Closure

### Sequential Foundation (Completed)

| Task | Status | Foundation For |
|------|--------|----------------|
| `002-ontology` | ✅ Complete | All downstream tasks |
| `003-identity` | ✅ Complete | `004-durable-state`, `005-scheduler`, `006-charter`, `008-outbound` |
| `004-durable-state` | ⚠️ **Incomplete** (placeholder only) | `005-scheduler`, `006-charter`, `007-tooling`, `008-outbound`, `009-tests` |
| `005-scheduler` | ✅ Complete | `010-daemon`, `009-tests` |
| `006-charter` | ✅ Complete | `007-tooling`, `008-outbound`, `009-tests` |
| `007-tooling` | ✅ Complete | `006-charter`, `009-tests` |
| `008-outbound` | ✅ Complete | `009-tests`, `010-daemon` |
| `009-tests` | ✅ Complete | Implementation validation |
| `010-daemon` | ✅ Complete | `005-scheduler`, `008-outbound` |

### Resolution for Incomplete Durable State Task
Because `20260414-004-coordinator-durable-state-v2.md` was not executed, this integration document **closes the durable state model** in Section 5 (Integrated Durable State Model). The schema decisions below are derived directly from the completed ontology, identity, scheduler, charter, tooling, and outbound tasks. No contradiction with existing code exists because the coordinator SQLite schema from Task 012 (`thread_records`, `charter_outputs`, `foreman_decisions`, `policy_overrides`) is preserved and extended.

### Parallel Safety
All parallel tasks (A–F) are mutually consistent. No contradictions were found between:
- Scheduler lease model and daemon dispatch loop
- Charter invocation envelope and tool binding runtime
- Outbound handoff state machine and scheduler recovery rules
- Identity lattice and all object lifecycles

---

## Task 2 — Conflict Resolution

### Conversation vs Thread Naming
**Conflict**: Some existing tables use `thread_id`; the identity task mandates `conversation_id`.

**Resolution**:
- **Normative rule**: `thread_id === conversation_id`. They are the same value.
- **Schema policy**: Existing column names (`thread_id` in outbound tables, coordinator tables) are retained for backward compatibility. All new documentation and types must use `conversation_id` conceptually.
- **Deprecation**: New control-plane code must not introduce `thread_id` as a conceptual term in interfaces or documentation.

### Work Item vs Revision Attachment
**Conflict**: None. Ontology says work items attach to the stable `conversation`; revision is input context. Scheduler and charter tasks both adopted this correctly.

**Resolution**:
- `work_item` references `conversation_id` as its parent.
- `execution_attempt` references `revision_id` as its input snapshot.
- No table attaches work primarily to `conversation_revision`.

### Execution vs Session vs Chat Scope
**Conflict**: Minor drift in whether `session_id` is stored on `execution_attempt`.

**Resolution**:
- `execution_attempt` has an **optional** `session_id` column for correlation only.
- `session_id` is **not** a foreign key and is **not** required for recovery.
- `chat_id` is **not** persisted in any first-class table. It is a UI/runtime token.

### Trace vs Evaluation Persistence
**Conflict**: Task 009 (tests) demands trace deletion must not affect correctness; Task 006 (charter) says evaluations are durable commentary summaries.

**Resolution**:
- `evaluation` is a **durable summary** of charter output (machine-readable classifications, facts, proposed_actions). It is required for foreman arbitration and may be regenerated if lost.
- `trace` is **commentary** (debugging, reasoning logs). It is safe to delete.
- `tool_call_record` is a **durable audit record** of tool execution, distinct from trace.
- Recovery must succeed using only `work_item`, `execution_attempt`, and `outbound_command` state.

### Proposal vs Command Boundary
**Conflict**: None. Task 008 explicitly separates `foreman_decisions` (proposal) from `outbound_commands` (command). Task 012 already implemented `foreman_decisions` with `outbound_id` soft reference.

**Resolution**:
- `foreman_decisions` row = proposal. It is append-only.
- `outbound_commands` row = command. It is mutable in status by the outbound worker.
- One decision produces at most one command.

---

## Task 3 — Integrated End-to-End Sequence

```text
REMOTE MAILBOX
        │
        ▼ (Graph delta: new message, move, flag change)
┌───────────────────┐
│  exchange-fs-sync │  ← Deterministic compiler
│  (sync cycle)     │     Normalizes events, applies to filesystem,
│                   │     updates views, commits cursor
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Daemon           │  ← Emits SyncCompletionSignal
│  (dispatch phase) │     { changed_conversations: [...] }
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Foreman          │  ← Opens / supersedes work_items
│  (work opening)   │     Evaluates revision relevance
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Scheduler        │  ← Scans runnable work_items
│  (lease + run)    │     Acquires lease, starts execution_attempt
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Charter Runtime  │  ← Receives CharterInvocationEnvelope
│  (evaluation)     │     Produces CharterOutputEnvelope
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Foreman          │  ← Validates output, arbitrates,
│  (resolution)     │     writes foreman_decision + outbound_command
│                   │     (or resolves as no-op / escalation)
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Outbound Worker  │  ← Claims command, creates draft,
│  (mutation)       │     sends, reconciles to confirmed
└─────────┬─────────┘
          │
          ▼
TERMINAL QUIESCENCE
        │
        ▼
Daemon sleeps until next wake (webhook, poll, retry timer, manual)
```

### Detailed Step Descriptions

1. **Remote Mailbox Change**
   - Graph API reports a change (delta query or webhook).

2. **Sync**
   - `exchange-fs-sync` fetches deltas, normalizes events, computes `event_id`s, applies to `messages/` and `views/`, writes `apply-log` markers, commits cursor.
   - A new `conversation_revision` is implicitly observed for each changed conversation.

3. **Compiled Local Revision**
   - The filesystem now contains updated `record.json` files and `views/by-thread/{conversation_id}/` entries.
   - The foreman can hydrate `thread_context` by reading these views.

4. **Work Opening**
   - The daemon calls `foreman.onSyncCompleted(signal)`.
   - The foreman checks each changed conversation.
   - If no runnable/leased/executing work item exists and the change is relevant, it inserts a `work_item` row with `status = 'opened'`.
   - If an older work item is `opened`/`leased` and the new revision materially changes context, the old work item is marked `superseded` and a new one is opened.

5. **Scheduling**
   - The scheduler scans for runnable work items (status `opened`, no active lease, not superseded, conversation not blocked).
   - It selects by urgency → age → mailbox fairness, bounded by `batch_size`.
   - It acquires a lease (`work_item_leases` row) and transitions the work item to `leased`.

6. **Evaluation**
   - The scheduler inserts an `execution_attempt` row and transitions the work item to `executing`.
   - The charter runtime receives the `CharterInvocationEnvelope` (frozen tool catalog, knowledge sources, allowed actions, thread context, revision_id).
   - The charter returns a `CharterOutputEnvelope` (outcome, classifications, facts, proposed actions, tool requests, escalations).
   - Any approved tool requests are executed by the tool runner, with results logged to `tool_call_records`.

7. **Proposal / Command Creation**
   - The foreman validates the output envelope.
   - It arbitrates primary/secondary charter outputs.
   - It writes a `foreman_decisions` row (the proposal).
   - If the outcome requires an action, it writes `outbound_command` + `outbound_versions` in the same SQLite transaction.
   - It updates `foreman_decisions.outbound_id` to link the proposal to the command.
   - It transitions the `work_item` to `resolved`.

8. **Outbound Execution**
   - The outbound worker polls `outbound_commands` for eligible commands.
   - For `draft_reply` / `send_reply`: creates Graph draft, transitions `pending → draft_creating → draft_ready → sending → submitted → confirmed`.
   - For `draft_reply` only: stops at `confirmed` directly after draft creation (no `sending`/`submitted`).
   - For non-send actions: executes directly and transitions to `confirmed` after Graph success.

9. **Terminal Quiescence**
   - The scheduler finds no runnable work items, no active leases, and no expired retry timers.
   - The daemon marks the mailbox quiescent and sleeps until the next wake signal.

---

## Task 4 — Documentation Realignment

### Narrative Shift

The repo documentation must stop describing the system as:
> "Daemon wakes agent on thread changes"

And must instead describe it as:

> **Deterministic Mailbox Compiler**
> `exchange-fs-sync` compiles remote Graph deltas into local filesystem state. It knows nothing of agents, charters, or control decisions.
>
> **Control Plane Over First-Class Work Objects**
> Above the compiler, a control plane manages `work_item`, `execution_attempt`, and `outbound_proposal` objects. The daemon schedules work; the foreman decides it.
>
> **Bounded Agent Evaluation**
> Charters run inside bounded `execution_attempt`s with frozen capability envelopes. They produce structured evaluations, not commands.
>
> **Hard Outbound Authority Boundary**
> Only the outbound worker may create Graph drafts or mutate mailbox state. The foreman may propose; the worker executes.

### Required Documentation Updates

| Doc | Update |
|-----|--------|
| `README.md` | Already updated in Task 001 to mention five-layer architecture and `packages/charters`. Ensure the narrative uses "compiler" and "control plane" language. |
| `AGENTS.md` (root) | Already updated with outbound concepts and invariants. Add cross-reference to this integration doc for the full end-to-end model. |
| `packages/exchange-fs-sync/AGENTS.md` | Already updated with outbound structure and correct toolchain. Add a note: "For control plane architecture, see `20260414-011-chief-integration-control-plane-v2.md`." |
| `packages/exchange-fs-sync/docs/02-architecture.md` | Must be updated to include the control-plane layers (foreman, scheduler, charter runtime, outbound worker) above the existing six compiler layers. |
| `packages/exchange-fs-sync/docs/04-identity.md` | Must add a section on control-plane identities (`conversation_id`, `work_item_id`, `execution_id`, `decision_id`, `outbound_id`) and their relationship to compiler event IDs. |

---

## Task 5 — Implementation Readiness

### ✅ Ready for Implementation

| Component | Readiness | Notes |
|-----------|-----------|-------|
| **Ontology** | Ready | All objects defined with authority and lifecycle. |
| **Identity Lattice** | Ready | Canonical keys, derivation rules, and aliases specified. |
| **Scheduler / Leases** | Ready | State machine, lease table, recovery scanner, heartbeats, backoff fully specified. |
| **Charter Invocation v2** | Ready | Envelope schemas, validation rules, boundary rules, and outcome semantics specified. |
| **Tool Binding Runtime** | Ready | Catalog envelope, tool call records, validation, safety matrix, and error semantics specified. |
| **Outbound Handoff v2** | Ready | Proposal/command separation, idempotency, atomic transaction, crash recovery rules specified. |
| **Daemon-Foreman Dispatch** | Ready | Sync-to-dispatch sequence, wake coalescing, quiescence, error boundaries specified. |
| **Replay/Recovery Tests** | Ready | 26 test scenarios with preconditions and expected durable end states specified. |

### ⚠️ Needs Follow-On Design

| Component | Why | Blocker / Next Task |
|-----------|-----|---------------------|
| **Coordinator SQLite Schema v2** | Task 004 was not executed. The integrated model in this doc fills the gap, but actual `CREATE TABLE` statements for `work_items`, `execution_attempts`, `work_item_leases`, `tool_call_records`, and `conversation_revisions` must be written. | Follow-on task: write `coordinator/schema-v2.sql` and update `SqliteCoordinatorStore`. |
| **Foreman Implementation Package** | No `packages/exchange-fs-sync-foreman` exists yet. The facade interface (`ForemanFacade.onSyncCompleted`) must be implemented. | Follow-on task: create foreman package with work opening, arbitration, and command creation logic. |
| **Scheduler Implementation Module** | The scheduler is spec'd but not coded. Need `scan_for_runnable_work()`, `lease_work_item()`, `dispatch_execution_attempt()`. | Follow-on task: implement scheduler module inside foreman package or as standalone module. |
| **Daemon Integration** | The daemon currently only runs sync loops. It needs to call the foreman facade and enter the dispatch phase after each sync cycle. | Follow-on task: modify `packages/exchange-fs-sync-daemon/src/service.ts` to integrate dispatch phase. |
| **Charter Runtime Adapter** | The `CharterInvocationEnvelope` must be wired into the actual charter execution mechanism (e.g., Codex, LLM adapter). | Follow-on task: implement charter runner that consumes the envelope and produces the output envelope. |
| **Health File Extensions** | Task 010 specified control-plane health fields; these need to be added to `HealthFile` and `HealthStatus` in the daemon. | Follow-on task: update daemon health types and serialization. |

---

## Section 5 — Integrated Durable State Model

Because Task 004 was incomplete, this section closes the durable state design derived from all other completed tasks.

### First-Class Tables

| Table | Purpose | Mutability |
|-------|---------|------------|
| `conversation_records` | Coordinator-side metadata for each conversation (primary charter, status, assigned agent, timestamps) | Mutable state record |
| `conversation_revisions` | Ordinal tracking of observed compiler revisions per conversation | Append-only |
| `work_items` | The terminal schedulable unit of control work | Mutable state record |
| `work_item_leases` | Lease records for work-item execution authority | Append-only (releases are updates to `released_at`) |
| `execution_attempts` | Bounded invocation records | Append-only |
| `evaluations` | Durable summary of successful charter output | Append-only |
| `charter_outputs` | Already exists from Task 012; retained as alias/evaluation storage | Append-only |
| `foreman_decisions` | Already exists from Task 012; represents outbound proposals | Append-only |
| `outbound_commands` | Already exists from Task 001/012; executable command envelope | Mutable status |
| `outbound_versions` | Already exists; versioned payloads | Append-only |
| `managed_drafts` | Already exists; Graph draft bindings | Mutable / append-only |
| `outbound_transitions` | Already exists; status audit log | Append-only |
| `tool_call_records` | Durable record of every tool invocation | Append-only |
| `policy_overrides` | Already exists from Task 012 | Append-only |
| `agent_traces` | Already exists from Task 009/012 | Append-only (pruneable) |
| `sessions` | **Not a first-class table** | N/A |
| `chats` | **Not a first-class table** | N/A |

### Object-to-Table Mapping

| Ontology Object | Table | Notes |
|-----------------|-------|-------|
| `conversation` | `conversation_records` | Also represented in filesystem by compiler |
| `conversation_revision` | `conversation_revisions` | Local-only ordinal counter |
| `work_item` | `work_items` | Terminal schedulable unit |
| `evaluation` | `evaluations` (or `charter_outputs`) | Machine-readable summary |
| `execution_attempt` | `execution_attempts` | Bounded process record |
| `outbound_proposal` | `foreman_decisions` | Append-only proposal record |
| `outbound_command` | `outbound_commands` + `outbound_versions` | Worker-owned execution state |
| `trace` | `agent_traces` | Commentary, safe to delete |
| `session` | **Not persisted** | Optional correlation token on `execution_attempts.session_id` |
| `chat` | **Not persisted** | Runtime-only token |

### Constraint Rules (≥10)

1. Every `work_item` belongs to exactly one `conversation_records` row.
2. Every `work_item_leases` row references exactly one `work_item`.
3. At most one unreleased, unexpired lease may exist for a given `work_item`.
4. Every `execution_attempt` references exactly one `work_item`.
5. Every `evaluation` references exactly one successful `execution_attempt`.
6. Every `foreman_decision` references exactly one `work_item` (or is a sentinel audit row for escalation).
7. A `foreman_decision` may reference at most one `outbound_command` via `outbound_id`.
8. An `outbound_command` is created by at most one `foreman_decision`.
9. Every `tool_call_record` references exactly one `execution_attempt`.
10. `agent_traces` may not be the sole record of `work_item` resolution state.
11. `conversation_revisions` ordinals must be strictly monotone within a `conversation_id`.
12. Only one `work_item` per `conversation_id` may be `leased` or `executing` at a time.

### Minimal Indexing Guidance

- `work_items`: index on `(conversation_id, status, created_at)` for runnable selection; index on `(mailbox_id, status)` for mailbox-scoped scans.
- `work_item_leases`: index on `(work_item_id, acquired_at)` for lease history; index on `(released_at, expires_at)` for stale-lease scanner.
- `execution_attempts`: index on `(work_item_id, started_at)` for attempt history.
- `conversation_revisions`: index on `(conversation_id, ordinal)` for revision lookup.
- `tool_call_records`: index on `(execution_id, started_at)` for call history.
- Existing indexes on `outbound_commands`, `foreman_decisions`, `charter_outputs`, and `agent_traces` from Tasks 001/012 remain valid.

### Retention Stance

| Object Class | Retention |
|--------------|-----------|
| `conversation_records` | Forever (or archive after conversation deletion) |
| `conversation_revisions` | Forever (small rows) |
| `work_items` | Forever (audit) |
| `work_item_leases` | Pruneable after work item terminal state (>30 days) |
| `execution_attempts` | Forever (small rows, audit) |
| `evaluations` / `charter_outputs` | Forever (audit and prior context) |
| `foreman_decisions` | Forever (audit) |
| `outbound_commands` / `outbound_versions` | Forever (audit) |
| `managed_drafts` | Pruneable after command confirmed (>30 days) |
| `outbound_transitions` | Pruneable after command terminal (>30 days) |
| `tool_call_records` | Forever (audit) |
| `agent_traces` | Pruneable after 7–30 days (commentary) |

---

## Canonical Vocabulary

| Term | Canonical Meaning |
|------|-------------------|
| **conversation** | The canonical real-world email thread, keyed by Graph `conversationId`.
| **conversation_id** | The canonical key for a conversation. Equal to `thread_id` in legacy columns.
| **conversation_revision** | A derived snapshot of a conversation at a point in time. Keyed by ordinal.
| **revision_id** | `{conversation_id}:rev:{ordinal}` — the identity of a conversation revision.
| **work_item** | The smallest durable schedulable unit of control work. Keyed by `wi_<uuid>`.
| **work_item_id** | The canonical key for a work item.
| **execution_attempt** | A bounded invocation of a charter or agent runtime. Keyed by `ex_<uuid>`.
| **execution_id** | The canonical key for an execution attempt.
| **evaluation** | The durable structured output of a successful execution attempt. Keyed by `eval_<execution_id>`.
| **outbound_proposal** | A foreman-authorized intent to mutate the mailbox. Realized as a `foreman_decisions` row. Keyed by `fd_<uuid>`.
| **decision_id** | The canonical key for an outbound proposal. Alias: `proposal_id`.
| **outbound_command** | The executable envelope for the outbound worker. Keyed by `ob_<uuid>`.
| **outbound_id** | The canonical key for an outbound command.
| **trace** | Append-only commentary (debugging, reasoning). Not required for correctness.
| **session** | An optional runtime correlation token. Not a durable object.
| **chat** | An optional UI protocol container. Not a durable object.
| **lease** | A durable record granting exclusive execution authority for a work item.
| **foreman** | The routing, arbitration, and decision authority.
| **scheduler** | The runnable-selection and lease-management mechanism.
| **daemon** | The long-running wake/sync substrate. Does not decide.
| **compiler** | `exchange-fs-sync`. Determines mailbox truth.
| **outbound worker** | The sole authority over mailbox mutations.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **R1: `better-sqlite3` segfault during full test suite** (pre-existing) | Medium | Testing friction | Run tests individually or in smaller shards. The segfault is in native cleanup, not production runtime. |
| **R2: Durable state schema gap (Task 004 incomplete)** | High | Blocks implementation | Closed in this document. Next step is writing actual SQL and TypeScript stores. |
| **R3: Foreman transaction boundary complexity** | Medium | Crash recovery bugs | Atomic transaction must include: `thread_records`, `charter_outputs`, `foreman_decisions`, `outbound_commands`, `outbound_versions`, `work_item` update. Integration tests must simulate crash at each boundary. |
| **R4: Daemon dispatch loop integration into existing service.ts** | Medium | Scheduler starvation or sync blocking | Implement dispatch as a separate phase after sync, with its own interruptible sleep and error handling. |
| **R5: Charter runtime envelope wiring to actual LLM/Codex** | Medium | Delay in end-to-end demo | Start with a deterministic mock charter runner that validates envelope shape and produces fixed output. |
| **R6: `conversation_revision` ordinal counter storage** | Low | Replay inconsistency | Store ordinal in `conversation_revisions` table, incremented by foreman/compiler integration on each material change. |
| **R7: Multi-mailbox lease contention** | Low | Performance bottleneck | v1 is single-writer per mailbox. If scaling beyond one process per mailbox is needed, that is a v2 redesign. |

---

## Deliverables Checklist

- [x] Integration report
- [x] Canonical vocabulary
- [x] Final end-to-end sequence
- [x] Documentation patch plan
- [x] Risk register
