import assert from 'node:assert/strict';
import test from 'node:test';

import {
  admitEvidencePacket,
  auditEvidenceCorrelation,
  buildRuntimeEvidenceReference,
  buildTaskEvidenceReference,
  createEvidencePacket,
  reconcileEffectConfirmation,
  reconcileInterruptedEffect,
  type EvidencePacket,
  type EvidencePacketInput,
  type EvidenceStatus,
} from './evidence-confirmation.js';

const correlation = {
  request_ref: 'request:1',
  input_ref: 'input:1',
  turn_ref: 'turn:1',
  session_ref: 'session:1',
  authority_epoch: 3,
  capability_ref: 'capability:write',
  intent_ref: 'intent:1',
  effect_ref: 'effect:1',
  observation_ref: 'observation:1',
};

function packet(overrides: Partial<EvidencePacketInput> = {}): EvidencePacket {
  return createEvidencePacket({
    packet_id: 'packet:1',
    claim: {
      claim_ref: 'claim:1',
      claim_kind: 'effect',
      statement: 'The requested effect has completed.',
      claimed_status: 'completed',
      effect_ref: 'effect:1',
    },
    evidence_type: 'observation',
    producer_ref: 'producer:authority',
    verifier_ref: 'verifier:operator',
    trust: 'verified',
    invalidation: 'valid',
    invalidation_reason: null,
    created_at: '2026-07-28T00:00:00.000Z',
    observed_at: '2026-07-28T00:00:01.000Z',
    scope: { site_ref: 'site:andrey', authority_ref: 'authority:local', object_ref: 'object:1' },
    artifacts: [{ ref: 'artifact:1', kind: 'test_output', digest: 'sha256:test', media_type: 'application/json' }],
    command_test_refs: [{ kind: 'test', ref: 'test:evidence', result_ref: 'result:1' }],
    correlation,
    predecessor_packet_refs: [],
    evidence_packet_refs: [],
    metadata: { source: 'test' },
    ...overrides,
  });
}

test('EvidencePacket carries the complete proof envelope without a permission field', () => {
  const value = packet();
  assert.equal(value.schema, 'narada.evidence_packet.v1');
  assert.equal(value.producer_ref, 'producer:authority');
  assert.equal(value.verifier_ref, 'verifier:operator');
  assert.equal(value.trust, 'verified');
  assert.equal(value.invalidation, 'valid');
  assert.equal(value.correlation.effect_ref, 'effect:1');
  assert.equal(value.artifacts[0]?.ref, 'artifact:1');
  assert.equal(value.command_test_refs[0]?.ref, 'test:evidence');
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'permission'), false);
  assert.equal(admitEvidencePacket(value).admitted, true);
});

test('Evidence admission rejects malformed, invalidated, uncorrelated, and permission-bearing packets', () => {
  const missingVerifier = { ...packet(), verifier_ref: '' };
  assert.equal(admitEvidencePacket(missingVerifier).admitted, false);

  const invalidated = packet({ invalidation: 'superseded', invalidation_reason: 'newer packet exists' });
  assert.equal(admitEvidencePacket(invalidated).code, 'invalidated');

  const uncorrelated = packet({
    correlation: {
      request_ref: null,
      input_ref: null,
      turn_ref: null,
      session_ref: null,
      authority_epoch: null,
      capability_ref: null,
      intent_ref: null,
      effect_ref: null,
      observation_ref: null,
    },
  });
  assert.equal(admitEvidencePacket(uncorrelated).code, 'missing_correlation');

  assert.equal(admitEvidencePacket({ ...packet(), permission_granted: true }).code, 'invalid_packet');
});

test('correlation audit detects an observation from the wrong request or epoch', () => {
  const value = packet();
  assert.equal(auditEvidenceCorrelation('effect:1', [value], { request_ref: 'request:1', authority_epoch: 3 }).valid, true);
  const mismatch = auditEvidenceCorrelation('effect:1', [value], { request_ref: 'request:other', authority_epoch: 4 });
  assert.equal(mismatch.valid, false);
  assert.deepEqual(mismatch.mismatches, ['packet:1:request_ref', 'packet:1:authority_epoch']);
});

test('a verified correlated observation confirms completed, failed, and cancelled effects', () => {
  for (const status of ['completed', 'failed', 'cancelled'] as const) {
    const result = reconcileEffectConfirmation({
      effect_ref: 'effect:1',
      packets: [packet({ claim: { ...packet().claim, claimed_status: status } })],
      now: '2026-07-28T00:00:02.000Z',
    });
    assert.equal(result.verdict, 'confirmed');
    assert.equal(result.outcome, status);
    assert.equal(result.reconciliation_required, false);
  }
});

test('provider success, transport closure, and projection freshness do not confirm an effect', () => {
  for (const evidenceType of ['provider', 'transport', 'projection'] as const) {
    const result = reconcileEffectConfirmation({
      effect_ref: 'effect:1',
      packets: [packet({ evidence_type: evidenceType, claim: { ...packet().claim, claimed_status: 'completed' } })],
      now: '2026-07-28T00:00:02.000Z',
    });
    assert.equal(result.verdict, 'unknown');
    assert.equal(result.reason_code, 'transport_or_provider_not_confirmation');
    assert.equal(result.non_confirming_signal_status, 'completed');
  }
});

test('accepted, interrupted, stale, reconnecting, and degraded states remain explicit', () => {
  const statuses: readonly EvidenceStatus[] = ['accepted', 'interrupted_unknown', 'stale', 'reconnecting', 'degraded'];
  for (const status of statuses) {
    const result = reconcileEffectConfirmation({
      effect_ref: 'effect:1',
      packets: [packet({ claim: { ...packet().claim, claimed_status: status } })],
      now: '2026-07-28T00:00:02.000Z',
    });
    assert.equal(result.verdict, 'unknown');
    assert.equal(result.outcome, status);
    assert.equal(result.reconciliation_required, true);
  }
});

test('interrupted effect becomes reconciled only after verified replay evidence', () => {
  const replay = packet({
    packet_id: 'packet:replay',
    evidence_type: 'replay',
    claim: { ...packet().claim, claimed_status: 'completed' },
    correlation: { ...correlation, observation_ref: 'observation:replay' },
  });
  const reconciliation = reconcileInterruptedEffect({
    effect_ref: 'effect:1',
    packets: [replay],
    now: '2026-07-28T00:00:03.000Z',
  });
  assert.equal(reconciliation.status, 'reconciled');
  assert.deepEqual(reconciliation.replay_packet_refs, ['packet:replay']);

  const unresolved = reconcileInterruptedEffect({
    effect_ref: 'effect:1',
    packets: [packet({ claim: { ...packet().claim, claimed_status: 'interrupted_unknown' } })],
    now: '2026-07-28T00:00:03.000Z',
  });
  assert.equal(unresolved.status, 'unknown');
  assert.equal(unresolved.confirmation.reason_code, 'interrupted_requires_reconciliation');
});

test('task and runtime references add packet identities without replacing existing evidence', () => {
  const task = buildTaskEvidenceReference('task:2378', ['legacy:receipt'], ['packet:1', 'packet:1']);
  assert.deepEqual(task.evidence_refs, ['legacy:receipt', 'packet:1']);
  assert.deepEqual(task.evidence_packet_refs, ['packet:1']);

  const runtime = buildRuntimeEvidenceReference('runtime-request:1', 'effect:1', ['packet:1'], 'confirmation:1');
  assert.deepEqual(runtime.evidence_packet_refs, ['packet:1']);
  assert.equal(runtime.confirmation_ref, 'confirmation:1');
});
