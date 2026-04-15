# Coordinator Durable State v2

## Mission

Design the durable local control-plane state for Narada after ontology and identity closure.

This task converts the results of the ontology (`20260414-002`) and identity (`20260414-003`) tasks into a concrete, minimal, implementation-ready persistence model without introducing a second authority system.

## Scope

Architecture/spec only. No implementation code.

Primary target:
- `.ai/tasks/20260414-004-coordinator-durable-state-v2.md`

Read first:
- `.ai/tasks/20260414-002-foreman-core-ontology-and-control-algebra.md`
- `.ai/tasks/20260414-003-identity-lattice-and-canonical-keys.md`
- `.ai/tasks/20260414-011-chief-integration-control-plane-v2.md` (integration synthesis)

Context to inspect:
- `.ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md`
- `.ai/tasks/20260413-009-agent-trace-persistence.md`
- `packages/exchange-fs-sync/src/outbound/schema.sql`
- `packages/exchange-fs-sync/src/coordinator/store.ts`
- `packages/exchange-fs-sync/src/coordinator/types.ts`

## Goal

Produce the normative SQLite-side durable model for the control plane.

The output answers:
1. Which objects get their own tables?
2. Which objects are append-only vs mutable?
3. Which joins are canonical?
4. Which objects are required for correctness versus commentary?
5. What minimal indexes and constraints are required?
6. How does crash recovery re-enter safely?

---

## 1. First-Class Tables

The control plane stores the following objects in one SQLite database per mailbox (`<data-dir>/coordinator/coordinator.db`).

| Table | Purpose | Rationale |
|-------|---------|-----------|
| `conversation_records` | Coordinator-side metadata for each conversation (charter assignment, status, timestamps) | The compiler already writes the mailbox truth to the filesystem. This table stores control-plane metadata that the compiler does not own. |
| `conversation_revisions` | Ordinal counter for observed compiler revisions per conversation | Required for deterministic `revision_id` generation (`{conversation_id}:rev:{ordinal}`). |
| `work_items` | The terminal schedulable unit of control work | Central to the scheduler; must be durable and recoverable. |
| `work_item_leases` | Durable lease records for work-item execution authority | Crash-safe scheduling requires lease state to survive process restarts. |
| `execution_attempts` | Bounded invocation records for every charter/agent runtime execution | Required for replay, retry, and audit. |
| `evaluations` | Durable structured summary of successful charter output | Machine-readable output used by foreman arbitration. Distinct from trace. |
| `charter_outputs` | **Retained from Task 012.** Legacy charter output table. | Deprecated in favor of `evaluations`. Existing data may be kept read-only; new writes go to `evaluations`. |
| `foreman_decisions` | **Retained from Task 012.** Outbound proposals. | Already implemented in `coordinator/store.ts`. Append-only proposal records. |
| `outbound_commands` | **Retained from Task 012.** Executable command envelope. | Owned by outbound worker; not redesigned, only referenced. |
| `outbound_versions` | **Retained from Task 012.** Versioned command payloads. | Append-only history of command payload versions. |
| `managed_drafts` | **Retained from Task 012.** Graph draft bindings. | Links outbound command to Graph draft ID. |
| `outbound_transitions` | **Retained from Task 012.** Status audit log. | Append-only state machine transitions. |
| `tool_call_records` | Durable record of every tool invocation | Required for audit, replay, and safety. Distinct from trace. |
| `policy_overrides` | **Retained from Task 012.** Human policy overrides. | Append-only audit of blocked-policy overrides. |
| `agent_traces` | **Retained from Task 012.** Commentary/debugging logs. | Pruneable; must not drive state transitions. |

### Excluded Tables (Justification)

| Concept | Decision | Why |
|---------|----------|-----|
| `sessions` | **Not a first-class table** | `session_id` is an optional correlation token, not a durable object. It may appear as an optional column on `execution_attempts`. |
| `chats` | **Not a first-class table** | `chat_id` is a UI/runtime protocol token. Not persisted in any first-class table. |
| `outbound_proposals` (separate table) | **Merged into `foreman_decisions`** | Task 012 already created `foreman_decisions` for this purpose. No separate table needed. |

---

## 2. Object-to-Table Mapping

