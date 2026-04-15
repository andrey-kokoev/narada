# Identity Lattice and Canonical Keys

## Mission

Define the complete identity lattice for Narada’s mailbox coordination plane so that every durable object has one unambiguous canonical key and no runtime artifact is mistaken for system truth.

## Scope

Architecture/spec only.

Primary target:
- `.ai/tasks/20260414-003-identity-lattice-and-canonical-keys.md`

Read first:
- `.ai/tasks/20260414-002-foreman-core-ontology-and-control-algebra.md`

Context to inspect as needed:
- `.ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md`
- `.ai/tasks/20260413-009-agent-trace-persistence.md`
- `packages/exchange-fs-sync/src/types/normalized.ts`
- `packages/exchange-fs-sync/docs/04-identity.md`
- `packages/exchange-fs-sync/src/outbound/schema.sql`

## Goal

Produce a closed, implementation-ready identity model for:

- conversation
- conversation revision
- work item
- evaluation
- execution attempt
- outbound proposal / outbound command
- optional chat
- optional session
- trace

## Core Invariants

1. Mailbox identities are canonical over runtime/UI identities.
2. No identity may silently stand in for a different semantic object.
3. Stable durable objects must have stable durable keys.
4. `chat_id` and similar runtime artifacts are subordinate correlation only unless explicitly promoted by the ontology task.
5. If two identities are equivalent, the spec must say so normatively.
6. If one identity is derived from another, the derivation direction must be explicit.

---

## 1. Identity Table

| object | canonical key | derived from | stability | scope | notes |
|--------|---------------|--------------|-----------|-------|-------|
| `conversation` | `conversation_id` = Graph `conversationId` | Graph API mailbox state | stable across restarts, revisions, replays | mailbox-derived, globally safe | The irreducible thread identity. Already present in `NormalizedMessage.conversation_id`. |
| `thread` (alias) | `thread_id` = `conversation_id` | `conversation_id` | stable alias | mailbox-derived | Retained for backward compatibility in outbound/command tables. New specs should prefer `conversation_id`. |
| `conversation_revision` | `revision_id` = `{conversation_id}:rev:{monotone_ordinal}` | `conversation_id` + local per-conversation counter | stable across restarts (persisted counter), stable across replays (deterministic counter advancement), monotone within conversation | local-only | Ordinal increments whenever the compiler observes a material change to the conversation. |
| `work_item` | `work_item_id` = `wi_<uuid>` | foreman decision to schedule work | stable once created, independent of revision | local-only | The terminal durable schedulable unit. UUID because foreman scheduling is a control decision, not a content hash. |
| `evaluation` | `evaluation_id` = `eval_<execution_id>` | `execution_id` of the successful attempt | stable once the attempt succeeds | local-only | 1:1 with a successful execution attempt. Commentary, not state. |
| `execution_attempt` | `execution_id` = `ex_<uuid>` | foreman leasing a work item to a runtime | stable for the duration of the attempt record | local-only | A bounded process in time. Many attempts may fail before one evaluation is produced. |
| `outbound_proposal` | `proposal_id` = `decision_id` = `fd_<uuid>` | foreman decision record | stable once emitted | local-only | Maps 1:1 to the `foreman_decisions` row in coordinator state. |
| `outbound_command` | `outbound_command_id` = `outbound_id` = `ob_<uuid>` | foreman proposal materialized into command | stable once created | local-only | The sole identity used by the outbound worker. |
| `trace` | `trace_id` = `tr_<uuid>` | execution attempt or foreman action | stable once written | local-only | Append-only commentary. Safe to delete without affecting workflow. |
| `chat` | `chat_id` = `ch_<uuid>` (optional) | runtime/UI initiating a multi-turn interaction | ephemeral / correlation-only | runtime-local | Subordinate. Should not span multiple conversations in normal operation. |
| `session` | `session_id` = `sn_<uuid>` (optional) | human operator or daemon launching a batch of work | ephemeral / correlation-only | runtime-local | Looser grouping than chat. NOT a lifecycle object or recovery anchor. |

---

## 2. Relationship Diagram

