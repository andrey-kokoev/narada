-- Agent Trace Persistence Schema
--
-- Append-only local commentary for agent reasoning, decisions, and observations.
-- Lives in the same SQLite database as outbound state but is loaded independently.
--
-- Semantics:
-- - Traces are NOT authoritative sync state, workflow state, command state, or recovery state.
-- - thread_id in this table is the Exchange conversation_id used by the filesystem view layer.
-- - reference_outbound_id and parent_trace_id are logical references only (no FK constraints)
--   so that trace retention is not coupled to command or parent trace retention.

-- ---------------------------------------------------------------------------
-- agent_traces
-- Append-only commentary on agent activity.
-- ---------------------------------------------------------------------------
create table if not exists agent_traces (
  trace_id text primary key,
  thread_id text not null,              -- Exchange conversation_id, aligned with outbound_commands
  mailbox_id text not null,
  agent_id text not null,
  session_id text,
  trace_type text not null,             -- 'reasoning', 'decision', 'action',
                                        -- 'observation', 'handoff', 'override'
  parent_trace_id text,                 -- logical reference only
  reference_outbound_id text,           -- logical reference only; no FK to outbound_commands
  reference_message_id text,
  payload_json text not null,
  created_at text not null
);

-- Stable ordering indexes: (created_at, rowid) provides deterministic tie-breaking
create index if not exists idx_agent_traces_thread
  on agent_traces(thread_id, created_at desc);

create index if not exists idx_agent_traces_session
  on agent_traces(session_id, created_at asc);

create index if not exists idx_agent_traces_agent
  on agent_traces(agent_id, created_at desc);

create index if not exists idx_agent_traces_reference_outbound
  on agent_traces(reference_outbound_id, created_at asc);