| Ontology Object | Table(s) | Mapping Notes |
|-----------------|----------|---------------|
| `conversation` | `conversation_records` | 1:1. `thread_id` column retained for backward compatibility; value equals `conversation_id`. |
| `conversation_revision` | `conversation_revisions` | 1:N per conversation. `ordinal` is strictly monotone increasing. |
| `work_item` | `work_items` | 1:1 per `work_item_id`. References `conversation_records(conversation_id)`. |
| `lease` | `work_item_leases` | 1:N per work item. At most one unreleased, unexpired lease at a time. |
| `execution_attempt` | `execution_attempts` | 1:1 per `execution_id`. References `work_items(work_item_id)`. |
| `evaluation` | `evaluations` | 1:1 per successful execution attempt. References `execution_attempts(execution_id`). |
| `outbound_proposal` | `foreman_decisions` | 1:1 per `decision_id`. References `work_items` implicitly via the foreman transaction. Soft reference to `outbound_commands(outbound_id)`. |
| `outbound_command` | `outbound_commands` + `outbound_versions` | 1:1 command row, 1:N version rows. Owned by outbound worker boundary. |
| `tool_call` | `tool_call_records` | 1:N per execution attempt. References `execution_attempts(execution_id)`. |
| `trace` | `agent_traces` | 1:N per execution attempt (or work item). Pruneable commentary. |
| `session` | **Not persisted** | Optional `session_id` string column on `execution_attempts` only. |
| `chat` | **Not persisted** | Runtime-only token. |

---

## 3. Mutability and Retention Matrix

| Table | Mutability | Retention Stance | Rationale |
|-------|------------|------------------|-----------|
| `conversation_records` | **Mutable state record** | Forever (or archive after conversation deletion) | Lightweight metadata record. |
| `conversation_revisions` | **Append-only** | Forever | Small rows; critical for deterministic replay. |
| `work_items` | **Mutable state record** | Forever | Audit and quiescence checks require full history. |
| `work_item_leases` | **Append-mostly** (release updates `released_at`) | Pruneable after work item reaches terminal state (>30 days) | Large volume potential; not needed for long-term audit once terminal. |
| `execution_attempts` | **Append-only** | Forever | Small rows; critical for replay and audit. |
| `evaluations` | **Append-only** | Forever | Machine-readable prior context. |
| `charter_outputs` | **Append-only** | Forever | Existing table; retained. |
| `foreman_decisions` | **Append-only** | Forever | Proposal audit trail. |
| `outbound_commands` | **Mutable status** | Forever | Command audit trail. |
| `outbound_versions` | **Append-only** | Forever | Payload history. |
| `managed_drafts` | **Mutable / append-only** | Pruneable after command confirmed (>30 days) | Draft bindings are temporary operational state. |
| `outbound_transitions` | **Append-only** | Pruneable after command terminal (>30 days) | Transition log can be compacted once terminal. |
| `tool_call_records` | **Append-only** | Forever | Audit and safety analysis. |
| `policy_overrides` | **Append-only** | Forever | Compliance audit. |
| `agent_traces` | **Append-only** (pruneable) | Pruneable after 7–30 days | Commentary only; correctness must not depend on it. |

---

## 4. Schema Design (Normative)

The following SQL table definitions are normative for the v2 control-plane durable state.

They are designed to coexist with the existing Task 012 outbound schema in the same SQLite database.

