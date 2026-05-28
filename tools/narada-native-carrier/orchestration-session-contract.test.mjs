import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ORCHESTRATION_NO_MUTATION_FLAGS,
  buildOrchestrationInputFixture,
  buildOrchestrationResultFixture,
  validateOrchestrationInput,
  validateOrchestrationResult,
} from './orchestration-session-contract.mjs';

test('orchestration input contract exposes explicit wrapper inputs', () => {
  const input = buildOrchestrationInputFixture();

  assert.equal(input.siteRoot, 'D:\\code\\narada');
  assert.equal(input.carrierSessionId, 'carrier_session_fixture');
  assert.equal(input.agentId, 'narada.builder');
  assert.equal(input.taskNumber, 1327);
  assert.ok(input.toDataRegistry.task_packet);
  assert.ok(input.toDataRegistry.bounded_file_excerpt);
  assert.equal(input.providerOrIntelligenceRegistry.mode, 'fixture');
  assert.equal(input.capabilityLookup.raw_secret_values_recorded, false);
  assert.equal(input.capabilityLookup.projected_capabilities_are_not_grants, true);
  assert.equal(input.clock.source, 'injected_clock');
  assert.deepEqual(validateOrchestrationInput(input), []);
});

test('orchestration result schema covers success refusal fixture fallback and provider-backed modes', () => {
  for (const mode of ['success', 'refusal', 'fixture_fallback', 'provider_backed']) {
    const result = buildOrchestrationResultFixture(mode);

    assert.equal(result.mode, mode);
    assert.ok(result.stage_statuses.to_data);
    assert.ok(result.stage_statuses.to_intelligence);
    assert.ok(result.stage_statuses.handoff_emission);
    assert.ok('to_data_bundle' in result.evidence_refs);
    assert.ok('intelligence_invocation' in result.evidence_refs);
    assert.ok('handoff_draft' in result.evidence_refs);
    assert.deepEqual(result.mutation_flags, ORCHESTRATION_NO_MUTATION_FLAGS);
    assert.deepEqual(validateOrchestrationResult(result), []);
  }
});

test('orchestration contract distinguishes refusal and fixture fallback reasons', () => {
  const refusal = buildOrchestrationResultFixture('refusal');
  const fallback = buildOrchestrationResultFixture('fixture_fallback');
  const provider = buildOrchestrationResultFixture('provider_backed');

  assert.equal(refusal.status, 'refused');
  assert.equal(refusal.refusal_reason, 'missing_required_capability_projection');
  assert.equal(refusal.evidence_refs.to_data_bundle, null);
  assert.equal(fallback.status, 'completed_no_effect');
  assert.equal(fallback.fallback_reason, 'provider_capability_missing_or_ungranted');
  assert.equal(fallback.stage_statuses.to_intelligence, 'fixture_fallback');
  assert.equal(provider.fallback_reason, null);
  assert.equal(provider.stage_statuses.to_intelligence, 'completed');
});

test('orchestration result preserves Intelligence-Authority Separation and no-authority flags', () => {
  const result = buildOrchestrationResultFixture('success');

  assert.equal(result.intelligence_authority_posture.intelligence_output_is_inert, true);
  assert.equal(result.intelligence_authority_posture.authority_owner, 'narada_control_plane');
  assert.equal(result.intelligence_authority_posture.decision_performed, false);
  assert.equal(result.raw_prompt_recorded, false);
  assert.equal(result.raw_provider_output_recorded, false);
  assert.equal(result.raw_transcript_recorded, false);
  assert.equal(result.raw_secret_values_recorded, false);
  for (const value of Object.values(result.mutation_flags)) assert.equal(value, false);
});

test('orchestration validation rejects authority and raw-output collapse', () => {
  const input = buildOrchestrationInputFixture({
    capabilityLookup: {
      raw_secret_values_recorded: true,
      projected_capabilities_are_not_grants: false,
    },
  });
  const result = buildOrchestrationResultFixture('success', {
    intelligence_authority_posture: {
      intelligence_output_is_inert: false,
      decision_performed: true,
    },
    mutation_flags: { ...ORCHESTRATION_NO_MUTATION_FLAGS, command_execution: true },
    raw_provider_output_recorded: true,
  });

  assert.deepEqual(validateOrchestrationInput(input), [
    'capabilityLookup.raw_secret_values_recorded must be false',
    'capabilityLookup.projected_capabilities_are_not_grants must be true',
  ]);
  assert.deepEqual(validateOrchestrationResult(result), [
    'mutation_flags must preserve no-authority posture',
    'intelligence output must be inert',
    'intelligence must not perform authority decision',
    'raw_provider_output_recorded must be false',
  ]);
});
