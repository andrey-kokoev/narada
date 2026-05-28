import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCarrierActionPacket } from './carrier-action-packet.mjs';

const INBOX_HANDOFF_PAYLOAD_SCHEMA = 'narada.narada_native_carrier.inbox_handoff_payload.v0';
const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /(Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{12,})/i;

function inboxHandoffPayloadPath(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId, 'inbox-handoff-payload.json');
}

function emitInboxHandoffPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  envelopeKind,
  sourceRef,
  authorityAssertion,
  payloadSummary = {},
  suggestedSurface = 'narada inbox submit',
  inboxStateBefore = null,
  now = new Date().toISOString(),
} = {}) {
  const payloadPath = inboxHandoffPayloadPath(siteRoot, carrierSessionId);
  const payload = {
    schema: INBOX_HANDOFF_PAYLOAD_SCHEMA,
    status: 'inert_inbox_proposal',
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    envelope_kind: boundedText(envelopeKind),
    source_ref: boundedText(sourceRef),
    authority_assertion: boundedText(authorityAssertion),
    payload_summary: boundedPayloadSummary(payloadSummary),
    suggested_inbox_surface: boundedText(suggestedSurface),
    inbox_state_before: inboxStateBefore,
    inbox_state_after: inboxStateBefore,
    inbox_state_changed: false,
    direct_inbox_database_write: false,
    envelope_status_transition_performed: false,
    direct_mutation_performed: false,
    raw_payload_recorded: false,
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
    actionFamily: 'inbox',
    summary: `Inbox handoff proposal for ${payload.envelope_kind ?? 'unspecified envelope'}`,
    payloadSummary: {
      envelope_kind: payload.envelope_kind,
      source_ref_present: Boolean(payload.source_ref),
      authority_assertion_present: Boolean(payload.authority_assertion),
    },
    payloadRef: payloadPath,
  });
  return {
    schema: 'narada.narada_native_carrier.inbox_handoff_result.v0',
    status: 'packet_emitted',
    packet,
    payload,
    payload_ref: payloadPath,
    inbox_state_before: inboxStateBefore,
    inbox_state_after: inboxStateBefore,
    inbox_state_changed: false,
    direct_inbox_database_write: false,
    envelope_status_transition_performed: false,
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

function boundedText(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (SECRET_VALUE_PATTERN.test(value)) return 'omitted_sensitive_value';
  return value.slice(0, 300);
}

export {
  INBOX_HANDOFF_PAYLOAD_SCHEMA,
  emitInboxHandoffPacket,
  inboxHandoffPayloadPath,
};
