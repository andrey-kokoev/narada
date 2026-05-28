import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRepairGuidance } from './repair-guidance.mjs';

const REQUIRED_STATES = [
  'missing_registration',
  'missing_consent',
  'revoked_grant',
  'missing_runtime',
  'stale_heartbeat',
  'unavailable_provider_transport',
];

test('repair guidance covers required blocked states with bounded diagnostics', () => {
  for (const state of REQUIRED_STATES) {
    const guidance = buildRepairGuidance({
      carrierSessionId: `carrier_session_${state}`,
      blockedState: state,
      now: '2026-05-16T03:51:00.000Z',
    });

    assert.equal(guidance.blocked_state, state);
    assert.equal(typeof guidance.guidance, 'string');
    assert.ok(guidance.guidance.length > 0);
    assert.ok(guidance.next_diagnostic_commands.some((command) => command.includes('supervisor-cli.mjs doctor')));
    assert.equal(guidance.values_omitted, true);
  }
});

test('repair guidance does not perform automatic repair mutation', () => {
  const guidance = buildRepairGuidance({
    carrierSessionId: 'carrier_session_no_repair',
    blockedState: 'missing_runtime',
  });

  assert.equal(guidance.automatic_repair_mutation, false);
  assert.equal(guidance.repair_performed, false);
  assert.equal(guidance.capability_grant_performed, false);
  assert.equal(guidance.credential_access_performed, false);
  assert.equal(guidance.provider_transport_invoked, false);
});

test('repair guidance omits raw prompt provider output transcript and secrets', () => {
  const guidance = buildRepairGuidance({
    carrierSessionId: 'carrier_session_repair_redaction_sk-repairsecret123456',
    blockedState: 'unavailable_provider_transport',
  });
  const text = JSON.stringify(guidance);

  assert.equal(guidance.raw_transcript_recorded, false);
  assert.equal(guidance.raw_prompt_recorded, false);
  assert.equal(guidance.raw_provider_output_recorded, false);
  assert.equal(guidance.raw_secret_values_recorded, false);
  assert.doesNotMatch(text, /raw prompt/);
  assert.doesNotMatch(text, /provider output/);
  assert.doesNotMatch(text, /conversation transcript/);
  assert.doesNotMatch(text, /sk-repairsecret123456/);
});