```
conversation (1)
    │
    ├── 1:N ──► conversation_revision
    │
    ├── 1:N ──► work_item
    │       │
    │       ├── 1:N ──► execution_attempt
    │       │           │
    │       │           ├── 1:1 (on success) ──► evaluation
    │       │           │
    │       │           └── 1:N ──► trace
    │       │
    │       └── 1:0..1 ──► outbound_proposal
    │                   │
    │                   └── 1:1 ──► outbound_command
    │
    └── 1:N (soft) ──► trace  [via conversation_id reference]

session (0..1)
    │
    └── 1:N (soft) ──► execution_attempt

chat (0..1)
    │
    └── 1:1 (soft) ──► execution_attempt  [in normal operation]
```

### Key Cardinalities
- One `conversation` has many `conversation_revision`s (sequenced by monotone ordinal).
- One `conversation` has many `work_item`s over its lifetime.
- One `work_item` may have many `execution_attempt`s (retries, crashes).
- One successful `execution_attempt` produces exactly one `evaluation`.
- One `execution_attempt` produces many `trace`s.
- One `work_item` resolves into zero or one `outbound_proposal`.
- One `outbound_proposal` materializes into exactly one `outbound_command`.
- One `session` may loosely correlate many `execution_attempt`s.
- One `chat` should map to one `execution_attempt` in normal operation.

---

## 3. Normative Rules

1. **Conversation Primacy**: Every `conversation` is keyed exactly by Graph `conversationId`. No other layer may mint alternate canonical thread identities.

2. **Thread Alias Equivalence**: `thread_id === conversation_id`. Where `thread_id` appears in existing tables (`outbound_commands`, `agent_traces`), it is a backward-compatible alias. New control-plane specifications must use `conversation_id`.

3. **Revision Monotonicity**: `conversation_revision` ordinal must be strictly monotone increasing within a `conversation`. Gaps are permitted; decreases are forbidden.

4. **Work Item Independence**: A `work_item_id` keys a foreman-scheduled task, not a conversation+revision pair. Re-scheduling the same conversation after a new revision creates a **new** `work_item`.

5. **Evaluation Derivative**: `evaluation_id` is derived directly from the `execution_id` that produced it (`eval_<execution_id>`). If the execution crashes, no evaluation exists.

6. **Execution Boundedness**: An `execution_id` keys exactly one bounded invocation. It must not be reused across retries or across different work items.

7. **Proposal-to-Command Uniqueness**: One `outbound_proposal` (`decision_id`) materializes into exactly one `outbound_command` (`outbound_id`). The foreman writes both in one transaction.

8. **Trace Attachment Hierarchy**: Every `trace` must attach primarily to an `execution_attempt` (via `execution_id`). Secondary references to `conversation_id`, `work_item_id`, or `outbound_id` are optional soft references only.

9. **No Chat-Centered Keys**: No durable object may be keyed primarily by `chat_id`. `chat_id` is a runtime correlation token, not a system identity.

10. **Session is Not Recovery Anchor**: `session_id` may be used for observability and UI grouping, but crash recovery must never depend on it. A system that has lost all `session_id`s must be able to resume all work from `work_item` and `outbound_command` state alone.

11. **Outbound ID Soft Reference**: `reference_outbound_id` in traces is a soft reference (no foreign key). The outbound worker or trace pruner may delete the referenced command without invalidating the trace store.

12. **Local-Only Control Identities**: All identities from `work_item` downward are local-only UUIDs or local counters. They are not exposed to Graph API or external systems.

---

## 4. Migration Guidance

### Remain Valid
- `conversation_id` in `NormalizedMessage` — unchanged, canonical.
- `thread_id` in `outbound_commands`, `outbound_versions`, `managed_drafts`, `outbound_transitions` — remains valid as an alias. Do not rename columns.
- `outbound_id` in outbound schema — remains the canonical command key.
- `trace_id` in agent trace schema — remains valid.

### Deprecate in New Specs
- Using `thread_id` as the primary conceptual name in new control-plane documentation. Prefer `conversation_id`.
- Treating `session_id` as a lifecycle or recovery object. It is correlation-only.
- Treating `chat_id` as a durable key for any stateful object.

