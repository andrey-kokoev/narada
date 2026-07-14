import { listCommandTools, listOutputTools, listPayloadTools } from '../../site-common-tools/compat/mcp-payload-file.legacy-site.mjs';

export const STARTUP_TOOL_INLINE_LIMIT = 100_000;
export const PERMISSIVE_OBJECT_OUTPUT_SCHEMA = { type: 'object', additionalProperties: true };
export const STARTUP_TOOL_NAMES = new Set(['agent_context_whoami', 'agent_context_hydrate_current', 'agent_context_startup_sequence']);

export const EXPECTED_TOOL_GROUPS = {
  core: ['agent_context_doctor', 'agent_context_whoami', 'agent_context_hydrate_current', 'agent_context_startup_sequence', 'startup_sequence', 'agent_context_restart', 'agent_context_pause'],
  isn: ['agent_context_isn_create', 'agent_context_isn_list', 'agent_context_isn_show', 'agent_context_isn_transition'],
  movement_trace: ['agent_context_is_movement_trace_record', 'agent_context_is_movement_trace_list', 'agent_context_is_movement_trace_show'],
};

export const EXPECTED_TOOL_NAMES = [...new Set(Object.values(EXPECTED_TOOL_GROUPS).flat())];

export function startupSequenceInputSchema() {
  return {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Maximum task workboard items per section. Default 8.' },
      last_workboard_check_at: { type: 'string', description: 'Optional ISO timestamp for task_lifecycle_next freshness.' },
      doctrine_detail: { type: 'string', description: 'Doctrine detail for hydration: status, summary, reground, or full. Default reground.' },
      trigger: { type: 'string', description: 'Grounding trigger: startup, post_compaction, manual_reground, or hydration. Default startup.' },
      operator_override_ref: { type: 'string', description: 'Optional operator instruction or artifact reference explaining an override/degraded acceptance.' },
      output: { type: 'string', description: 'Output mode: summary, full, readiness, or debug. Default summary.' },
      checkpoint_startup: { type: 'boolean', description: 'When true, write a startup checkpoint after non-blocked readiness.' },
    },
  };
}

