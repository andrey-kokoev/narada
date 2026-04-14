# Agent Task: Identity Closure — Conversation / Chat / Session Model

## Status: CLOSED

---

## 1. Identity Model

### `conversation_id`
- **Role:** Canonical mailbox reality. The Exchange `conversationId` from normalized message data.
- **Lifecycle:** Survives sync cycles, process restarts, agent changes, and UI reopens.
- **Relationships:**
  - One `conversation_id` has many `agent_traces`.
  - One `conversation_id` has many `chat_id`s.
- **Stability:** Stable across weeks or months.

### `thread_id` (outbound system only)
- **Role:** Derived local projection used by the outbound worker for command grouping.
- **Lifecycle:** Bound to `outbound_commands` schema.
- **Closure rule:** In this system, `thread_id` is defined to equal `conversation_id`. It is intentionally **not stored** in `agent_traces` to prevent ambiguous joins.
- **Relationships:** Outbound commands reference it; traces do not.

### `chat_id`
- **Role:** Local AI interaction container (CLI chat, UI panel, etc.).
- **Lifecycle:** Created when an agent begins interactive work on a conversation. Closed when that interaction ends.
- **Relationships:**
  - Belongs to exactly one `conversation_id`.
  - One `conversation_id` may have many `chat_id`s over time.
- **Constraint:** A single `chat_id` must never span multiple `conversation_id`s.

### `session_id`
- **Role:** **Correlation token** for a single execution span of an agent within a chat.
- **Lifecycle:** Created at the start of one agent run/invocation. Dies with the process.
- **Relationships:**
  - Belongs to exactly one `chat_id`.
  - One `chat_id` may have many `session_id`s.
- **Classification:** Correlation token only. **Not** a lifecycle object. **Not** a recovery anchor.

---

## 2. Relationship Diagram (Text)

```
conversation_id (1) ────< chat_id (N)
chat_id (1) ────< session_id (N)
conversation_id (1) ────< agent_traces (N)
chat_id (1) ────< agent_traces (N, optional)
session_id (1) ────< agent_traces (N, optional)
```

---

## 3. Schema (Final)

```sql
-- Agent Trace Persistence Schema — Identity-Closed Version
--
-- Append-only local commentary for agent reasoning, decisions, and observations.
--
-- Semantics:
-- - Traces are NOT authoritative sync state, workflow state, command state, or recovery state.
-- - conversation_id is the Exchange conversationId (canonical mailbox reality).
-- - thread_id is intentionally absent to avoid ambiguity with outbound-derived thread keys.
-- - reference_outbound_id and parent_trace_id are logical references only (no FK constraints)
--   so that trace retention is not coupled to command or parent trace retention.
-- - chat_id scopes traces to a local UI/CLI interaction container.
-- - session_id is a single-execution correlation token, not a recovery anchor.

-- ---------------------------------------------------------------------------
-- agent_traces
-- Append-only commentary on agent activity.
-- ---------------------------------------------------------------------------
create table if not exists agent_traces (
  trace_id text primary key,
  conversation_id text not null,       -- canonical mailbox thread identity
  mailbox_id text not null,
  agent_id text not null,
  chat_id text,                        -- local CLI/UI interaction container
  session_id text,                     -- single execution span correlation token
  trace_type text not null,             -- 'reasoning', 'decision', 'action',
                                        -- 'observation', 'handoff', 'override'
  parent_trace_id text,                 -- logical reference only
  reference_outbound_id text,           -- logical reference only
  reference_message_id text,
  payload_json text not null,
  created_at text not null
);

create index if not exists idx_agent_traces_conversation
  on agent_traces(conversation_id, created_at desc);

create index if not exists idx_agent_traces_chat
  on agent_traces(chat_id, created_at desc);

create index if not exists idx_agent_traces_session
  on agent_traces(session_id, created_at asc);

create index if not exists idx_agent_traces_agent
  on agent_traces(agent_id, created_at desc);

create index if not exists idx_agent_traces_reference_outbound
  on agent_traces(reference_outbound_id, created_at asc);
```

---

## 4. Store Interface (Final)

```typescript
export type TraceType =
  | "reasoning"
  | "decision"
  | "action"
  | "observation"
  | "handoff"
  | "override";

export interface AgentTrace {
  rowid: number;
  trace_id: string;
  conversation_id: string;
  mailbox_id: string;
  agent_id: string;
  chat_id: string | null;
  session_id: string | null;
  trace_type: TraceType;
  parent_trace_id: string | null;
  reference_outbound_id: string | null;
  reference_message_id: string | null;
  payload_json: string;
  created_at: string;
}

export interface AgentTraceStore {
  initSchema(): void;

  writeTrace(
    trace: Omit<AgentTrace, "rowid" | "trace_id" | "created_at">,
  ): AgentTrace;

  readByConversation(
    conversationId: string,
    opts?: {
      after?: string;
      before?: string;
      limit?: number;
      types?: TraceType[];
    },
  ): AgentTrace[];

  readByChatId(chatId: string): AgentTrace[];

  readBySession(sessionId: string): AgentTrace[];

  readByOutboundId(outboundId: string): AgentTrace[];

  readUnlinkedDecisions(opts?: {
    types?: TraceType[];
    limit?: number;
  }): AgentTrace[];

  getTrace(traceId: string): AgentTrace | undefined;

  close(): void;
}
```

---

## 5. Invariants

1. Every trace belongs to exactly one `conversation_id`.
2. `conversation_id` is the Exchange `conversationId`, not a locally derived projection.
3. `thread_id` does not appear in the `agent_traces` table.
4. `chat_id`, if present, belongs to exactly one `conversation_id` (enforced at coordinator/UI layer).
5. `session_id` is a correlation token for a single execution span; it is never a lifecycle object or recovery anchor.
6. A trace may reference zero or one outbound commands via `reference_outbound_id`.
7. No trace is required for mailbox reconstruction, sync correctness, or outbound command recovery.
8. `chat_id` must never be used as system-of-record identity for a thread.
9. One `chat_id` must never span multiple `conversation_id`s.
10. `parent_trace_id` and `reference_outbound_id` are logical references only (no FK constraints).

---

## 6. Migration Strategy

`agent_traces` is a new table with no production data. Migration is destructive and in-place:

1. `drop table if exists agent_traces;`
2. Re-run `initSchema()` to create the corrected schema.
3. Re-run unit tests to confirm interface alignment.

No data preservation is required.

---

## 7. Boundary Statement

> Agent traces belong to `conversation_id` and never to `chat_id`.
