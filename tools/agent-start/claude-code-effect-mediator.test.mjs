import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mediateEffectRequest, writeEffectMediationEvidence } from './claude-code-effect-mediator.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-claude-effect-'));
}

test('claude-code effect request becomes inert governed candidate outside carrier authority', () => {
  const decision = mediateEffectRequest({
    request_id: 'req-task-1',
    carrier_session_id: 'carrier_session_effect',
    agent_id: 'narada.builder',
    effect_kind: 'task',
    target_locus: 'narada_proper',
    requested_capability: 'task_proposal',
    payload: { title: 'Propose follow-up task' },
  }, { task_proposal: true });

  assert.equal(decision.status, 'inert_candidate');
  assert.equal(decision.authority_owner, 'task_governance_service');
  assert.equal(decision.carrier_mutation_admitted, false);
  assert.equal(decision.governed_handoff.status, 'awaiting_canonical_admission');
  assert.equal(decision.envelope.raw_secret_values_recorded, false);
  assert.equal(decision.envelope.raw_payload_recorded, false);
  assert.deepEqual(decision.envelope.payload_summary, {
    shape: 'object',
    keys: ['title'],
    values_omitted: true,
  });
  assert.equal('payload' in decision.envelope, false);
});

test('claude-code effect mediation refuses unsupported direct effects and missing grants', () => {
  const unsupported = mediateEffectRequest({
    request_id: 'req-shell-1',
    carrier_session_id: 'carrier_session_effect',
    agent_id: 'narada.builder',
    effect_kind: 'native_shell',
    target_locus: 'narada_proper',
    payload: { command: 'echo forbidden' },
  });
  const missingGrant = mediateEffectRequest({
    request_id: 'req-outbox-1',
    carrier_session_id: 'carrier_session_effect',
    agent_id: 'narada.builder',
    effect_kind: 'outbox',
    target_locus: 'narada_proper',
    requested_capability: 'outbox_transport',
    payload: { body: 'send this' },
  }, {});
  const ambiguous = mediateEffectRequest({
    request_id: 'req-command-1',
    carrier_session_id: 'carrier_session_effect',
    agent_id: 'narada.builder',
    effect_kind: 'command',
    payload: { command: 'narada status' },
  }, {});

  assert.equal(unsupported.status, 'refused');
  assert.equal(unsupported.reason, 'unsupported_effect_kind');
  assert.match(unsupported.diagnostic, /Route through task, inbox, outbox, command, or publication/);
  assert.equal(missingGrant.status, 'refused');
  assert.equal(missingGrant.reason, 'missing_capability_grant');
  assert.equal(missingGrant.authority_owner, 'canonical_outbox_service');
  assert.equal(ambiguous.status, 'refused');
  assert.equal(ambiguous.reason, 'target_locus_ambiguous');
  assert.equal(ambiguous.authority_owner, 'command_execution_intent_service');
});

test('claude-code effect mediation refuses and omits secret-bearing payload evidence', () => {
  const siteRoot = tempSite();
  const decision = mediateEffectRequest({
    request_id: 'req-secret-1',
    carrier_session_id: 'carrier_session_effect',
    agent_id: 'narada.builder',
    effect_kind: 'command',
    target_locus: 'narada_proper',
    requested_capability: 'command_prepare',
    payload: {
      command: 'deploy',
      env: {
        API_TOKEN: 'sk-testsecretvalue123456',
      },
    },
  }, { command_prepare: true });
  const evidencePath = writeEffectMediationEvidence(siteRoot, decision);
  const evidenceText = fs.readFileSync(evidencePath, 'utf8');
  const persisted = JSON.parse(evidenceText);

  assert.equal(decision.status, 'refused');
  assert.equal(decision.reason, 'secret_bearing_payload');
  assert.match(decision.diagnostic, /credential references or capability grants/);
  assert.equal(persisted.envelope.raw_payload_recorded, false);
  assert.equal(persisted.envelope.raw_secret_values_recorded, false);
  assert.equal('payload' in persisted.envelope, false);
  assert.deepEqual(persisted.envelope.payload_secret_findings, ['env.API_TOKEN']);
  assert.doesNotMatch(evidenceText, /sk-testsecretvalue123456/);
});

test('claude-code effect mediation records request decision evidence', () => {
  const siteRoot = tempSite();
  const decision = mediateEffectRequest({
    request_id: 'req-publication-1',
    carrier_session_id: 'carrier_session_effect',
    agent_id: 'narada.builder',
    effect_kind: 'publication',
    target_locus: 'narada_proper',
    requested_capability: 'publication_prepare',
    payload: { ref: 'governance-only' },
  }, { publication_prepare: true });
  const evidencePath = writeEffectMediationEvidence(siteRoot, decision);
  const persisted = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

  assert.equal(fs.existsSync(evidencePath), true);
  assert.equal(persisted.status, 'inert_candidate');
  assert.equal(persisted.authority_owner, 'repository_publication_intent_service');
  assert.equal(persisted.carrier_mutation_admitted, false);
});
