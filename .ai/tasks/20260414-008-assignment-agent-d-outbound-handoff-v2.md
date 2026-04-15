# Assignment — Agent D — Outbound Handoff v2

## Role

You are the outbound/control-plane engineer.

Your job is to define the exact handoff from evaluation/proposal state into outbound commands while preserving Narada’s hard authority boundary that only the outbound worker mutates mailbox state.

## Scope

Primary target:
- `.ai/tasks/20260414-008-assignment-agent-d-outbound-handoff-v2.md`

Read first:
- `.ai/tasks/20260414-002-foreman-core-ontology-and-control-algebra.md`
- `.ai/tasks/20260414-003-identity-lattice-and-canonical-keys.md`
- `.ai/tasks/20260414-004-coordinator-durable-state-v2.md`
- `.ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md`
- `.ai/tasks/20260413-001-outbound-draft-worker-spec.md`
- `packages/exchange-fs-sync/src/outbound/schema.sql`

## Mission

Produce the implementation-ready v2 handoff contract from control-plane evaluation/proposal objects into outbound commands.

## Core Invariants

1. Only outbound worker executes mailbox mutations.
2. Foreman may authorize command creation, but not draft mutation execution.
3. A proposal is not yet a command.
4. Command creation must be idempotent and crash-safe.
5. Commentary/traces must not be required to determine mailbox mutation truth.

---

## Task 1 — Proposal Object

**Decision:** Yes. The control plane needs a first-class `outbound_proposal` object distinct from `outbound_command`.

**Physical realization:** The `outbound_proposal` is realized as a `foreman_decisions` row in the coordinator SQLite database.

### Why a separate proposal object is required

- **Authority separation:** The proposal represents the *foreman’s authorization intent*; the command represents the *executable envelope* consumed by the outbound worker. Keeping them separate preserves the boundary between decision authority and execution authority.
- **Audit and accountability:** A decision record captures `rationale`, `source_charter_ids`, and `decided_at` independently of worker execution details. If a command is later superseded or fails, the decision remains as an immutable audit artifact.
- **Policy override path:** A proposal can be blocked, overridden, or revised without mutating the outbound command state machine directly. The `policy_overrides` table references the `outbound_id` that originated from a decision, not the command row itself.
- **Crash safety:** If the foreman crashes after writing the decision but before writing the command, recovery can resume from the durable decision record.
- **Supersession clarity:** When a newer work item produces a revised proposal, the old decision remains in history while a new decision (and possibly a new command version) moves forward.

### Proposal ownership, mutability, identity, and terminal states

| Property | Rule |
|----------|------|
| **Owner** | Foreman only |
| **Mutability** | Append-only / immutable after creation |
| **Identity** | `decision_id` = `proposal_id` = `fd_<uuid>` |
| **Terminal states** | A proposal is not a process, so it has no terminal state. It is either *pending materialization* (`outbound_id` is null) or *materialized* (`outbound_id` is set). It may also be *superseded* by a newer decision for the same thread, but the row itself is never mutated. |

### Relationship to `outbound_command`

```
foreman_decision (1)
    │
    └── 0..1 ──► outbound_command
```

- One decision produces at most one outbound command.
- The `outbound_id` foreign-key-like soft reference on `foreman_decisions` is set at command creation time.
- The outbound worker never writes `foreman_decisions` rows.

---

## Task 2 — Acceptance Boundary

The foreman may create an outbound command **only** when all of the following preconditions are satisfied:

1. **Work item is in a resolvable state**
   - The `work_item` status must be `executing` or `leased`.
   - The foreman transitions it to `resolved` atomically with command creation.
   - A `work_item` in `failed_terminal`, `cancelled`, or `superseded` may never produce a command.

2. **Evaluation presence**
   - At least one successful `execution_attempt` exists for the work item.
   - The corresponding `evaluation` record is present and parseable.
   - For `no_op` or `escalation` outcomes, the foreman may resolve the work item without creating a command (see Task 6).

3. **Action authorization**
   - The charter-proposed `action_type` is present in the work item’s `allowed_actions` list.
   - The `payload_json` parses as valid JSON and conforms to the action-specific schema.
   - No policy binding rejects the action for this mailbox/thread.

4. **Policy acceptance**
   - Thread-level policy checks pass (e.g., recipient safety for replies).
   - No conflicting active unsent command exists for the same `(thread_id, action_type)` unless the foreman explicitly intends to supersede it.
   - The command does not violate global escalation precedence rules.

