import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  SITE_CONTINUITY_ACTIONS,
  SITE_CONTINUITY_BINDING_SCHEMA,
  SITE_CONTINUITY_EMBODIMENT_KINDS,
  SITE_CONTINUITY_EXCHANGE_CLASSES,
  SITE_CONTINUITY_EXCHANGE_PACKET_SCHEMA,
  classifySiteContinuityExchangePacket,
  classifySiteContinuityExchange,
  createSiteContinuityExchangePacket,
  createSiteContinuityPacketId,
  createSiteContinuityBinding,
  validateSiteContinuityExchangePacket,
  validateSiteContinuityBinding,
} from './site-continuity.mjs';

const fixtureCases = JSON.parse(readFileSync(new URL('../fixtures/site-continuity-cases.json', import.meta.url), 'utf8'));

test('site continuity binding validates local Windows and Cloudflare embodiments', () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  assert.equal(binding.schema, SITE_CONTINUITY_BINDING_SCHEMA);
  assert.equal(binding.site_id, 'site_fixture');
  assert.deepEqual(validateSiteContinuityBinding(binding), { ok: true, errors: [] });
  assert.equal(binding.embodiments.some((embodiment) => embodiment.embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS), true);
  assert.equal(binding.embodiments.some((embodiment) => embodiment.embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER), true);
});

test('fixture cases classify stable continuity exchanges', () => {
  assert.equal(fixtureCases.schema, 'narada.site_continuity_cases.v1');
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  for (const fixture of fixtureCases.cases) {
    const decision = classifySiteContinuityExchange(binding, fixture.request);
    assert.equal(decision.action, fixture.expected.action, fixture.name);
    assert.equal(decision.reason, fixture.expected.reason, fixture.name);
    assert.equal(decision.relation_kind, fixture.expected.relation_kind, fixture.name);
  }
});

test('cross embodiment mutation execution is refused even for the same Site', () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const decision = classifySiteContinuityExchange(binding, {
    site_id: 'site_fixture',
    exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.CROSS_EMBODIMENT_MUTATION_EXECUTION,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
  });
  assert.equal(decision.action, SITE_CONTINUITY_ACTIONS.REFUSE);
  assert.equal(decision.source_authority_locus, 'cloudflare-carrier');
  assert.equal(decision.target_authority_locus, 'local-windows-site-authority');
  assert.equal(decision.confirmation_required.includes('source_authority_locus_disclosed'), true);
});

test('invalid binding refuses rather than inferring continuity', () => {
  const decision = classifySiteContinuityExchange({ schema: SITE_CONTINUITY_BINDING_SCHEMA, site_id: 'site_fixture' }, {
    exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.SITE_IDENTITY_BINDING,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
  });
  assert.equal(decision.action, SITE_CONTINUITY_ACTIONS.REFUSE);
  assert.equal(decision.reason, 'site_continuity_binding_invalid');
  assert.equal(decision.validation_errors.includes('site_continuity_binding_classifier_version_mismatch'), true);
});

test('exchange packet admits projection and evidence references without mutation execution', () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const packet = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    decisions: [classifySiteContinuityExchange(binding, {
      site_id: 'site_fixture',
      exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.MUTATION_EVIDENCE_REFERENCE,
      source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
      target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    })],
    projections: [{ projection_class: 'read_model_projection', source_cursor: 'windows-cursor-1' }],
    evidence_refs: [{ evidence_ref: 'evidence:local:1', authority_locus: 'local-windows-site-authority' }],
  });
  assert.equal(packet.schema, SITE_CONTINUITY_EXCHANGE_PACKET_SCHEMA);
  assert.deepEqual(validateSiteContinuityExchangePacket(packet), { ok: true, errors: [] });
  const admission = classifySiteContinuityExchangePacket(packet);
  assert.equal(admission.action, SITE_CONTINUITY_ACTIONS.EVIDENCE_ONLY);
  assert.equal(admission.reason, 'site_continuity_exchange_packet_evidence_projection_admitted');
});

test('exchange packet ids are stable across generation time for the same embodiment relation', () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const first = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    projections: [{ projection_class: 'read_model_projection', source_cursor: 'cursor-1' }],
    generated_at: '2026-06-07T00:00:00.000Z',
  });
  const second = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    projections: [{ projection_class: 'read_model_projection', source_cursor: 'cursor-2' }],
    generated_at: '2026-06-07T00:01:00.000Z',
  });
  assert.equal(first.packet_id, second.packet_id);
  assert.equal(createSiteContinuityPacketId(first), first.packet_id);
});

test('exchange packet refuses executable mutation requests', () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const packet = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    executable_mutation_requests: [{ mutation_class: 'local_repository_filesystem_mutation' }],
  });
  const admission = classifySiteContinuityExchangePacket(packet);
  assert.equal(admission.action, SITE_CONTINUITY_ACTIONS.REFUSE);
  assert.equal(admission.reason, 'site_continuity_exchange_packet_executable_mutation_refused');
});
