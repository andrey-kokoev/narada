import assert from 'node:assert/strict';
import test from 'node:test';
import { buildToDataPacketFixture } from './to-data-packet.mjs';
import {
  REQUIRED_TO_DATA_FAMILIES,
  runToDataOrchestrationStage,
} from './to-data-orchestration-stage.mjs';

function packet(family, overrides = {}) {
  return buildToDataPacketFixture(family, {
    carrier_session_id: 'session-1328',
    agent_id: 'narada.builder',
    ...overrides,
  });
}

test('to-data orchestration stage invokes required readers before intelligence', async () => {
  const calls = [];
  const result = await runToDataOrchestrationStage({
    siteRoot: 'D:\\code\\narada',
    carrierSessionId: 'session-1328',
    agentId: 'narada.builder',
    taskNumber: 1328,
    readers: {
      task_packet: async () => {
        calls.push('task_packet');
        return packet('task_packet');
      },
      readiness_snapshot: async () => {
        calls.push('readiness_snapshot');
        return packet('readiness_snapshot');
      },
      evidence_ref_summary: async () => {
        calls.push('evidence_ref_summary');
        return packet('evidence_ref_summary');
      },
    },
    invokeIntelligence: async () => {
      calls.push('intelligence');
      return { status: 'completed', evidence_ref: 'evidence:intelligence' };
    },
  });

  assert.deepEqual(calls, ['task_packet', 'readiness_snapshot', 'evidence_ref_summary', 'intelligence']);
  assert.deepEqual(result.required_read_families, REQUIRED_TO_DATA_FAMILIES);
  assert.equal(result.stage_statuses.to_data, 'completed');
  assert.equal(result.evidence_refs.intelligence_invocation, 'evidence:intelligence');
  assert.equal(result.authority_mutation_performed, undefined);
  for (const value of Object.values(result.mutation_flags)) assert.equal(value, false);
});

test('missing task packet returns refused_missing_data_packet before adapter or provider invocation', async () => {
  let intelligenceInvoked = false;
  const result = await runToDataOrchestrationStage({
    siteRoot: 'D:\\code\\narada',
    carrierSessionId: 'session-1328',
    agentId: 'narada.builder',
    taskNumber: 1328,
    readers: {
      task_packet: async () => null,
      readiness_snapshot: async () => {
        throw new Error('readiness reader should not run after missing task packet');
      },
    },
    invokeIntelligence: async () => {
      intelligenceInvoked = true;
    },
  });

  assert.equal(intelligenceInvoked, false);
  assert.equal(result.status, 'refused_missing_data_packet');
  assert.equal(result.refusal_reason, 'refused_missing_data_packet');
  assert.equal(result.stage_statuses.to_intelligence, 'not_invoked');
  assert.equal(result.stage_statuses.handoff_emission, 'bounded_refusal_emitted');
  assert.equal(result.bounded_refusal_handoff.raw_values_recorded, false);
  assert.equal(result.closeout.status, 'closed_without_intelligence_invocation');
  for (const value of Object.values(result.mutation_flags)) assert.equal(value, false);
});

test('refused readiness packet returns bounded refusal without provider invocation', async () => {
  let providerInvoked = false;
  const result = await runToDataOrchestrationStage({
    siteRoot: 'D:\\code\\narada',
    carrierSessionId: 'session-1328',
    agentId: 'narada.builder',
    taskNumber: 1328,
    readers: {
      task_packet: async () => packet('task_packet'),
      readiness_snapshot: async () => packet('readiness_snapshot', {
        read_status: 'refused',
        refusal: { reason: 'missing_readiness_evidence' },
      }),
      evidence_ref_summary: async () => {
        throw new Error('evidence reader should not run after refused readiness packet');
      },
    },
    invokeIntelligence: async () => {
      providerInvoked = true;
    },
  });

  assert.equal(providerInvoked, false);
  assert.equal(result.status, 'refused_required_data_packet');
  assert.equal(result.missing_or_refused_family, 'readiness_snapshot');
  assert.equal(result.evidence_refs.intelligence_invocation, null);
  assert.equal(result.closeout.direct_effect_execution_attempted, false);
});
