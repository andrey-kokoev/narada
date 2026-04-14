# Coordinator State And Foreman-Outbound Handoff

## Mission
Close the semantic cavities between the foreman/charter architecture, the outbound worker spec, and the agent trace store by defining the canonical coordinator durable state schema and the exact handoff contract from foreman decision to outbound command.

## Why This Is Blocking

Three completed spec layers exist:
- `20260413-001-outbound-draft-worker-spec.md` — outbound command state machine
- `20260413-007-foreman-and-charters-architecture.md` — foreman routing and charter contracts
- `20260413-009-agent-trace-persistence.md` — agent reasoning/observation traces

But the seams are loose:
1. `draft_reply` appears in foreman `AllowedAction` but has no outbound command type.
2. The foreman emits `ForemanOutboundDecision`, but nobody says who writes `OutboundCommand`.
3. Coordinator durable state (thread records, charter outputs, foreman decisions) has no schema.
4. `thread_id` (outbound/foreman key) and `conversation_id` (synced message key) may be the same thing — or may not.
5. `blocked_policy` override has no actor or mechanism.

Without this task, parallel implementation of foreman and outbound will conflict.

## Scope

- Coordinator SQLite schema
- Foreman → outbound write boundary
- `thread_id` identity resolution
- `draft_reply` semantics
- `blocked_policy` override path

## Decision: Single Coordinator SQLite Database

All coordinator durable state lives in **one SQLite database file**, co-located with the outbound store.

```
<data-dir>/coordinator/coordinator.db
```

This database contains:
- `thread_records`
- `charter_outputs`
- `foreman_decisions`
- `agent_traces` (from task 009)
- `outbound_commands` (from task 001) — same schema, shared connection

Rationale:
- The foreman and outbound worker are separate logical processes, but they share the same durability boundary.
- A single connection per mailbox eliminates distributed-transaction complexity.
- Foreign keys between `foreman_decisions` and `outbound_commands` are safe and fast.

## Resolution 1: `thread_id === conversation_id`

**Rule:** `thread_id` used in `outbound_commands`, foreman `ThreadRecord`, and `agent_traces` is exactly the `conversation_id` field from `NormalizedMessage`.

**Derivation:**
```typescript
function deriveThreadId(normalizedMessage: NormalizedMessage): string {
  return normalizedMessage.conversation_id;
}
```

**Why:**
- Graph provides `conversationId` on every message.
- It is stable enough for thread grouping.
- It is already present in the compiled filesystem state (`record.json` and `views/by-thread/`).
- Introducing a separate deterministic hash adds complexity with no benefit.

**Consequence:** `FileViewStore` already indexes by `conversation_id` under `views/by-thread/`. The foreman can hydrate thread context by reading that directory directly.

## Resolution 2: `draft_reply` Becomes An Outbound Action

Add `draft_reply` to `OutboundActionType`:

```typescript
type OutboundActionType =
  | "draft_reply"
  | "send_reply"
  | "send_new_message"
  | "mark_read"
  | "move_message"
  | "set_categories";
```

### Semantics

A `draft_reply` command creates a Graph draft but **stops at `draft_ready`**.
It never transitions through `sending` or `submitted`.

### State machine extension

```text
draft_ready -> confirmed   (for draft_reply only)
```

For `draft_reply`:
- The outbound worker creates the managed draft.
- Once the draft exists and is verified, the worker transitions directly `draft_ready -> confirmed`.
- No reconciler involvement is required (there is no sent item to observe).
- The worker may optionally stamp `confirmed_at`.

### Eligibility rule adjustment

For `draft_reply`, eligibility to execute means:
- It is the latest version for its `outbound_id`
- It is not terminal, cancelled, or superseded
- It is not externally modified
- It passes policy checks

There is no `(thread_id, action_type)` uniqueness collision between `draft_reply` and `send_reply` because they have different `action_type` values.

### Conversion path

A `draft_reply` can be **superseded** by a later `send_reply` version. A human reviewing the draft may trigger a new outbound command with `action_type: "send_reply"` and the same `thread_id`.

## Resolution 3: Foreman → Outbound Handoff

The foreman does not emit an abstract decision and hope someone else writes it. The foreman **writes the outbound command directly** into the shared SQLite store.

### Sequence