```sql
-- ============================================================
-- 1. CONVERSATION RECORDS (control-plane metadata)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_records (
  conversation_id TEXT PRIMARY KEY,
  mailbox_id      TEXT NOT NULL,
  -- Backward compatibility: thread_id is maintained as a column alias conceptually,
  -- but in this schema we use conversation_id directly. If migrating from old
  -- thread_records, keep thread_id column with SAME value as conversation_id.
  thread_id       TEXT GENERATED ALWAYS AS (conversation_id) STORED,

  primary_charter        TEXT NOT NULL,
  secondary_charters_json TEXT NOT NULL DEFAULT '[]',
  status                 TEXT NOT NULL DEFAULT 'active',
  assigned_agent         TEXT,

  last_message_at        TEXT, -- ISO 8601
  last_inbound_at        TEXT,
  last_outbound_at       TEXT,
  last_analyzed_at       TEXT,
  last_triaged_at        TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversation_records_mailbox
  ON conversation_records(mailbox_id, status, updated_at);

-- ============================================================
-- 2. CONVERSATION REVISIONS (monotone ordinal tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_revisions (
  revision_record_id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id    TEXT NOT NULL,
  ordinal            INTEGER NOT NULL,
  observed_at        TEXT NOT NULL DEFAULT (datetime('now')),
  trigger_event_id   TEXT, -- optional compiler event_id that caused this revision

  UNIQUE (conversation_id, ordinal),
  FOREIGN KEY (conversation_id) REFERENCES conversation_records(conversation_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_revisions_lookup
  ON conversation_revisions(conversation_id, ordinal);

-- ============================================================
-- 3. WORK ITEMS (terminal schedulable unit)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_items (
  work_item_id     TEXT PRIMARY KEY, -- wi_<uuid>
  conversation_id  TEXT NOT NULL,
  mailbox_id       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'opened',
    -- opened, leased, executing, resolved, failed_retryable, failed_terminal, superseded, cancelled
  priority         INTEGER NOT NULL DEFAULT 0,
  opened_for_revision_id TEXT NOT NULL, -- revision_id when work item was opened
  resolved_revision_id   TEXT,          -- revision_id at resolution (if any)
  resolution_outcome     TEXT,          -- no_op, action_created, escalated, failed
  error_message          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (conversation_id) REFERENCES conversation_records(conversation_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_work_items_runnable
  ON work_items(conversation_id, status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_work_items_mailbox_status
  ON work_items(mailbox_id, status, updated_at);

-- ============================================================
-- 4. WORK ITEM LEASES (crash-safe scheduling)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_item_leases (
  lease_id      TEXT PRIMARY KEY, -- ls_<uuid>
  work_item_id  TEXT NOT NULL,
  acquired_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  heartbeat_at  TEXT,
  released_at   TEXT,
  released_reason TEXT,
  process_id    TEXT NOT NULL, -- identifier of acquiring process/host

  FOREIGN KEY (work_item_id) REFERENCES work_items(work_item_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_work_item_leases_active
  ON work_item_leases(work_item_id, released_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_work_item_leases_stale_scan
  ON work_item_leases(released_at, expires_at, acquired_at);

-- ============================================================
-- 5. EXECUTION ATTEMPTS (bounded invocations)
-- ============================================================
CREATE TABLE IF NOT EXISTS execution_attempts (
  execution_id    TEXT PRIMARY KEY, -- ex_<uuid>
  work_item_id    TEXT NOT NULL,
  revision_id     TEXT NOT NULL,
  session_id      TEXT, -- optional correlation token only
  status          TEXT NOT NULL DEFAULT 'started',
    -- started, active, succeeded, crashed, abandoned
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT,
  runtime_envelope_json TEXT NOT NULL, -- frozen CharterInvocationEnvelope
  outcome_json    TEXT, -- result payload or error details
  error_message   TEXT,

  FOREIGN KEY (work_item_id) REFERENCES work_items(work_item_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_execution_attempts_work_item
  ON execution_attempts(work_item_id, started_at);
CREATE INDEX IF NOT EXISTS idx_execution_attempts_session
  ON execution_attempts(session_id) WHERE session_id IS NOT NULL;

-- ============================================================
-- 6. EVALUATIONS (durable charter output summary)
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluations (
  evaluation_id   TEXT PRIMARY KEY, -- eval_<execution_id>
  execution_id    TEXT NOT NULL UNIQUE,
  work_item_id    TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  charter_id      TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
  output_version  TEXT NOT NULL,
  analyzed_at     TEXT NOT NULL DEFAULT (datetime('now')),

  -- Machine-readable structured outputs
  summary             TEXT NOT NULL,
  classifications_json TEXT NOT NULL DEFAULT '{}',
  facts_json          TEXT NOT NULL DEFAULT '[]',
  escalations_json    TEXT NOT NULL DEFAULT '[]',
  proposed_actions_json TEXT NOT NULL DEFAULT '[]',
  tool_requests_json  TEXT NOT NULL DEFAULT '[]',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (execution_id) REFERENCES execution_attempts(execution_id)
    ON DELETE CASCADE,
  FOREIGN KEY (work_item_id) REFERENCES work_items(work_item_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evaluations_conversation
  ON evaluations(conversation_id, analyzed_at);
CREATE INDEX IF NOT EXISTS idx_evaluations_work_item
  ON evaluations(work_item_id, analyzed_at);

-- ============================================================
-- 7. TOOL CALL RECORDS (durable tool invocation audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS tool_call_records (
  tool_call_id   TEXT PRIMARY KEY, -- tc_<uuid>
  execution_id   TEXT NOT NULL,
  work_item_id   TEXT NOT NULL,
  tool_name      TEXT NOT NULL,
  tool_signature TEXT NOT NULL, -- e.g. "tool_name@catalog_version"
  request_json   TEXT NOT NULL,
  response_json  TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
    -- pending, success, timeout, permission_denied, error, budget_exceeded
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at   TEXT,
  error_message  TEXT,

  FOREIGN KEY (execution_id) REFERENCES execution_attempts(execution_id)
    ON DELETE CASCADE,
  FOREIGN KEY (work_item_id) REFERENCES work_items(work_item_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_execution
  ON tool_call_records(execution_id, started_at);
CREATE INDEX IF NOT EXISTS idx_tool_calls_work_item
  ON tool_call_records(work_item_id, started_at);
```

