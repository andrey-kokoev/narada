import { registrationReadiness } from './adapter-registration.mjs';
import { buildMissingRuntimeHandle, validateRuntimeHandle } from './runtime-handle.mjs';

const HEARTBEAT_EVIDENCE_SCHEMA = 'narada.narada_native_carrier.heartbeat_evidence.v0';

const NO_HEARTBEAT_MUTATION_FLAGS = Object.freeze({
  task_lifecycle_mutation: false,
  inbox_mutation: false,
  outbox_mutation: false,
  command_execution: false,
  publication_mutation: false,
  provider_transport_invoked: false,
  credential_value_access: false,
  automatic_repair_attempted: false,
});

function buildHeartbeatEvidence({
  carrierSessionId,
  agentId,
  runtimeHandle = buildMissingRuntimeHandle(),
  latestWorkPacketSummary = null,
  latestHandoffRef = null,
  toDataReachability = null,
  registration = null,
  now = new Date().toISOString(),
} = {}) {
  const runtimePosture = runtimeHeartbeatPosture(runtimeHandle, now);
  const provider = registrationReadiness(
    registration,
    registration?.capability_ref ? { [registration.capability_ref]: true } : {},
  );
  return {
    schema: HEARTBEAT_EVIDENCE_SCHEMA,
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    runtime_posture: runtimePosture,
    runtime_handle: runtimeHandle,
    latest_work_packet_summary: boundedWorkSummary(latestWorkPacketSummary),
    latest_handoff_ref: typeof latestHandoffRef === 'string' ? latestHandoffRef : null,
    to_data_reachability: boundedReachability(toDataReachability),
    provider_readiness: {
      status: provider.status,
      provider_kind: provider.provider_kind,
      capability_posture: provider.capability_posture,
      refusal_reason: provider.refusal?.reason ?? null,
      raw_provider_config_recorded: false,
      raw_secret_values_recorded: false,
    },
    heartbeat_freshness_is_not_lifecycle_truth: true,
    mutation_flags: { ...NO_HEARTBEAT_MUTATION_FLAGS },
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    recorded_at: now,
  };
}

function runtimeHeartbeatPosture(runtimeHandle, now) {
  if (!runtimeHandle || validateRuntimeHandle(runtimeHandle).length > 0 || runtimeHandle.kind === 'missing') return 'missing';
  const due = runtimeHandle.heartbeat_due_at ? Date.parse(runtimeHandle.heartbeat_due_at) : null;
  if (due !== null && Number.isFinite(due) && due < Date.parse(now)) return 'stale';
  const reachability = runtimeHandle.reachability_summary?.status;
  if (reachability && !['reachable', 'fixture_reachable', 'unknown'].includes(reachability)) return 'degraded';
  return 'alive';
}

function boundedWorkSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return {
      present: false,
      task_number: null,
      task_id: null,
      status: null,
      assignment_agent_id: null,
      source_ref: null,
      raw_values_recorded: false,
      raw_prompt_recorded: false,
      raw_task_markdown_recorded: false,
      raw_provider_output_recorded: false,
      raw_transcript_recorded: false,
      raw_secret_values_recorded: false,
      values_omitted: true,
    };
  }
  return {
    present: true,
    task_number: typeof summary.task_number === 'number' ? summary.task_number : null,
    task_id: typeof summary.task_id === 'string' ? summary.task_id : null,
    status: typeof summary.status === 'string' ? summary.status : null,
    assignment_agent_id: typeof summary.assignment?.agent_id === 'string' ? summary.assignment.agent_id : null,
    source_ref: typeof summary.source_ref === 'string' ? summary.source_ref : null,
    raw_values_recorded: false,
    raw_prompt_recorded: false,
    raw_task_markdown_recorded: false,
    raw_provider_output_recorded: false,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
    values_omitted: true,
  };
}

function boundedReachability(reachability) {
  if (!reachability || typeof reachability !== 'object' || Array.isArray(reachability)) {
    return {
      status: 'unknown',
      checked_at: null,
      evidence_refs: [],
      raw_values_recorded: false,
      values_omitted: true,
    };
  }
  return {
    status: typeof reachability.status === 'string' ? reachability.status : 'unknown',
    checked_at: typeof reachability.checked_at === 'string' ? reachability.checked_at : null,
    evidence_refs: Array.isArray(reachability.evidence_refs) ? reachability.evidence_refs.slice(0, 20) : [],
    raw_values_recorded: false,
    values_omitted: true,
  };
}

export {
  HEARTBEAT_EVIDENCE_SCHEMA,
  NO_HEARTBEAT_MUTATION_FLAGS,
  buildHeartbeatEvidence,
  runtimeHeartbeatPosture,
};