```typescript
// 1. Foreman creates a decision record
const decision: ForemanOutboundDecision = {
  decision_id: generateUuid(),
  mailbox_id: thread.mailbox_id,
  thread_id: thread.thread_id,
  source_charter_ids: ["support_steward"],
  approved_action: "send_reply",
  payload_json: JSON.stringify({ to: [...], subject: "...", body_text: "..." }),
  rationale: "Customer reported a bug; sending acknowledgment.",
  decided_at: new Date().toISOString(),
};

coordinatorStore.insertForemanDecision(decision);

// 2. Foreman creates the outbound command
const outboundId = generateOutboundId();
const command: OutboundCommand = {
  outbound_id: outboundId,
  thread_id: thread.thread_id,
  mailbox_id: thread.mailbox_id,
  action_type: decision.approved_action,
  status: "pending",
  latest_version: 1,
  created_at: decision.decided_at,
  created_by: `foreman:${foremanId}/charter:${decision.source_charter_ids.join(",")}`,
  submitted_at: null,
  confirmed_at: null,
  blocked_reason: null,
  terminal_reason: null,
};

const version: OutboundVersion = {
  outbound_id: outboundId,
  version: 1,
  reply_to_message_id: thread.latest_message_id,
  to: [...],
  cc: [],
  bcc: [],
  subject: "...",
  body_text: "...",
  body_html: "",
  idempotency_key: `${outboundId}-v1`,
  policy_snapshot_json: JSON.stringify({ participants: [...] }),
  payload_json: decision.payload_json,
  created_at: decision.decided_at,
  superseded_at: null,
};

// 3. Written in a single transaction
outboundStore.createCommand(command, version);
```

### `created_by` rule

`created_by` is always a string of the form:
```
foreman:{foreman_id}/charter:{charter_id_1}[,{charter_id_2}...]
```

Examples:
- `foreman:fm-001/charter:support_steward`
- `foreman:fm-001/charter:support_steward,obligation_keeper`

## Resolution 4: Coordinator SQLite Schema

### `thread_records`

```sql
create table thread_records (
  thread_id text not null,
  mailbox_id text not null,
  primary_charter text not null,
  secondary_charters_json text not null default '[]',
  status text not null,
  assigned_agent text,
  last_message_at text not null,
  last_inbound_at text,
  last_outbound_at text,
  last_analyzed_at text,
  last_triaged_at text,
  created_at text not null,
  updated_at text not null,
  primary key (thread_id, mailbox_id)
);

create index idx_thread_records_mailbox
  on thread_records(mailbox_id, updated_at desc);

create index idx_thread_records_status
  on thread_records(status, mailbox_id);
```

### `charter_outputs`

```sql
create table charter_outputs (
  output_id text primary key,
  thread_id text not null,
  mailbox_id text not null,
  charter_id text not null,
  role text not null,              -- 'primary' | 'secondary'
  output_version text not null,
  analyzed_at text not null,
  summary text not null,
  classifications_json text not null default '[]',
  facts_json text not null default '[]',
  escalations_json text not null default '[]',
  proposed_actions_json text not null default '[]',
  tool_requests_json text not null default '[]',
  created_at text not null,
  foreign key (thread_id, mailbox_id) references thread_records(thread_id, mailbox_id)
    on delete cascade
);

create index idx_charter_outputs_thread
  on charter_outputs(thread_id, mailbox_id, analyzed_at desc);

create index idx_charter_outputs_charter
  on charter_outputs(charter_id, analyzed_at desc);
```

### `foreman_decisions`

```sql
create table foreman_decisions (
  decision_id text primary key,
  thread_id text not null,
  mailbox_id text not null,
  source_charter_ids_json text not null,
  approved_action text not null,
  payload_json text not null,
  rationale text not null,
  decided_at text not null,
  outbound_id text,                -- soft ref, set when handoff succeeds
  foreign key (thread_id, mailbox_id) references thread_records(thread_id, mailbox_id)
    on delete cascade
);

create index idx_foreman_decisions_thread
  on foreman_decisions(thread_id, mailbox_id, decided_at desc);

create index idx_foreman_decisions_outbound
  on foreman_decisions(outbound_id);
```

### `agent_traces` (from task 009, no FK to outbound)

```sql
create table agent_traces (
  trace_id text primary key,
  thread_id text not null,
  mailbox_id text not null,
  agent_id text not null,
  session_id text,
  trace_type text not null,
  parent_trace_id text references agent_traces(trace_id),
  reference_outbound_id text,      -- soft reference, no FK constraint
  reference_message_id text,
  payload_json text not null,
  created_at text not null
);

create index idx_agent_traces_thread
  on agent_traces(thread_id, created_at desc);

create index idx_agent_traces_session
  on agent_traces(session_id, created_at asc);

create index idx_agent_traces_agent
  on agent_traces(agent_id, created_at desc);

create index idx_agent_traces_reference_outbound
  on agent_traces(reference_outbound_id);
```

