import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function textSummary(value) {
  return {
    present: typeof value === 'string' && value.length > 0,
    length: typeof value === 'string' ? value.length : 0,
    value_omitted: true,
  };
}

function objectShape(value) {
  if (!value || typeof value !== 'object') {
    return {
      shape: Array.isArray(value) ? 'array' : typeof value,
      keys: [],
      values_omitted: true,
    };
  }
  return {
    shape: Array.isArray(value) ? 'array' : 'object',
    keys: Object.keys(value).sort(),
    values_omitted: true,
  };
}

function summarizeProposedActionPacket(packet) {
  if (!packet) {
    return null;
  }
  return {
    status: packet.status,
    action_type: packet.action_type,
    payload_summary: objectShape(packet.payload),
    requires_canonical_admission: packet.requires_canonical_admission === true,
  };
}

function sanitizeAdapterOutput(output) {
  return {
    schema: output.schema,
    adapter_id: output.adapter_id,
    status: output.status,
    text_output_summary: textSummary(output.text_output),
    refusal_output: output.refusal_output
      ? {
          reason: output.refusal_output.reason,
        }
      : null,
    proposed_action_packet: summarizeProposedActionPacket(output.proposed_action_packet),
    closeout_summary: textSummary(output.closeout_summary),
    raw_output_recorded: false,
    raw_secret_values_recorded: false,
    unbounded_transcript_recorded: false,
  };
}

function fixtureAdapter(input) {
  return {
    schema: 'narada.narada_native_carrier.adapter_output.v0',
    adapter_id: 'fixture',
    status: input.prompt ? 'proposed' : 'refused',
    text_output: input.prompt ? `fixture prompt received (${input.prompt.length} chars)` : null,
    refusal_output: input.prompt ? null : { reason: 'missing_prompt' },
    proposed_action_packet: input.prompt
      ? {
          status: 'inert_proposal',
          action_type: 'observation',
          payload: { summary: `Fixture observed ${input.prompt.length} characters.` },
          requires_canonical_admission: true,
        }
      : null,
    closeout_summary: 'fixture_adapter_completed_without_effect_authority',
  };
}

function invokeAdapter({ siteRoot, carrierSessionId, adapter = fixtureAdapter, input, now = new Date().toISOString() }) {
  const output = adapter(input);
  const sanitizedOutput = sanitizeAdapterOutput(output);
  const evidence = {
    schema: 'narada.narada_native_carrier.adapter_invocation.v0',
    carrier_session_id: carrierSessionId,
    adapter_boundary: {
      model_adapter_authority_owner: 'none',
      executor_adapter_authority_owner: 'none',
      output_is_inert_until_admitted: true,
    },
    input_summary: {
      prompt_present: typeof input.prompt === 'string' && input.prompt.length > 0,
      context_keys: Object.keys(input.context ?? {}),
      raw_secret_values_recorded: false,
      unbounded_transcript_recorded: false,
    },
    output: sanitizedOutput,
    recorded_at: now,
  };
  const dir = join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'adapter-invocation.json');
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return { evidence, evidence_path: path };
}

export { fixtureAdapter, invokeAdapter, sanitizeAdapterOutput };