5. **Human approval gate (when applicable)**
   - v1 is fully autonomous by default.
   - If a mailbox binding declares `requires_human_approval: true` for the proposed action class, the foreman must hold the proposal in a `pending_approval` state (or emit a decision with a special approval flag) and only materialize the command after an explicit `policy_overrides` or approval record is written.
   - Until the approval system is implemented, the default v1 behavior is auto-approve.

### Atomic acceptance transaction

The foreman wraps the following in a single SQLite transaction:

1. Insert or update `thread_records` (if thread metadata changed).
2. Insert `charter_outputs` for all evaluations used in the decision.
3. Insert `foreman_decisions` (the proposal).
4. If the outcome requires an outbound action, insert `outbound_command` and `outbound_versions`.
5. Update `work_item` status to `resolved` and record `resolved_at`.

If any step fails, the entire transaction rolls back. The work item remains `leased` or `executing` and will be retried.

---

## Task 3 — Idempotent Creation

### Idempotency key

The idempotency basis for command creation is the **`decision_id`**.

### Uniqueness rule

> For a given `decision_id`, at most one `outbound_command` may exist.

### Idempotency enforcement

Before inserting an `outbound_command`, the foreman checks:

```sql
select outbound_id from foreman_decisions where decision_id = ? and outbound_id is not null;
```

- If a row exists with `outbound_id` set, the foreman skips command creation and treats the handoff as already complete.
- If no row exists, the foreman inserts the `foreman_decisions` row and the `outbound_command` row in one transaction, then sets `outbound_id` on the decision.

### Deterministic `outbound_id` generation (optional but recommended)

To further guard against duplicate commands across crashes, the foreman may derive `outbound_id` deterministically from `decision_id`:

```typescript
outbound_id = `ob_${hash(decision_id)}`;
```

This guarantees that even if the foreman retries command creation after a partial crash, the same `outbound_id` is produced, and SQLite primary-key uniqueness on `outbound_commands.outbound_id` prevents duplicates.

### Idempotency of versions

- The initial command version is always `1`.
- If a later policy override or revision requires a new command version, the foreman creates a new `decision_id` and either:
  - creates a new `outbound_command` with its own `outbound_id`, or
  - advances the version on the existing `outbound_command` (see `policy_overrides` semantics in 20260413-012).

---

## Task 4 — Failure Semantics

### Case A — Evaluation complete, crash before command create

**Scenario:** The charter returns a valid output envelope. The foreman persists the `evaluation`, but crashes before inserting `foreman_decisions` and `outbound_command`.

**Recovery:**
1. The daemon re-leases the `work_item` (or the foreman scan picks it up).
2. The foreman sees that a successful `execution_attempt` and `evaluation` exist for the work item.
3. The foreman re-runs validation and arbitration.
4. It checks `foreman_decisions` for an existing decision linked to this `work_item_id`.
5. If none exists, it creates the decision and command atomically.
6. If a decision already exists (partial write succeeded), it proceeds from the existing state.

**Key invariant:** The foreman never depends on traces to determine whether a command was created. It queries `foreman_decisions` and `outbound_commands` directly.

### Case B — Command create succeeds, crash before scheduler records completion

**Scenario:** The SQLite transaction committing `foreman_decisions` + `outbound_command` succeeds, but the foreman process crashes before updating the `work_item` to `resolved`.

**Recovery:**
1. On re-entry, the foreman queries `outbound_commands` for any command whose `created_by` references this foreman and whose `decision_id` maps to the current `work_item`.
2. If a command exists and the decision row points to it, the foreman concludes the handoff already succeeded.
3. The foreman updates the `work_item` status to `resolved` in a new transaction.
4. The outbound worker independently picks up the command and executes it.

**Key invariant:** The outbound worker does not wait for the foreman to mark the work item resolved.

### Case C — Duplicate reevaluation tries to create the same command

**Scenario:** A second charter evaluation for the same work item arrives (e.g., a retry or a secondary charter update). The foreman decides the same action.

**Recovery:**
1. The foreman generates the same `decision_id` (if deterministic) or a new one.
2. If deterministic `decision_id` is used, the idempotency check on `foreman_decisions.outbound_id` prevents duplicate command insertion.
3. If a new `decision_id` is used, the foreman must enforce `(work_item_id, approved_action)` uniqueness at the application layer: before creating a new command, it checks whether an active unsent command already exists for the same work item and action. If one exists, it either supersede-cancels the old one or skips creation.

**Recommended rule:** Use deterministic `decision_id = hash(work_item_id + approved_action + version_counter)` so the database primary key naturally deduplicates.

### Case D — Superseding revision arrives before execution