export const TOOLS = [
  ...listCommandTools(),
  ...listPayloadTools(),
  ...listOutputTools(),
  {
    name: 'agent_context_doctor',
    description: 'Check agent-context DB readiness and schema presence. Returns conceptual_role metadata.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agent_context_pause',
    description: 'Pause the current MCP call for a bounded duration and return structured wait evidence. Low-authority session wait only; does not mutate task or machine state.',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Pause duration in seconds. Must be > 0 and <= 30.' },
        reason: { type: 'string', description: 'Short reason for the wait, e.g. idle_window or operator_ui_effect.' },
      },
      required: ['seconds', 'reason'],
    },
  },
  {
    name: 'agent_context_show_event',
    description: 'Show full agent start event and linked materializations by explicit event_id. Does not support latest-by-identity lookup.',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Exact event_id. Required.' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'agent_context_show_bootstrap',
    description: 'Return bootstrap packet (resume_command, prompt, summaries) for an explicit event_id or latest-by-identity.',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Exact event_id. Provide either event_id or identity.' },
        identity: { type: 'string', description: 'Agent identity, e.g. andrey-user.Kevin. Finds latest event for this identity.' },
      },
    },
  },
  {
    name: 'agent_context_checkpoint',
    description: 'Write a durable agent state checkpoint. Survives context compaction.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent identity, e.g. andrey-user.Kevin' },
        session_id: { type: 'string', description: 'Optional session identifier.' },
        active_task: { type: 'object', description: 'Active task state: { task_number, task_id, status, summary }' },
        files_touched: { type: 'array', description: 'Array of file paths touched since last checkpoint.' },
        key_decisions: { type: 'array', description: 'Array of key decision strings.' },
        open_questions: { type: 'array', description: 'Array of open question strings.' },
        git_head: { type: 'string', description: 'Git HEAD commit hash at checkpoint time.' },
        last_workboard_check_at: { type: 'string', description: 'ISO timestamp of the last workboard check. Used for state freshness tracking.' },
        next_intended_action: { type: 'object', description: 'Optional tactical next action: { action, task_number, task_id, reason, authority_required }.' },
        authority_basis: { type: 'object', description: 'Optional authority context for continuing or claiming work: { kind, summary }.' },
        continuation_blockers: { type: 'array', description: 'Optional blockers that must be cleared before continuation. Strings or objects are accepted.' },
        evidence_refs: { type: 'array', description: 'Optional references to evidence needed for tactical resume: { kind, ref, summary }.' },
        worktree_state: { type: 'object', description: 'Optional supplied worktree state: { status, git_head, dirty_files, ownership, checked_at }.' },
        tactical_resume_notes: { type: 'array', description: 'Optional exact notes needed after compaction.' },
        target_site_root: { type: 'string', description: 'Optional explicit target Site root. Must match this MCP server site root for checkpoint writes.' },
        cwd: { type: 'string', description: 'Optional caller working directory evidence. Absolute paths outside this Site are treated as cross-Site evidence.' },
        payload_path: { type: 'string', description: 'Optional JSON payload path under .ai/tmp/mcp-payloads. Transient transport only; loaded payload is validated like inline arguments.' },
        payload_ref: { type: 'string', description: 'Optional immutable transient payload ref such as mcp_payload:<id>@v1. Loaded payload is validated like inline arguments.' },
      },
    },
  },
  ...listPayloadTools(),
  ...listOutputTools(),
  {
    name: 'agent_context_rehydrate',
    description: 'Retrieve the most recent checkpoint for the calling agent identity, or query checkpoint history.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent identity, e.g. andrey-user.Kevin. Required.' },
        history: { type: 'boolean', description: 'If true, return prior checkpoints from history instead of the latest.' },
        limit: { type: 'integer', description: 'Maximum number of history entries to return (1-50). Default 1. Implies history mode when > 1.' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'agent_context_doctrinal_grounding',
    description: 'Read canonical doctrine files for agent regrounding. Returns full text, summary, list, or structured reground payload.',
    inputSchema: {
      type: 'object',
      properties: {
        doctrine_ids: { type: 'array', description: 'Optional array of doctrine IDs to filter. If omitted, all doctrines are returned.' },
        mode: { type: 'string', description: 'Output mode: list (names only), summary (first 2000 chars), full (complete text), reground (structured posture summary with catalog, coordinates, and protocol). Default: summary.' },
      },
    },
  },
  {
    name: 'agent_context_whoami',
    description: 'Resolve the current session identity without requiring the caller to already know it. Checks NARADA_AGENT_ID env var, then most recent checkpoint, then most recent agent start event. Returns identity, role, confidence, and source.',
    inputSchema: {
      type: 'object',
      properties: {
        hint: { type: 'string', description: 'Optional identity hint to validate against (e.g. andrey-user.Kevin).' },
      },
    },
  },
  {
    name: 'agent_context_start_session',
    description: 'Validate an agent against task lifecycle roster/read model or roster.json and materialize an agent session start in agent-context SQLite. Returns carrier environment and MCP startup sequence.',
    inputSchema: {
      type: 'object',
      properties: {
        identity: { type: 'string', description: 'Agent identity, e.g. andrey-user.Bob. Required.' },
        runtime: { type: 'string', description: 'Substrate carrier executable name. Default: kimi.' },
        cwd: { type: 'string', description: 'Workspace directory embodied by the session. Default: site root.' },
        dry_run: { type: 'boolean', description: 'Validate and return planned materialization without writing SQLite.' },
      },
      required: ['identity'],
    },
  },
  {
    name: 'agent_context_list_sessions',
    description: 'Query agent_start_events for operational visibility. Supports identity, date range, substrate/runtime filters, session count, latest session per identity, and duration estimates.',
    inputSchema: {
      type: 'object',
      properties: {
        identity: { type: 'string', description: 'Optional agent identity filter, e.g. andrey-user.Kevin.' },
        date_from: { type: 'string', description: 'Optional inclusive ISO timestamp lower bound for created_at.' },
        date_to: { type: 'string', description: 'Optional inclusive ISO timestamp upper bound for created_at.' },
        substrate: { type: 'string', description: 'Optional runtime/substrate filter, e.g. codex or kimi.' },
        limit: { type: 'integer', description: 'Maximum sessions to return, 1-500. Default 100.' },
      },
    },
  },
  {
    name: 'agent_context_complete_codex_admission',
    description: 'Complete a creating Codex session admission by materializing a real agent start event and binding explicit Codex carrier evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        admission_id: { type: 'string', description: 'Narada Codex admission id, e.g. codexadm_...' },
        identity: { type: 'string', description: 'Agent identity that owns the admission.' },
        codex_session_id: { type: 'string', description: 'Exact Codex session id carrier evidence.' },
        codex_session_file: { type: 'string', description: 'Optional Codex session file carrier evidence.' },
        cwd: { type: 'string', description: 'Workspace directory embodied by the session. Default: site root.' },
        evidence: { type: 'object', description: 'Optional additional evidence to merge into the admission evidence JSON.' },
        operator_override_ref: { type: 'string', description: 'Explicit operator override reference for missing/mismatched carrier env values.' },
      },
      required: ['admission_id', 'identity', 'codex_session_id'],
    },
  },
  {
    name: 'agent_context_discover_codex_session_evidence',
    description: 'Inspect Codex session JSONL files for a session whose transcript contains a Narada Codex admission id marker.',
    inputSchema: {
      type: 'object',
      properties: {
        admission_id: { type: 'string', description: 'Narada Codex admission id, e.g. codexadm_...' },
        identity: { type: 'string', description: 'Optional expected Narada agent identity marker.' },
        codex_home: { type: 'string', description: 'Optional Codex home directory. Default: CODEX_HOME or ~/.codex.' },
        limit: { type: 'integer', description: 'Maximum recent session files to inspect. Default 200.' },
      },
      required: ['admission_id'],
    },
  },
  {
    name: 'agent_context_extract_codex_session_evidence_packet',
    description: 'Extract matching transcript entries from one admissible Codex session into a durable Site evidence packet. Requires admission-marker session discovery and explicit search_text.',
    inputSchema: {
      type: 'object',
      properties: {
        admission_id: { type: 'string', description: 'Narada Codex admission id marker that must be present in the transcript.' },
        identity: { type: 'string', description: 'Optional expected Narada agent identity marker.' },
        codex_home: { type: 'string', description: 'Optional Codex home directory. Default: CODEX_HOME or ~/.codex.' },
        search_text: { type: 'string', description: 'Literal marker that must appear in extracted transcript message text.' },
        output_path: { type: 'string', description: 'Site-root-relative JSON evidence packet path. Default: kb/operations/codex-session-evidence-packet.json.' },
        limit: { type: 'integer', description: 'Maximum recent session files to inspect. Default 200.' },
      },
      required: ['admission_id', 'search_text'],
    },
  },
  {
    name: 'agent_context_verify_codex_exact_resume',
    description: 'Verify or precisely report missing capability for exact `codex resume <codex_session_id>` proof.',
    inputSchema: {
      type: 'object',
      properties: {
        codex_session_id: { type: 'string', description: 'UUID-shaped Codex session id.' },
        codex_session_file: { type: 'string', description: 'Optional Codex session JSONL file path.' },
        admission_id: { type: 'string', description: 'Optional Narada Codex admission id.' },
      },
      required: ['codex_session_id'],
    },
  },
  {
    name: 'agent_context_hydrate_current',
    description: 'Single-command startup hydration for the current mechanically bound session. Requires NARADA_AGENT_ID, then returns whoami, checkpoint, bootstrap, capability policy, posture, and task_lifecycle_next.',
    inputSchema: startupSequenceInputSchema(),
    outputSchema: PERMISSIVE_OBJECT_OUTPUT_SCHEMA,
  },
  {
    name: 'agent_context_startup_sequence',
    description: 'Canonical operator-facing startup hydration command. Delegates to the current agent_context_hydrate_current startup behavior.',
    inputSchema: startupSequenceInputSchema(),
    outputSchema: PERMISSIVE_OBJECT_OUTPUT_SCHEMA,
  },

  {
    name: 'agent_context_lifecycle_history',
    description: 'Read recent append-only lifecycle transition ledger rows for an agent. Read-only projection over agent-context SQLite.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Optional agent identity filter, e.g. andrey-user.Kevin.' },
        transition: { type: 'string', description: 'Optional transition filter, e.g. hydrate.' },
        limit: { type: 'integer', description: 'Maximum rows to return (1-50). Default 10.' },
      },
    },
  },
  {
    name: 'agent_context_lifecycle_show',
    description: 'Read one append-only lifecycle transition ledger row by transition_id.',
    inputSchema: {
      type: 'object',
      properties: {
        transition_id: { type: 'string', description: 'Lifecycle transition id. Required.' },
      },
      required: ['transition_id'],
    },
  },
  {
    name: 'agent_context_isn_create',
    description: 'Create a Site-owned Inquiry Space Node (ISN). Does not create or claim task lifecycle work.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent identity creating the ISN. Must match bound session identity when present.' },
        title: { type: 'string', description: 'Compact human name for the ISN.' },
        plane: { type: 'string', description: 'Lifecycle plane. Default: discovery.' },
        summary: { type: 'string', description: 'Pressure/question carried by this ISN.' },
        authority_owner: { type: 'object', description: 'Authority surface/person/tool that owns durable decisions for this node.' },
        relations: { type: 'array', description: 'Relations such as parent, child, sibling, duplicate, residual, blocker, upstream, downstream, coverage-of.' },
        evidence_refs: { type: 'array', description: 'Evidence references justifying current ISN state.' },
        next_movement: { type: 'object', description: 'Proposed or authorized next plane movement.' },
        linked_task_number: { type: 'integer', description: 'Optional task lifecycle task number this ISN is linked to. Link only; no task mutation.' },
      },
      required: ['agent_id', 'title', 'summary'],
    },
  },
  {
    name: 'agent_context_isn_list',
    description: 'List Inquiry Space Nodes (ISNs) from Site-owned agent-context SQLite.',
    inputSchema: {
      type: 'object',
      properties: {
        plane: { type: 'string', description: 'Optional lifecycle plane filter.' },
        status: { type: 'string', description: 'Optional status filter. Default excludes archived only when provided.' },
        linked_task_number: { type: 'integer', description: 'Optional linked task number filter.' },
        limit: { type: 'integer', description: 'Maximum rows to return (1-50). Default 20.' },
      },
    },
  },
  {
    name: 'agent_context_isn_show',
    description: 'Show one Inquiry Space Node (ISN) by node_id, including recent transition events.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'ISN node id. Required.' },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'agent_context_isn_transition',
    description: 'Move an ISN to another lifecycle plane or update its explicit fields. Does not mutate linked tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent identity performing the transition. Must match bound session identity when present.' },
        node_id: { type: 'string', description: 'ISN node id. Required.' },
        plane: { type: 'string', description: 'New lifecycle plane. Required.' },
        reason: { type: 'string', description: 'Reason or authority basis for the movement.' },
        summary: { type: 'string', description: 'Optional replacement summary.' },
        authority_owner: { type: 'object', description: 'Optional replacement authority owner.' },
        relations: { type: 'array', description: 'Optional replacement relations.' },
        evidence_refs: { type: 'array', description: 'Optional replacement evidence refs.' },
        next_movement: { type: 'object', description: 'Optional replacement next movement.' },
        linked_task_number: { type: 'integer', description: 'Optional replacement linked task number.' },
      },
      required: ['agent_id', 'node_id', 'plane', 'reason'],
    },
  },
  {
    name: 'agent_context_is_movement_trace_record',
    description: 'Record an observational Inquiry Space movement trace. Does not claim, route, reconcile, or transition tasks/ISNs.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent identity recording the trace. Must match bound session identity when present.' },
        sequence_id: { type: 'string', description: 'Optional existing movement sequence id.' },
        sequence: { type: 'object', description: 'Optional sequence envelope to create when sequence_id is absent. For repeated or unbounded movement, include title and summary, then continue later steps with the returned sequence_id.' },
        step_index: { type: 'integer', description: 'Step index within the movement or sequence. Default 1.' },
        navigation_plane: { type: 'string', description: 'Navigation plane: depth_first, breadth_first, back_up_the_chain, or another observed plane label.' },
        node_type: { type: 'string', description: 'Observed node type, e.g. IS, ISN, ITS, task, inbox, chapter, residual.' },
        isn_node_id: { type: 'string', description: 'Optional linked ISN node id. Link only; no ISN transition.' },
        linked_task_number: { type: 'integer', description: 'Optional linked task number. Link only; no task mutation.' },
        before_state: { type: 'object', description: 'Observed before-state snapshot.' },
        after_state: { type: 'object', description: 'Observed after-state snapshot.' },
        observed_drift: { type: 'object', description: 'Concurrent occupancy, workboard freshness, task-state drift, or other drift observed.' },
        action_taken: { type: 'object', description: 'Observed action taken in this movement step.' },
        evidence_refs: { type: 'array', description: 'Evidence references for the trace.' },
        next_pressure: { type: 'object', description: 'Residual pressure or next movement candidate.' },
        discipline_profile: { type: 'object', description: 'Declared movement discipline and observed tensions. Recorded only, not enforced.' },
      },
      required: ['agent_id', 'navigation_plane', 'node_type'],
    },
  },
  {
    name: 'agent_context_is_movement_trace_list',
    description: 'List observational Inquiry Space movement traces. Read-only projection over agent-context SQLite.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Optional agent identity filter.' },
        sequence_id: { type: 'string', description: 'Optional movement sequence id filter.' },
        linked_task_number: { type: 'integer', description: 'Optional linked task number filter.' },
        isn_node_id: { type: 'string', description: 'Optional linked ISN node id filter.' },
        limit: { type: 'integer', description: 'Maximum rows to return (1-50). Default 20.' },
      },
    },
  },
  {
    name: 'agent_context_is_movement_trace_show',
    description: 'Show one Inquiry Space movement trace by movement_id, including its sequence envelope when present.',
    inputSchema: {
      type: 'object',
      properties: {
        movement_id: { type: 'string', description: 'Movement trace id. Required.' },
      },
      required: ['movement_id'],
    },
  },
  {
    name: 'agent_context_tool_surface_readiness',
    description: 'Read agent-context MCP tool-surface readiness: registered tools, expected source groups, restart request state, and sanctioned stale-surface remediation. Read-only.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agent_context_restart',
    description: 'Request, inspect, or acknowledge an external restart of the agent-context stdio MCP server. Does not self-restart the current process.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', description: 'request, status, acknowledge, or clear. Default request.' },
        reason: { type: 'string', description: 'Optional reason for the restart request or acknowledgement.' },
      },
    },
  },
  {
    name: 'agent_context_grounding_latest',
    description: 'Return the latest immutable doctrinal grounding event for an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent identity, e.g. andrey-user.Kevin. Required.' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'agent_context_grounding_history',
    description: 'Return recent immutable doctrinal grounding events for an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent identity, e.g. andrey-user.Kevin. Required.' },
        limit: { type: 'integer', description: 'Maximum grounding events to return (1-50). Default 10.' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'agent_context_grounding_show',
    description: 'Return a doctrinal grounding event by event_id.',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Grounding event id. Required.' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'agent_context_site_evolution_orientation_create',
    description: 'Explicitly append a Site Evolution Orientation snapshot. Does not run during normal hydration.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for creating the snapshot. Default explicit_create.' },
      },
    },
  },
  {
    name: 'agent_context_site_evolution_orientation_latest',
    description: 'Read the latest Site Evolution Orientation snapshot metadata and card. Read-only, not action authority.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agent_context_site_evolution_orientation_history',
    description: 'Read recent Site Evolution Orientation snapshots. Read-only, not action authority.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Maximum snapshots to return (1-50). Default 10.' },
      },
    },
  },
  {
    name: 'agent_context_site_evolution_orientation_show',
    description: 'Read a full Site Evolution Orientation snapshot by snapshot_id. Read-only, not action authority.',
    inputSchema: {
      type: 'object',
      properties: {
        snapshot_id: { type: 'string', description: 'Orientation snapshot id. Required.' },
      },
      required: ['snapshot_id'],
    },
  },
  {
    name: 'agent_context_concept_lifecycle_record',
    description: 'Append one concept/protocol lifecycle event. Events are SQLite-backed authority; projections are derived read models.',
    inputSchema: {
      type: 'object',
      properties: {
        object_id: { type: 'string', description: 'Stable object id/slug for the managed concept or protocol.' },
        object_type: { type: 'string', description: 'concept, protocol, process_contract, or doctrine.' },
        event_type: { type: 'string', description: 'observed, named, doctrine_checked, codified, trialed, promoted, canonicalized, deprecated, rejected, superseded, or corrected.' },
        state_after: { type: 'string', description: 'Projected state after this event.' },
        actor_agent_id: { type: 'string', description: 'Agent recording the event. Must match bound identity when present.' },
        authority_basis: { type: 'object', description: 'Authority basis: { kind, summary }.' },
        scope: { type: 'object', description: 'Lifecycle scope: { site, locus, applies_to }.' },
        artifact_refs: { type: 'array', description: 'Durable artifact refs supporting the lifecycle event.' },
        evidence_refs: { type: 'array', description: 'Evidence refs supporting the lifecycle event.' },
        notes: { type: 'string', description: 'Optional concise rationale.' },
      },
      required: ['object_id', 'object_type', 'event_type', 'state_after', 'actor_agent_id', 'authority_basis', 'scope', 'artifact_refs', 'evidence_refs'],
    },
  },
  {
    name: 'agent_context_concept_lifecycle_history',
    description: 'Read append-only concept/protocol lifecycle event history for one object. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        object_id: { type: 'string', description: 'Stable object id/slug.' },
        limit: { type: 'integer', description: 'Maximum events to return (1-100). Default 50.' },
      },
      required: ['object_id'],
    },
  },
  {
    name: 'agent_context_concept_lifecycle_current',
    description: 'Read current projected concept/protocol lifecycle state. Projection is not authority.',
    inputSchema: {
      type: 'object',
      properties: {
        object_id: { type: 'string', description: 'Optional object id/slug. Omit to list current states.' },
        object_type: { type: 'string', description: 'Optional object type filter when listing.' },
        state_after: { type: 'string', description: 'Optional state filter when listing.' },
        limit: { type: 'integer', description: 'Maximum projected states to return (1-100). Default 50.' },
      },
    },
  },
  {
    name: 'agent_context_rehydration_onboarding_card',
    description: 'Read the current compact rehydration onboarding card projection. Read-only, not action authority unless issued through verified hydrate_current.',
    inputSchema: { type: 'object', properties: {} },
  },
];
