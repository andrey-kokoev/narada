import { ORIENTATION_DDL } from './site-evolution-orientation.mjs';

export const CHECKPOINT_DDL = `
CREATE TABLE IF NOT EXISTS agent_events (
  event_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  task_number INTEGER,
  payload_json TEXT,
  emitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent_id, emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_task ON agent_events(task_number, emitted_at DESC);

CREATE TABLE IF NOT EXISTS agent_lifecycle_transitions (
  transition_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  transition TEXT NOT NULL,
  source_zone TEXT,
  target_zone TEXT,
  status TEXT NOT NULL,
  authority_basis_json TEXT,
  guard_results_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  recommended_action_json TEXT,
  authorized_action_json TEXT,
  action_safety_json TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_transitions_agent ON agent_lifecycle_transitions(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_transitions_transition ON agent_lifecycle_transitions(transition, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_checkpoints (
  checkpoint_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  checkpoint_at TEXT NOT NULL,
  active_task_json TEXT,
  files_touched_json TEXT,
  key_decisions_json TEXT,
  open_questions_json TEXT,
  git_head TEXT,
  payload_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_agent ON agent_checkpoints(agent_id, checkpoint_at DESC);

CREATE TABLE IF NOT EXISTS agent_checkpoint_history (
  history_id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  checkpoint_at TEXT NOT NULL,
  active_task_json TEXT,
  files_touched_json TEXT,
  key_decisions_json TEXT,
  open_questions_json TEXT,
  git_head TEXT,
  payload_json TEXT,
  archived_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkpoint_history_agent ON agent_checkpoint_history(agent_id, archived_at DESC);

CREATE TABLE IF NOT EXISTS agent_grounding_events (
  event_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  trigger TEXT NOT NULL,
  created_at TEXT NOT NULL,
  doctrine_detail TEXT NOT NULL,
  grounding_status TEXT NOT NULL,
  grounding_layers_json TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  source_hashes_json TEXT NOT NULL,
  grounding_summary_json TEXT NOT NULL,
  degraded_reason TEXT,
  operator_override_ref TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grounding_events_agent ON agent_grounding_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grounding_events_session ON agent_grounding_events(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inquiry_space_nodes (
  node_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  plane TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  authority_owner_json TEXT NOT NULL,
  relations_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  next_movement_json TEXT,
  linked_task_number INTEGER,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_isn_nodes_plane ON inquiry_space_nodes(plane, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_isn_nodes_status ON inquiry_space_nodes(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_isn_nodes_task ON inquiry_space_nodes(linked_task_number);

CREATE TABLE IF NOT EXISTS inquiry_space_node_events (
  event_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_plane TEXT,
  to_plane TEXT,
  actor_agent_id TEXT NOT NULL,
  reason TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_isn_events_node ON inquiry_space_node_events(node_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inquiry_space_movement_sequences (
  sequence_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  starting_node_ref TEXT,
  requested_step_count INTEGER,
  completed_step_count INTEGER NOT NULL DEFAULT 0,
  termination_reason TEXT,
  drift_summary_json TEXT NOT NULL,
  linked_artifacts_json TEXT NOT NULL,
  discipline_profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_is_movement_sequences_agent ON inquiry_space_movement_sequences(agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS inquiry_space_movement_traces (
  movement_id TEXT PRIMARY KEY,
  sequence_id TEXT,
  step_index INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  navigation_plane TEXT NOT NULL,
  node_type TEXT NOT NULL,
  isn_node_id TEXT,
  linked_task_number INTEGER,
  before_state_json TEXT NOT NULL,
  after_state_json TEXT NOT NULL,
  observed_drift_json TEXT NOT NULL,
  action_taken_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  next_pressure_json TEXT NOT NULL,
  discipline_profile_json TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_is_movement_traces_agent ON inquiry_space_movement_traces(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_is_movement_traces_sequence ON inquiry_space_movement_traces(sequence_id, step_index);
CREATE INDEX IF NOT EXISTS idx_is_movement_traces_task ON inquiry_space_movement_traces(linked_task_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_is_movement_traces_isn ON inquiry_space_movement_traces(isn_node_id, created_at DESC);

CREATE TABLE IF NOT EXISTS concept_protocol_lifecycle_events (
  event_id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  state_after TEXT NOT NULL,
  actor_agent_id TEXT NOT NULL,
  authority_basis_json TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  artifact_refs_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_concept_lifecycle_events_object ON concept_protocol_lifecycle_events(object_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concept_lifecycle_events_actor ON concept_protocol_lifecycle_events(actor_agent_id, created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_concept_lifecycle_events_no_update
BEFORE UPDATE ON concept_protocol_lifecycle_events
BEGIN
  SELECT RAISE(ABORT, 'concept_protocol_lifecycle_events_append_only_no_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_concept_lifecycle_events_no_delete
BEFORE DELETE ON concept_protocol_lifecycle_events
BEGIN
  SELECT RAISE(ABORT, 'concept_protocol_lifecycle_events_append_only_no_delete');
END;

CREATE TABLE IF NOT EXISTS concept_protocol_lifecycle_current_state (
  object_id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,
  state_after TEXT NOT NULL,
  last_event_id TEXT NOT NULL,
  last_event_type TEXT NOT NULL,
  last_event_at TEXT NOT NULL,
  actor_agent_id TEXT NOT NULL,
  authority_basis_json TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  artifact_refs_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  notes TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_concept_lifecycle_current_type ON concept_protocol_lifecycle_current_state(object_type, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_concept_lifecycle_current_state ON concept_protocol_lifecycle_current_state(state_after, last_event_at DESC);

${ORIENTATION_DDL}
`;
