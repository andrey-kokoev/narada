import { createHash } from 'node:crypto';

const CARRIER_ACTION_PACKET_SCHEMA = 'narada.narada_native_carrier.action_packet.v0';

const ACTION_FAMILIES = Object.freeze([
  'task_report',
  'inbox',
  'command_intent',
  'outbox_intent',
  'repository_publication',
]);

const NO_ACTION_PACKET_AUTHORITY_FLAGS = Object.freeze({
  requires_canonical_admission: true,
  direct_mutation_performed: false,
  task_lifecycle_mutation: false,
  inbox_mutation: false,
  command_execution: false,
  outbox_transport: false,
  repository_publication: false,
  raw_transcript_recorded: false,
  raw_prompt_recorded: false,
  raw_provider_output_recorded: false,
  raw_secret_values_recorded: false,
});

const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{12,})/i;

function buildCarrierActionPacket({
  packetId = null,
  carrierSessionId,
  actionFamily,
  summary = null,
  payloadSummary = {},
  payloadRef = null,
} = {}) {
  const family = ACTION_FAMILIES.includes(actionFamily) ? actionFamily : 'command_intent';
  const normalizedPayloadRef = typeof payloadRef === 'string' && payloadRef.length > 0 ? payloadRef : null;
  return {
    schema: CARRIER_ACTION_PACKET_SCHEMA,
    packet_id: typeof packetId === 'string' && packetId.length > 0
      ? packetId
      : defaultPacketId({ carrierSessionId, actionFamily: family, payloadRef: normalizedPayloadRef }),
    carrier_session_id: carrierSessionId ?? null,
    action_family: family,
    status: 'inert_proposal',
    summary: boundedSummary(summary),
    payload_summary: boundedPayloadSummary(payloadSummary),
    payload_ref: normalizedPayloadRef,
    ...NO_ACTION_PACKET_AUTHORITY_FLAGS,
  };
}

function validateCarrierActionPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return ['action_packet_must_be_object'];
  if (packet.schema !== CARRIER_ACTION_PACKET_SCHEMA) errors.push('schema_invalid');
  if (typeof packet.packet_id !== 'string' || packet.packet_id.length === 0) errors.push('packet_id_required');
  if (typeof packet.carrier_session_id !== 'string' || packet.carrier_session_id.length === 0) errors.push('carrier_session_id_required');
  if (!ACTION_FAMILIES.includes(packet.action_family)) errors.push('action_family_invalid');
  if (packet.status !== 'inert_proposal') errors.push('status_must_be_inert_proposal');
  if (packet.payload_summary?.values_omitted !== true) errors.push('payload_summary_must_omit_values');
  for (const [flag, expected] of Object.entries(NO_ACTION_PACKET_AUTHORITY_FLAGS)) {
    if (packet[flag] !== expected) errors.push(`${flag}_must_be_${expected}`);
  }
  return errors;
}

function boundedSummary(summary) {
  if (typeof summary !== 'string' || summary.length === 0) return null;
  if (SECRET_VALUE_PATTERN.test(summary)) return 'summary_omitted_sensitive_value';
  return summary.slice(0, 200);
}

function boundedPayloadSummary(payloadSummary) {
  if (!payloadSummary || typeof payloadSummary !== 'object' || Array.isArray(payloadSummary)) {
    return {
      keys: [],
      value_count: 0,
      values_omitted: true,
    };
  }
  const keys = Object.keys(payloadSummary)
    .filter((key) => !SECRET_KEY_PATTERN.test(key))
    .sort()
    .slice(0, 40);
  return {
    keys,
    value_count: Object.keys(payloadSummary).length,
    values_omitted: true,
  };
}

function defaultPacketId({ carrierSessionId, actionFamily, payloadRef }) {
  const hash = createHash('sha256')
    .update(JSON.stringify({ carrierSessionId: carrierSessionId ?? null, actionFamily, payloadRef: payloadRef ?? null }))
    .digest('hex')
    .slice(0, 12);
  return `cap_${actionFamily}_${hash}`;
}

export {
  ACTION_FAMILIES,
  CARRIER_ACTION_PACKET_SCHEMA,
  NO_ACTION_PACKET_AUTHORITY_FLAGS,
  buildCarrierActionPacket,
  validateCarrierActionPacket,
};