## Resolution 5: `blocked_policy` Override Path

**Rule:** A command in `blocked_policy` can only be resumed via an explicit override record.

### Override mechanism

```sql
create table policy_overrides (
  override_id text primary key,
  outbound_id text not null,
  overridden_by text not null,     -- user id or supervisor agent id
  reason text not null,
  created_at text not null,
  foreign key (outbound_id) references outbound_commands(outbound_id)
);
```

### Override semantics

1. A human or supervisor writes a `policy_overrides` row for the blocked `outbound_id`.
2. The foreman (or a dedicated override scanner) detects the override.
3. The foreman creates a **new version** of the command, advancing `latest_version`.
4. The new version transitions `blocked_policy -> pending -> ...` with `blocked_reason` cleared.
5. The old version remains in `blocked_policy` as audit history.

**Rationale:** This preserves immutability of prior state while allowing controlled release. It also mirrors the existing version-supersede semantics.

## Unified Coordinator Config Type

For implementers, the coordinator config that sits alongside `exchange-fs-sync` config is:

```typescript
interface CoordinatorConfig {
  foreman_id: string;
  mailbox_bindings: Record<string, MailboxBinding>;
  global_escalation_precedence: string[];
  tool_definitions: Record<string, ToolDefinition>;
}

interface MailboxBinding {
  mailbox_id: string;
  available_charters: CharterId[];
  default_primary_charter: CharterId;
  invocation_policies: CharterInvocationPolicy[];
  knowledge_sources: Record<string, KnowledgeSourceRef[]>;
  charter_tools: Record<string, ToolBinding[]>;
}
```

This merges the partial shapes from tasks 007, 008, and 011 into one canonical type.

## Consequences For Existing Tasks

| Task | Consequence |
|------|-------------|
| `001-outbound-draft-worker-spec.md` | Add `draft_reply` to `OutboundActionType`; add `draft_ready -> confirmed` transition |
| `007-foreman-and-charters-architecture.md` | `ForemanOutboundDecision` is written by foreman; `created_by` format is specified; coordinator state schema replaces illustrative types |
| `009-agent-trace-persistence.md` | `reference_outbound_id` is a soft reference (no FK); schema is now physically co-located with coordinator DB |
| `011-charter-tool-bindings.md` | `MailboxBinding` shape becomes the canonical home for tool bindings |

## Implementation Guidance

### Store interfaces

```typescript
interface CoordinatorStore {
  initSchema(): void;
  // Threads
  upsertThread(record: ThreadRecord): void;
  getThread(threadId: string, mailboxId: string): ThreadRecord | undefined;
  // Charter outputs
  insertCharterOutput(output: CharterOutputRow): void;
  getOutputsByThread(threadId: string, mailboxId: string): CharterOutputRow[];
  // Decisions
  insertDecision(decision: ForemanDecisionRow): void;
  getDecisionsByThread(threadId: string, mailboxId: string): ForemanDecisionRow[];
  // Overrides
  insertOverride(override: PolicyOverrideRow): void;
  getOverridesByOutboundId(outboundId: string): PolicyOverrideRow[];
}
```

### Transaction boundary

The foreman should wrap the following in a single SQLite transaction:
1. `upsertThread`
2. `insertCharterOutput` (for each charter invoked)
3. `insertDecision`
4. `outboundStore.createCommand`
5. `traceStore.writeTrace` (if recording the decision)

This ensures that a foreman decision and its outbound command are atomically committed.

## Definition Of Done

- [x] `thread_id === conversation_id` is documented and implemented in thread derivation
- [x] `draft_reply` added to `OutboundActionType` with `draft_ready -> confirmed` path
- [x] Foreman outbound handoff sequence documented (decision record → outbound command)
- [x] `created_by` format specified and enforced
- [x] Coordinator SQLite schema created (`thread_records`, `charter_outputs`, `foreman_decisions`)
- [x] `agent_traces` schema updated to use soft reference for `reference_outbound_id`
- [x] `policy_overrides` table and override semantics documented
- [x] Unified `CoordinatorConfig` type defined
- [x] `CoordinatorStore` interface sketched or implemented
- [x] All three parent task specs updated with cross-references to this resolution