### Existing Task 012 Tables (Retained, Not Redesigned)

The following tables continue to exist exactly as implemented in Task 012:
- `thread_records` — **deprecated** in favor of `conversation_records`. A migration path copies data from `thread_records` to `conversation_records` on first startup.
- `charter_outputs` — legacy table retained read-only. New evaluations are written to `evaluations`.
- `foreman_decisions`
- `policy_overrides`
- `outbound_commands`
- `outbound_versions`
- `managed_drafts`
- `outbound_transitions`
- `agent_traces`

---

## 5. TypeScript Store Interfaces

These interfaces define the contract that the scheduler, foreman, and charter runtime will use. They are **specification only**; implementation belongs to future tasks.

```typescript
// ------------------------------------------------------------
// 5.1 Conversation Records
// ------------------------------------------------------------
export interface ConversationRecord {
  conversation_id: string;
  mailbox_id: string;
  primary_charter: string;
  secondary_charters_json: string;
  status: 'active' | 'archived' | 'deleted';
  assigned_agent: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_analyzed_at: string | null;
  last_triaged_at: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------
// 5.2 Conversation Revisions
// ------------------------------------------------------------
export interface ConversationRevision {
  revision_record_id: number;
  conversation_id: string;
  ordinal: number;
  observed_at: string;
  trigger_event_id: string | null;
}

// ------------------------------------------------------------
// 5.3 Work Items
// ------------------------------------------------------------
export type WorkItemStatus =
  | 'opened'
  | 'leased'
  | 'executing'
  | 'resolved'
  | 'failed_retryable'
  | 'failed_terminal'
  | 'superseded'
  | 'cancelled';

export interface WorkItem {
  work_item_id: string;
  conversation_id: string;
  mailbox_id: string;
  status: WorkItemStatus;
  priority: number;
  opened_for_revision_id: string;
  resolved_revision_id: string | null;
  resolution_outcome: 'no_op' | 'action_created' | 'escalated' | 'failed' | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------
// 5.4 Work Item Leases
// ------------------------------------------------------------
export interface WorkItemLease {
  lease_id: string;
  work_item_id: string;
  acquired_at: string;
  expires_at: string;
  heartbeat_at: string | null;
  released_at: string | null;
  released_reason: string | null;
  process_id: string;
}

// ------------------------------------------------------------
// 5.5 Execution Attempts
// ------------------------------------------------------------
export type ExecutionAttemptStatus =
  | 'started'
  | 'active'
  | 'succeeded'
  | 'crashed'
  | 'abandoned';

export interface ExecutionAttempt {
  execution_id: string;
  work_item_id: string;
  revision_id: string;
  session_id: string | null;
  status: ExecutionAttemptStatus;
  started_at: string;
  completed_at: string | null;
  runtime_envelope_json: string;
  outcome_json: string | null;
  error_message: string | null;
}

// ------------------------------------------------------------
// 5.6 Evaluations
// ------------------------------------------------------------
export interface Evaluation {
  evaluation_id: string;
  execution_id: string;
  work_item_id: string;
  conversation_id: string;
  charter_id: string;
  role: 'primary' | 'secondary';
  output_version: string;
  analyzed_at: string;
  summary: string;
  classifications_json: string;
  facts_json: string;
  escalations_json: string;
  proposed_actions_json: string;
  tool_requests_json: string;
  created_at: string;
}

// ------------------------------------------------------------
// 5.7 Tool Call Records
// ------------------------------------------------------------
export type ToolCallStatus =
  | 'pending'
  | 'success'
  | 'timeout'
  | 'permission_denied'
  | 'error'
  | 'budget_exceeded';

export interface ToolCallRecord {
  tool_call_id: string;
  execution_id: string;
  work_item_id: string;
  tool_name: string;
  tool_signature: string;
  request_json: string;
  response_json: string | null;
  status: ToolCallStatus;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}
```

