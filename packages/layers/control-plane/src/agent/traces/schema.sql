-- Agent Trace Persistence Schema — Canonical Identity Version
--
-- Append-only local commentary for agent reasoning, decisions, and observations.
--
-- Semantics:
-- - Traces are NOT authoritative sync state, workflow state, command state, or recovery state.
-- - `execution_id` is the canonical anchor (primary attachment point).
-- - `context_id` is required for context-level navigation.
-- - `work_item_id`, `session_id`, `reference_outbound_id`, and `reference_message_id`
--   are navigational only (no FK constraints) so trace retention is decoupled from
--   control-plane object lifecycles.
-- - thread_id is intentionally absent to avoid ambiguity with outbound-derived thread keys.
-- - chat_id is intentionally absent; traces are anchored to execution context, not UI sessions.

-- ---------------------------------------------------------------------------
-- agent_traces
-- Append-only commentary on agent activity.
-- ---------------------------------------------------------------------------
create table if not exists agent_traces (
  trace_id text primary key,
  execution_id text not null,            -- canonical anchor (execution_attempt.execution_id)
  context_id text not null,              -- Context identifier (navigational)
  work_item_id text,                     -- optional local navigation
  session_id text,                       -- optional single-execution correlation
  trace_type text not null,              -- 'observation', 'decision', 'action',
                                         -- 'handoff', 'tool_call', 'runtime_output', 'debug'
  reference_outbound_id text,            -- logical reference only
  reference_message_id text,             -- logical reference only
  payload_json text not null,
  created_at text not null
);

create index if not exists idx_agent_traces_execution
  on agent_traces(execution_id, created_at asc);

create index if not exists idx_agent_traces_context
  on agent_traces(context_id, created_at desc);

create index if not exists idx_agent_traces_session
  on agent_traces(session_id, created_at asc);

create index if not exists idx_agent_traces_reference_outbound
  on agent_traces(reference_outbound_id, created_at asc);
