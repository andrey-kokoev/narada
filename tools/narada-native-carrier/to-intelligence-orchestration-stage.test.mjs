import assert from 'node:assert/strict';
import test from 'node:test';
import { runToIntelligenceOrchestrationStage } from './to-intelligence-orchestration-stage.mjs';

const REGISTRATION = {
  provider_kind: 'openai_compatible',
};
const READY = {
  blocked: false,
  adapter_registration_readiness: { status: 'configured_provider_adapter' },
};

test('to-intelligence stage selects provider route and preserves output as inert proposal', async () => {
  const result = await runToIntelligenceOrchestrationStage({
    registration: REGISTRATION,
    readiness: READY,
    packets: [{ read_family: 'task_packet' }],
    providerExecutor: async () => ({
      status: 'proposed',
      text_output: 'provider text with sk-secret should not be copied raw',
      proposed_action_packet: {
        status: 'inert_proposal',
        action_type: 'observation',
        payload: { summary: 'bounded summary' },
        requires_canonical_admission: true,
      },
    }),
  });

  assert.equal(result.mode, 'provider_backed');
  assert.equal(result.status, 'completed');
  assert.equal(result.route.provider_kind, 'openai_compatible');
  assert.equal(result.proposed_action_packet.status, 'inert_proposal');
  assert.equal(result.proposed_action_packet.requires_canonical_admission, true);
  assert.equal(result.intelligence_output_is_inert, true);
  assert.equal(result.authority_decision_performed, false);
  assert.equal(result.raw_provider_output_recorded, false);
  assert.equal(JSON.stringify(result).includes('sk-secret'), false);
});

test('to-intelligence stage represents provider refusal as bounded evidence', async () => {
  const result = await runToIntelligenceOrchestrationStage({
    registration: REGISTRATION,
    readiness: READY,
    providerExecutor: async () => ({
      status: 'refused',
      refusal_output: { reason: 'missing_capability' },
    }),
  });

  assert.equal(result.status, 'provider_refusal');
  assert.equal(result.problem.reason, 'missing_capability');
  assert.equal(result.proposed_action_packet.action_type, 'provider_problem_observation');
  assert.equal(result.raw_provider_output_recorded, false);
});

test('to-intelligence stage represents provider timeout failure and malformed output as bounded evidence', async () => {
  const timeout = await runToIntelligenceOrchestrationStage({
    registration: REGISTRATION,
    readiness: READY,
    providerExecutor: async () => {
      throw new Error('provider timeout after 5000ms');
    },
  });
  const failure = await runToIntelligenceOrchestrationStage({
    registration: REGISTRATION,
    readiness: READY,
    providerExecutor: async () => {
      throw new Error('provider exploded with secret sk-failure');
    },
  });
  const malformed = await runToIntelligenceOrchestrationStage({
    registration: REGISTRATION,
    readiness: READY,
    providerExecutor: async () => 'raw string output',
  });

  assert.equal(timeout.status, 'provider_timeout');
  assert.equal(failure.status, 'provider_failure');
  assert.equal(malformed.status, 'malformed_output');
  assert.equal(JSON.stringify(failure).includes('sk-failure'), false);
  for (const result of [timeout, failure, malformed]) {
    assert.equal(result.intelligence_output_is_inert, true);
    assert.equal(result.authority_decision_performed, false);
    assert.equal(result.raw_provider_output_recorded, false);
    assert.equal(result.unbounded_transcript_recorded, false);
  }
});

test('to-intelligence stage falls back to fixture when provider is unavailable', async () => {
  let providerInvoked = false;
  const result = await runToIntelligenceOrchestrationStage({
    registration: REGISTRATION,
    readiness: { blocked: true, adapter_registration_readiness: { status: 'refused' } },
    providerExecutor: async () => {
      providerInvoked = true;
    },
  });

  assert.equal(providerInvoked, false);
  assert.equal(result.mode, 'fixture_fallback');
  assert.equal(result.route.fallback_reason, 'provider_not_ready_or_executor_missing');
  assert.equal(result.proposed_action_packet.requires_canonical_admission, true);
  assert.equal(result.output_summary.raw_output_recorded, false);
});