---

## 6. Constraint Rules

1. **Every `work_item` belongs to exactly one `conversation_records` row.**
   - Enforced by `FOREIGN KEY (conversation_id)`.

2. **Every `work_item_leases` row references exactly one `work_item`.**
   - Enforced by `FOREIGN KEY (work_item_id)`.

3. **At most one unreleased, unexpired lease may exist for a given `work_item`.**
   - Enforced at application level (scheduler `BEGIN IMMEDIATE` transaction + `INSERT` after `SELECT` validation).

4. **Every `execution_attempt` references exactly one `work_item`.**
   - Enforced by `FOREIGN KEY (work_item_id)`.

5. **Every `evaluation` references exactly one successful `execution_attempt`.**
   - Enforced by `FOREIGN KEY (execution_id)` and application-level check that `execution_attempts.status = 'succeeded'` before insert.

6. **Every `foreman_decision` references exactly one `work_item`.**
   - Enforced by the foreman transaction which includes the work item resolution update.

7. **A `foreman_decision` may reference at most one `outbound_command` via `outbound_id`.**
   - `outbound_id` is nullable and unique in the decision creation context.

8. **An `outbound_command` is created by at most one `foreman_decision`.**
   - Enforced by generating the `outbound_id` inside the atomic foreman transaction and linking it to exactly one decision.

9. **Every `tool_call_record` references exactly one `execution_attempt`.**
   - Enforced by `FOREIGN KEY (execution_id)`.

10. **`agent_traces` may not be the sole record of `work_item` resolution state.**
    - Enforced by design: work item status transitions are recorded in `work_items` and `outbound_transitions`.

11. **`conversation_revisions` ordinals must be strictly monotone within a `conversation_id`.**
    - Enforced by `UNIQUE (conversation_id, ordinal)` and application-level increment logic.

12. **Only one `work_item` per `conversation_id` may be `leased` or `executing` at a time.**
    - Enforced by scheduler selection logic (skips conversations with active non-terminal work items).

---

## 7. Transaction Boundaries and Crash Recovery

### 7.1 Work Opening Transaction

**Scope**: `conversation_records` (upsert) + `conversation_revisions` (insert) + `work_items` (insert/supersede)

**Crash before commit**: No durable work item exists. Next sync cycle will re-open.

**Crash after commit**: Work item exists in `opened` state. Scheduler will pick it up normally.

### 7.2 Lease Acquisition Transaction

**Scope**: `work_item_leases` (insert) + `work_items` (status → `leased`)

**Crash before commit**: Lease row missing or work item still `opened`. Recovery scanner will treat as unleased.

**Crash after commit**: Lease exists. If the process died, the recovery scanner will find `expires_at < now` and release it, returning work item to `opened`.

### 7.3 Execution Start Transaction

**Scope**: `execution_attempts` (insert) + `work_items` (status → `executing`)

**Crash before commit**: No execution attempt exists. Work item remains `leased` until lease expires.

**Crash after commit**: Execution attempt exists in `active`. The scheduler/foreman must implement a "stuck attempt scanner" that either resumes the attempt or cancels it after a timeout.

### 7.4 Charter Output + Tool Calls Transaction

**Scope**: `evaluations` (insert) + `tool_call_records` (batch insert)

**Crash before commit**: No evaluation exists. Execution attempt remains `active`. The foreman must reject `active` attempts without evaluations after a timeout.

**Crash after commit**: Evaluation exists. Foreman can proceed to arbitration.