### Acceptable Aliases During Transition
- `thread_id` column names in SQLite may remain for schema stability, with documentation noting `thread_id === conversation_id`.
- `decision_id` may be used interchangeably with `proposal_id` because a foreman decision row is the physical realization of an outbound proposal.

### New Fields to Add
- `conversation_revision_id` or `revision_id` on work items and evaluations (as input context reference, not primary key).
- `execution_id` on agent traces as the primary attachment point.
- `work_item_id` on execution attempts and traces for correlation.

---

## 5. Rejected Identity Collapses

### 1. `work_item_id === conversation_revision_id`
**Why it is wrong**: A single revision may require zero, one, or many independent work items (e.g., triage + obligation extraction + reply drafting). Collapsing them would either create phantom work items for no-op revisions or force unrelated tasks to share an identity.

### 2. `evaluation_id === work_item_id`
**Why it is wrong**: A work item may trigger multiple charter evaluations (primary + secondary), and a single evaluation may be regenerated after a crash. Evaluations are commentary; the work item is the durable job. Their lifecycles differ.

### 3. `execution_id === chat_id`
**Why it is wrong**: A chat is a UI/runtime protocol container. An execution attempt is a single bounded run. One chat may span multiple turns, tool callbacks, and even re-invocations. Conflating them would make crash recovery and lease management dependent on UI session state.

### 4. `outbound_proposal_id === outbound_command_id`
**Why it is wrong**: The proposal (foreman decision) and the command (outbound worker durability) belong to different authority boundaries and different lifecycles. A proposal may be rejected or superseded before it ever becomes a command. A command may be overridden and versioned independently of the original proposal. Collapsing them would erase the foreman→outbound handoff boundary.

---

## 6. Derivation Details

### `revision_id` — Hybrid Monotone Ordinal
```
revision_id = {conversation_id}:rev:{ordinal}
ordinal     = per-conversation counter incremented on every material change
```
- The counter is stored in coordinator SQLite (or derived deterministically from compiled event sequence).
- It is monotone: `ordinal_n+1 > ordinal_n` for the same conversation.
- It is local-only: Graph has no concept of Narada revisions.
- It is stable under replay: replaying the same event sequence for a conversation produces the same sequence of revision IDs.

### `work_item_id` — UUID
```
work_item_id = wi_<uuid>
```
- Assigned by the foreman at the moment a work item is opened.
- Not derived from conversation content because scheduling is a control decision, not a content hash.

### `execution_id` — UUID
```
execution_id = ex_<uuid>
```
- Assigned by the daemon/foreman when leasing a work item to an agent runtime.
- Each retry gets a new `execution_id`.

### `evaluation_id` — Derived from Execution
```
evaluation_id = eval_<execution_id>
```
- Only exists if the execution attempt succeeds.
- This makes evaluation lineage unambiguous without extra join tables.

### `outbound_proposal_id` / `decision_id` — UUID
```
proposal_id = decision_id = fd_<uuid>
```
- Assigned by the foreman when emitting a validated decision.
- Maps 1:1 to the `foreman_decisions` row.

### `outbound_command_id` / `outbound_id` — UUID
```
outbound_command_id = outbound_id = ob_<uuid>
```
- Assigned by the foreman at command creation time (or by the outbound worker if it were creating commands independently, but it does not).

### `trace_id` — UUID
```
trace_id = tr_<uuid>
```
- Assigned at write time. No derivation from content needed.

### `chat_id` — Optional UUID
```
chat_id = ch_<uuid>
```
- Assigned by the UI or runtime initiator. Not durable system truth.

### `session_id` — Optional UUID
```
session_id = sn_<uuid>
```
- Assigned by the UI or daemon batch launcher. Pure correlation token.

---

## Definition of Done

- [x] Every first-class durable object has a canonical key
- [x] Runtime/UI ids are explicitly subordinated
- [x] Conversation/thread relation is closed (`thread_id === conversation_id`)
- [x] Revision/work/execution ids are clearly distinct
- [x] Trace attachment point is chosen (`execution_attempt` primary, with optional soft refs)
- [x] Output is ready to drive schema and interface tasks