**Scenario:** A new `conversation_revision` arrives while an `outbound_command` is still `pending` or `draft_ready`. The foreman creates a new `work_item` for the revised thread context.

**Behavior:**
1. The new work item is independent of the old one.
2. The old outbound command remains in the outbound worker queue.
3. If the old command has not yet reached `sending`, the foreman may explicitly transition it to `cancelled` or `superseded` as part of resolving the new work item.
4. If the old command has already reached `sending` or `submitted`, the foreman does not attempt to cancel it. Reconciliation will confirm it, and the new work item may produce a follow-up command if necessary.

**Key invariant:** The control plane does not try to “recall” a command that has already been handed to the outbound worker past the `draft_ready` gate.

---

## Task 5 — Read Surfaces

### What control-plane components may read from outbound state

| Component | Allowed Reads | Forbidden Reads |
|-----------|---------------|-----------------|
| **Foreman** | `outbound_commands.status`, `latest_version`, `action_type` for a thread; `confirmed_at` to know whether a prior proposal materialized | Must not read `managed_drafts` Graph handles; must not infer state from trace text |
| **Daemon scheduler** | `work_item` state only; may query whether a thread has `pending` outbound commands to apply backpressure | Must not query `outbound_versions` payloads or draft internals |
| **Coordinator UI / observer** | Read-only access to all tables for display; no writes | Must not use trace store as authoritative state |
| **Outbound worker** | Full read/write ownership of `outbound_commands`, `outbound_versions`, `managed_drafts`, `outbound_transitions` | Must not write `foreman_decisions`, `work_item`, or `charter_outputs` |

### What must never be inferred from traces alone

- Whether an outbound command was created
- Whether a command was submitted or confirmed
- Whether a work item is resolved
- Whether a draft exists in Graph
- Whether a mailbox mutation succeeded
- The current status of any workflow object

**Normative rule:**
> Any control-plane process that needs to know the state of an outbound handoff must query `foreman_decisions` and `outbound_commands` directly. Traces are commentary for humans and debuggers, not machine-readable workflow state.

---

## Task 6 — Rejection / No-Op / Clarification

### No-Op outcome

When a charter returns `outcome: "no_op"` and `proposed_actions` is empty:

1. The foreman resolves the `work_item` with `resolution_type: "no_op"`.
2. No `foreman_decisions` row is created.
3. No `outbound_command` is created.
4. The work item is terminal.

### Clarification needed outcome

When a charter returns `outcome: "clarification_needed"`:

1. The foreman has three options:
   - **Re-invoke:** Lease the same work item again with expanded context (e.g., additional tools or prior evaluations).
   - **Escalate:** Resolve the work item as `escalated` and create a human-review record (no outbound command).
   - **No-op:** Resolve the work item as `no_op` if clarification is impossible.
2. No outbound command is created unless a subsequent re-invocation produces a complete evaluation with an action.

### Rejection / blocked policy outcome

When validation or policy rejects a proposed action:

1. If the rejection is due to a transient condition (e.g., missing participant record, rate limit), the foreman may:
   - Transition the work item to `failed_retryable` and allow retry, or
   - Re-invoke the charter with updated policy context.
2. If the rejection is due to a hard policy violation (e.g., recipient not on thread, forbidden action type), the foreman may:
   - Resolve the work item as `blocked_policy` (work-item-level), or
   - Create a `foreman_decisions` row noting the block, but **not** create an `outbound_command`.
3. If a human or supervisor later writes a `policy_overrides` row, the foreman may create a new decision and command version that clears the block.

### Escalation outcome

When a charter returns `outcome: "escalation"`:

1. The foreman resolves the work item as `escalated`.
2. No outbound command is created.
3. The foreman may write a `foreman_decisions` row with `approved_action: "escalate_to_human"` (or similar sentinel) for audit, but this decision is explicitly non-executable and must never produce an `outbound_command`.

### Summary table

| Evaluation outcome | Decision created? | Command created? | Work item resolution |
|--------------------|-------------------|------------------|----------------------|
| `complete` + valid action | Yes | Yes | `resolved` |
| `no_op` | No | No | `resolved` (no-op) |
| `clarification_needed` | No | No | `failed_retryable` or `escalated` |
| `escalation` | Optional (audit only) | No | `escalated` |
| Rejected / blocked | Optional (audit only) | No | `blocked_policy` or `failed_retryable` |

---

## Handoff State Machine