### 7.5 Foreman Resolution Transaction

**Scope**: `work_items` (status → `resolved`) + `foreman_decisions` (insert) + optionally `outbound_commands` (insert) + `outbound_versions` (insert) + `foreman_decisions.outbound_id` (update)

**Crash before commit**: Work item remains `executing`. Stuck attempt scanner must detect and retry/cancel.

**Crash after commit**: Decision exists. If outbound command was also inserted, the outbound worker will execute it. If only decision was inserted (no-op outcome), system is quiescent.

### 7.6 Outbound Worker State Transitions

Owned entirely by the outbound worker tables (`outbound_commands`, `outbound_versions`, `managed_drafts`, `outbound_transitions`). The control plane does not mutate these directly.

---

## 8. Migration Strategy

### From `thread_records` (Task 012) to `conversation_records`

1. On `initSchema()`, detect if `thread_records` exists and `conversation_records` does not.
2. Create `conversation_records` with `thread_id` as a generated column (or simply copy `thread_id` into `conversation_id`).
3. Migrate data:
   ```sql
   INSERT INTO conversation_records (
     conversation_id, mailbox_id, primary_charter, secondary_charters_json,
     status, assigned_agent, last_message_at, last_inbound_at, last_outbound_at,
     last_analyzed_at, last_triaged_at, created_at, updated_at
   )
   SELECT
     thread_id, mailbox_id, primary_charter, secondary_charters_json,
     status, assigned_agent, last_message_at, last_inbound_at, last_outbound_at,
     last_analyzed_at, last_triaged_at, created_at, updated_at
   FROM thread_records;
   ```
4. Retain `thread_records` for rollback safety during the v2 rollout; mark deprecated in documentation.

### From `charter_outputs` to `evaluations`

`evaluations` is the new canonical physical table for all charter output summaries.

Historical `charter_outputs` rows may be left in place as a read-only legacy table. Going forward, all code writes to `evaluations`. A runtime migration is not required: the system simply begins populating `evaluations` on first use. If historical context is needed, the foreman may query `charter_outputs` for records that predate the `evaluations` table, or a background job may optionally backfill synthetic `execution_id` / `work_item_id` references later.

### New Tables

- `conversation_revisions`, `work_items`, `work_item_leases`, `execution_attempts`, `tool_call_records` are net-new and created on first schema init.

---

## 9. Ordering Requirements

| Domain | Ordering Rule | Mechanism |
|--------|---------------|-----------|
| `conversation_revisions` | Strictly monotone per `conversation_id` | `ordinal` integer counter, atomically incremented |
| `work_items` within conversation | Creation order | `created_at` or auto-increment surrogate |
| `execution_attempts` within work item | Start order | `started_at` |
| `work_item_leases` | Acquisition order | `acquired_at` |
| `foreman_decisions` | Decision order | `decided_at` (or `created_at`) |
| `outbound_transitions` | Transition order | `transitioned_at` (existing Task 012 column) |
| `agent_traces` | Append order | `recorded_at` (existing Task 012 column) |

---

## 10. Correctness vs Commentary Separation

| Correctness-Critical | Commentary / Optional |
|----------------------|----------------------|
| `conversation_records` | `agent_traces` |
| `conversation_revisions` | `sessions` (not persisted) |
| `work_items` | `chats` (not persisted) |
| `work_item_leases` | — |
| `execution_attempts` | — |
| `evaluations` | — |
| `foreman_decisions` | — |
| `outbound_commands` | — |
| `tool_call_records` | — |

**Rule of thumb**: If deleting the table would break crash recovery or replay, it is correctness-critical. If the system could restart and reach the same state without it, it is commentary.

---

## Definition of Done

- [x] Durable object set is explicit (first-class tables listed and justified).
- [x] Commentary vs correctness state is separated (Section 10).
- [x] Retention stance is explicit (Section 3 matrix).
- [x] Ordering requirements are explicit (Section 9).
- [x] Output is sufficient to drive scheduler, charter, and outbound tasks.
- [x] Normative SQL schema provided for all new control-plane tables.
- [x] TypeScript interfaces defined for all new objects.
- [x] Constraint rules enumerated (≥10).
- [x] Transaction boundaries and crash recovery semantics defined.
- [x] Migration strategy from Task 012 schema specified.
