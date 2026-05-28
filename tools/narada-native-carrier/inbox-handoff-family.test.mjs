import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateCarrierActionPacket } from './carrier-action-packet.mjs';
import { emitInboxHandoffPacket } from './inbox-handoff-family.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-inbox-handoff-'));
}

test('inbox handoff emits bounded inert packet with canonical inbox surface', () => {
  const siteRoot = tempSite();
  const result = emitInboxHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_inbox_packet',
    agentId: 'narada.builder',
    envelopeKind: 'external_handoff',
    sourceRef: 'source:operator',
    authorityAssertion: 'operator-authored recommendation for local inbox admission',
    payloadSummary: {
      subject: 'Adopt Site registry',
      secret_token: 'sk-inboxsecret123456',
    },
    suggestedSurface: 'narada inbox submit --file <payload>',
    inboxStateBefore: 'none',
    now: '2026-05-16T03:41:00.000Z',
  });
  const payload = JSON.parse(fs.readFileSync(result.payload_ref, 'utf8'));

  assert.equal(result.packet.action_family, 'inbox');
  assert.equal(result.packet.status, 'inert_proposal');
  assert.deepEqual(validateCarrierActionPacket(result.packet), []);
  assert.equal(payload.envelope_kind, 'external_handoff');
  assert.equal(payload.source_ref, 'source:operator');
  assert.equal(payload.authority_assertion, 'operator-authored recommendation for local inbox admission');
  assert.equal(payload.payload_summary.values_omitted, true);
  assert.equal(payload.payload_summary.keys.includes('secret_token'), false);
  assert.match(payload.suggested_inbox_surface, /narada inbox/);
});

test('inbox handoff performs no inbox database write or envelope transition', () => {
  const siteRoot = tempSite();
  const result = emitInboxHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_inbox_no_mutation',
    agentId: 'narada.builder',
    envelopeKind: 'blocker',
    sourceRef: 'source:carrier',
    authorityAssertion: 'proposal only',
    inboxStateBefore: 'pending',
  });

  assert.equal(result.inbox_state_before, 'pending');
  assert.equal(result.inbox_state_after, 'pending');
  assert.equal(result.inbox_state_changed, false);
  assert.equal(result.direct_inbox_database_write, false);
  assert.equal(result.envelope_status_transition_performed, false);
  assert.equal(result.packet.direct_mutation_performed, false);
  assert.equal(result.packet.requires_canonical_admission, true);
});

test('inbox handoff redacts raw secret-like payload values', () => {
  const siteRoot = tempSite();
  const result = emitInboxHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_inbox_redaction',
    agentId: 'narada.builder',
    envelopeKind: 'message sk-inboxsecret123456',
    sourceRef: 'Bearer verysecretbearervalue123456',
    authorityAssertion: 'authority assertion',
    payloadSummary: {
      body: 'raw body text',
      credential_secret: 'sk-inboxsecret123456',
      provider_output: 'raw provider output',
    },
  });
  const text = fs.readFileSync(result.payload_ref, 'utf8') + JSON.stringify(result.packet);

  assert.equal(result.payload.envelope_kind, 'omitted_sensitive_value');
  assert.equal(result.payload.source_ref, 'omitted_sensitive_value');
  assert.equal(result.payload.raw_payload_recorded, false);
  assert.equal(result.payload.raw_secret_values_recorded, false);
  assert.doesNotMatch(text, /sk-inboxsecret123456/);
  assert.doesNotMatch(text, /verysecretbearervalue/);
  assert.doesNotMatch(text, /raw body text/);
  assert.doesNotMatch(text, /raw provider output/);
});