```text
work_item (executing)
    │
    ▼
foreman validates evaluation
    │
    ├──▶ no_op / escalation / blocked
    │       │
    │       ▼
    │   work_item resolved (no outbound command)
    │
    └──▶ action approved
            │
            ▼
    foreman_decisions (proposal)
            │
            ▼
    outbound_command (pending)
            │
            ▼
    outbound worker claims command
            │
            ├──▶ draft_creating -> draft_ready
            │       │
            │       ├──▶ superseded / cancelled / blocked_policy
            │       │
            │       └──▶ sending -> submitted -> confirmed
            │
            └──▶ non-send action executed -> submitted -> confirmed
```

### State ownership

- `work_item` states: foreman / daemon scheduler
- `foreman_decisions`: foreman (append-only)
- `outbound_command` status before `sending`: outbound worker (with foreman able to cancel/supersede)
- `outbound_command` status `sending` and beyond: outbound worker only

---

## Required Preconditions for Command Creation

1. `work_item.status` is `executing` or `leased`.
2. A successful `evaluation` exists for the work item.
3. The proposed `action_type` is in `allowed_actions`.
4. `payload_json` is valid JSON conforming to action schema.
5. Thread-level policy checks pass.
6. No conflicting active command exists for `(thread_id, action_type)`, or the foreman explicitly intends to supersede it.
7. Human approval gate is satisfied (or auto-approved in v1).

---

## Idempotency Rules

1. **Decision-level idempotency:** `decision_id` is the primary idempotency key. At most one `outbound_command` may be created per `decision_id`.
2. **Deterministic outbound ID:** `outbound_id` may be derived deterministically from `decision_id` to guard against duplicate rows across crash retries.
3. **Work-item + action uniqueness:** At most one active unsent command may exist per `(work_item_id, approved_action)`. New intent must supersede or cancel the old one.
4. **Transaction atomicity:** `foreman_decisions` insertion and `outbound_command` creation are committed in a single SQLite transaction.
5. **Re-entrant recovery:** If the foreman finds a `foreman_decisions` row with `outbound_id` already set, it skips command creation and proceeds to resolve the work item.

---

## Crash Recovery Rules

1. **Lost decision, no command:** Re-evaluate → check for existing decision → create decision + command atomically.
2. **Decision + command committed, work item not resolved:** Query `outbound_commands` by decision reference → confirm handoff succeeded → update work item to `resolved`.
3. **Duplicate retry:** Primary-key uniqueness on `outbound_id` and the `foreman_decisions.outbound_id` soft reference prevent double creation.
4. **Superseding revision mid-flight:** Old commands remain in outbound queue. Foreman may cancel unsent commands; sent/submitted commands are left for reconciliation.
5. **Trace independence:** Recovery never reads agent traces to determine whether a command exists or what its status is.

---

## Integration Notes for Scheduler / Foreman / Outbound Worker Ownership

### Foreman
- **Writes:** `thread_records`, `charter_outputs`, `foreman_decisions`, `outbound_commands` (initial creation only), `work_item` (status transitions).
- **Reads:** `conversation` context from compiler output, `evaluation` records, `outbound_commands` (status checks).
- **Must never:** execute Graph mutations, update `managed_drafts`, or use traces as state.

### Outbound Worker
- **Writes:** `outbound_commands` (status updates, version advances), `outbound_versions`, `managed_drafts`, `outbound_transitions`.
- **Reads:** `outbound_commands` and `outbound_versions`.
- **Must never:** write `foreman_decisions`, `charter_outputs`, or `work_item` state.

### Daemon Scheduler
- **Writes:** `work_item` leases (via foreman API), `execution_attempt` records.
- **Reads:** `work_item` state only.
- **Must never:** read `outbound_commands` status to decide scheduling.

### Shared Database Boundary
- All tables live in the same SQLite database (`<data-dir>/coordinator/coordinator.db`).
- Cross-table foreign keys are safe because there is only one writer process per mailbox (v1), or because SQLite WAL mode handles concurrent reads.
- The foreman and outbound worker coordinate by writing rows, not by message passing.

---

## Deliverables Checklist

- [x] Handoff state machine
- [x] Required preconditions for command creation
- [x] Idempotency rules
- [x] Crash recovery rules
- [x] Integration notes for scheduler/foreman/outbound worker ownership

## Parallel To

May run in parallel with:
- Agent A — Scheduler and Leases
- Agent B — Charter Invocation v2
- Agent C — Tool Binding Runtime
- Agent E — Replay and Recovery Tests
- Agent F — Daemon-Foreman Dispatch

## Constraints

Do not:
- redesign outbound worker internals unrelated to handoff
- implement SMTP/Graph send behavior
- allow charter runtime to write commands directly
- use traces as authoritative handoff state
