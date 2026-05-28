import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCarrierActionPacket } from './carrier-action-packet.mjs';

const OUTBOX_INTENT_HANDOFF_PAYLOAD_SCHEMA = 'narada.narada_native_carrier.outbox_intent_handoff_payload.v0';
const REPOSITORY_PUBLICATION_HANDOFF_PAYLOAD_SCHEMA = 'narada.narada_native_carrier.repository_publication_handoff_payload.v0';
const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{12,})/i;

function outboxIntentPayloadPath(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId, 'outbox-intent-handoff-payload.json');
}

function repositoryPublicationPayloadPath(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId, 'repository-publication-handoff-payload.json');
}

function emitOutboxIntentHandoffPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  targetKind,
  targetRef,
  transport,
  routeRef = null,
  capabilityRef = null,
  payloadBodyRef = null,
  payloadBodySummary = {},
  approvalPosture = 'requires_approval',
  now = new Date().toISOString(),
} = {}) {
  const payloadPath = outboxIntentPayloadPath(siteRoot, carrierSessionId);
  const payload = {
    schema: OUTBOX_INTENT_HANDOFF_PAYLOAD_SCHEMA,
    status: 'inert_outbox_intent_draft',
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    target_kind: boundedText(targetKind),
    target_ref: boundedText(targetRef),
    transport: boundedText(transport),
    route_ref: boundedText(routeRef),
    capability_ref: boundedText(capabilityRef),
    payload_body_ref: boundedText(payloadBodyRef),
    payload_body_summary: boundedPayloadSummary(payloadBodySummary),
    approval_posture: boundedText(approvalPosture),
    suggested_outbox_admission_surface: `narada outbox intent submit --file ${payloadPath}`,
    outbound_transport_sent: false,
    executor_invoked: false,
    outbox_item_admitted: false,
    outbox_item_approved: false,
    outbox_item_confirmed: false,
    direct_outbox_database_write: false,
    direct_mutation_performed: false,
    raw_payload_body_recorded: false,
    raw_transport_response_recorded: false,
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    recorded_at: now,
  };
  mkdirSync(dirname(payloadPath), { recursive: true });
  writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const packet = buildCarrierActionPacket({
    carrierSessionId,
    actionFamily: 'outbox_intent',
    summary: `Outbox intent draft for ${payload.target_kind ?? 'unspecified target'}`,
    payloadSummary: {
      target_kind: payload.target_kind,
      target_ref_present: Boolean(payload.target_ref),
      transport: payload.transport,
      route_ref_present: Boolean(payload.route_ref),
      capability_ref_present: Boolean(payload.capability_ref),
      payload_body_ref_present: Boolean(payload.payload_body_ref),
      approval_posture: payload.approval_posture,
    },
    payloadRef: payloadPath,
  });
  return {
    schema: 'narada.narada_native_carrier.outbox_intent_handoff_result.v0',
    status: 'packet_emitted',
    packet,
    payload,
    payload_ref: payloadPath,
    outbound_transport_sent: false,
    executor_invoked: false,
    direct_outbox_database_write: false,
    direct_mutation_performed: false,
  };
}

function emitRepositoryPublicationHandoffPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  repoRoot,
  branch,
  remote = null,
  taskNumber = null,
  taskId = null,
  includePaths = [],
  messageSummary,
  preparationCommand = null,
  now = new Date().toISOString(),
} = {}) {
  const payloadPath = repositoryPublicationPayloadPath(siteRoot, carrierSessionId);
  const payload = {
    schema: REPOSITORY_PUBLICATION_HANDOFF_PAYLOAD_SCHEMA,
    status: 'inert_repository_publication_intent_draft',
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    repo_root: boundedText(repoRoot),
    branch: boundedText(branch),
    remote: boundedText(remote),
    task_number: taskNumber,
    task_id: boundedText(taskId),
    include_paths: boundedStringArray(includePaths),
    message_summary: boundedText(messageSummary),
    preparation_command: boundedText(preparationCommand) ?? `narada repo publication prepare --file ${payloadPath}`,
    suggested_repository_publication_surface: `narada repo publication intent submit --file ${payloadPath}`,
    commit_created: false,
    push_performed: false,
    git_commit_invoked: false,
    git_push_invoked: false,
    repository_publication_admitted: false,
    direct_repository_mutation: false,
    direct_mutation_performed: false,
    raw_diff_recorded: false,
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    recorded_at: now,
  };
  mkdirSync(dirname(payloadPath), { recursive: true });
  writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const packet = buildCarrierActionPacket({
    carrierSessionId,
    actionFamily: 'repository_publication',
    summary: `Repository publication draft for task ${taskNumber ?? 'unspecified'}`,
    payloadSummary: {
      repo_root_present: Boolean(payload.repo_root),
      branch: payload.branch,
      remote_present: Boolean(payload.remote),
      task_number: payload.task_number,
      include_path_count: payload.include_paths.length,
    },
    payloadRef: payloadPath,
  });
  return {
    schema: 'narada.narada_native_carrier.repository_publication_handoff_result.v0',
    status: 'packet_emitted',
    packet,
    payload,
    payload_ref: payloadPath,
    commit_created: false,
    push_performed: false,
    git_commit_invoked: false,
    git_push_invoked: false,
    direct_repository_mutation: false,
    direct_mutation_performed: false,
  };
}

function boundedPayloadSummary(payloadSummary) {
  if (!payloadSummary || typeof payloadSummary !== 'object' || Array.isArray(payloadSummary)) {
    return { keys: [], value_count: 0, values_omitted: true };
  }
  return {
    keys: Object.keys(payloadSummary).filter((key) => !SECRET_KEY_PATTERN.test(key)).sort().slice(0, 40),
    value_count: Object.keys(payloadSummary).length,
    values_omitted: true,
  };
}

function boundedStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => typeof value === 'string' && value.length > 0 && !SECRET_VALUE_PATTERN.test(value) && !SECRET_KEY_PATTERN.test(value))
    .map((value) => value.slice(0, 300))
    .slice(0, 80);
}

function boundedText(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (SECRET_VALUE_PATTERN.test(value)) return 'omitted_sensitive_value';
  return value.slice(0, 500);
}

export {
  OUTBOX_INTENT_HANDOFF_PAYLOAD_SCHEMA,
  REPOSITORY_PUBLICATION_HANDOFF_PAYLOAD_SCHEMA,
  emitOutboxIntentHandoffPacket,
  emitRepositoryPublicationHandoffPacket,
  outboxIntentPayloadPath,
  repositoryPublicationPayloadPath,
};
