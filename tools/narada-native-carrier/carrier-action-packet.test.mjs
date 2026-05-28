import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTION_FAMILIES,
  NO_ACTION_PACKET_AUTHORITY_FLAGS,
  buildCarrierActionPacket,
  validateCarrierActionPacket,
} from './carrier-action-packet.mjs';

test('generic carrier action packet envelope covers all required families', () => {
  for (const family of ACTION_FAMILIES) {
    const packet = buildCarrierActionPacket({
      carrierSessionId: `carrier_session_${family}`,
      actionFamily: family,
      summary: `bounded ${family} proposal`,
      payloadSummary: {
        task_number: 1345,
        target_ref: `target:${family}`,
        api_token: 'sk-actionpacketsecret123456',
      },
      payloadRef: `payload:${family}`,
    });

    assert.equal(packet.action_family, family);
    assert.equal(packet.status, 'inert_proposal');
    assert.equal(packet.payload_ref, `payload:${family}`);
    assert.equal(packet.payload_summary.values_omitted, true);
    assert.equal(packet.payload_summary.keys.includes('api_token'), false);
    assert.deepEqual(validateCarrierActionPacket(packet), []);
  }
});

test('carrier action packets require canonical admission and perform no direct mutation', () => {
  const packet = buildCarrierActionPacket({
    carrierSessionId: 'carrier_session_no_authority',
    actionFamily: 'task_report',
    summary: 'submit task report proposal',
    payloadSummary: { report_id: 'draft_report' },
    payloadRef: 'payload:task-report',
  });

  for (const [flag, expected] of Object.entries(NO_ACTION_PACKET_AUTHORITY_FLAGS)) {
    assert.equal(packet[flag], expected);
  }
  assert.equal(packet.requires_canonical_admission, true);
  assert.equal(packet.direct_mutation_performed, false);
});

test('carrier action packet envelope omits raw transcript provider output prompt and secret values', () => {
  const packet = buildCarrierActionPacket({
    carrierSessionId: 'carrier_session_redacted_packet',
    actionFamily: 'repository_publication',
    summary: 'publish with secret sk-actionpacketsecret123456',
    payloadSummary: {
      prompt: 'raw prompt text',
      raw_provider_output: 'provider output text',
      transcript: 'conversation transcript',
      credential_secret: 'sk-actionpacketsecret123456',
    },
    payloadRef: 'payload:publication',
  });
  const text = JSON.stringify(packet);

  assert.equal(packet.summary, 'summary_omitted_sensitive_value');
  assert.equal(packet.raw_transcript_recorded, false);
  assert.equal(packet.raw_prompt_recorded, false);
  assert.equal(packet.raw_provider_output_recorded, false);
  assert.equal(packet.raw_secret_values_recorded, false);
  assert.doesNotMatch(text, /sk-actionpacketsecret123456/);
  assert.doesNotMatch(text, /raw prompt text/);
  assert.doesNotMatch(text, /provider output text/);
  assert.doesNotMatch(text, /conversation transcript/);
});
