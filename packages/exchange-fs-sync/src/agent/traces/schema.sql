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
