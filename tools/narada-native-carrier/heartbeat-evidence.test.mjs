import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHeartbeatEvidence } from './heartbeat-evidence.mjs';
import {
  buildFixtureRuntimeHandle,
  buildLocalProcessRuntimeHandle,
  buildMissingRuntimeHandle,
} from './runtime-handle.mjs';

const NOW = '2026-05-16T03:40:00.000Z';

function assertNoRawValues(evidence) {
  const text = JSON.stringify(evidence);
  assert.equal(evidence.raw_transcript_recorded, false);
  assert.equal(evidence.raw_prompt_recorded, false);
  assert.equal(evidence.raw_provider_output_recorded, false);
  assert.equal(evidence.raw_secret_values_recorded, false);
  assert.doesNotMatch(text, /raw transcript|raw provider output|prompt with token|sk-testsecretvalue/);
  for (const value of Object.values(evidence.mutation_flags)) assert.equal(value, false);
}

test('heartbeat evidence distinguishes alive degraded stale and missing runtime states', () => {
  const alive = buildHeartbeatEvidence({
    carrierSessionId: 'session-alive',
    agentId: 'narada.builder',
    runtimeHandle: buildFixtureRuntimeHandle({
      handleId: 'runtime:fixture:alive',
      startedAt: NOW,
      heartbeatDueAt: '2026-05-16T03:45:00.000Z',
    }),
    now: NOW,
  });
  const degraded = buildHeartbeatEvidence({
    carrierSessionId: 'session-degraded',
    agentId: 'narada.builder',
    runtimeHandle: buildLocalProcessRuntimeHandle({
      processPid: 1234,
      startedAt: NOW,
      heartbeatDueAt: '2026-05-16T03:45:00.000Z',
      reachable: false,
    }),
    now: NOW,
  });
  const stale = buildHeartbeatEvidence({
    carrierSessionId: 'session-stale',
    agentId: 'narada.builder',
    runtimeHandle: buildLocalProcessRuntimeHandle({
      processPid: 1235,
      startedAt: NOW,
      heartbeatDueAt: '2026-05-16T03:30:00.000Z',
    }),
    now: NOW,
  });
  const missing = buildHeartbeatEvidence({
    carrierSessionId: 'session-missing',
    agentId: 'narada.builder',
    runtimeHandle: buildMissingRuntimeHandle({ checkedAt: NOW }),
    now: NOW,
  });

  assert.equal(alive.runtime_posture, 'alive');
  assert.equal(degraded.runtime_posture, 'degraded');
  assert.equal(stale.runtime_posture, 'stale');
  assert.equal(missing.runtime_posture, 'missing');
  for (const evidence of [alive, degraded, stale, missing]) assertNoRawValues(evidence);
});

test('heartbeat evidence includes bounded work handoff to-data and provider summaries', () => {
  const evidence = buildHeartbeatEvidence({
    carrierSessionId: 'session-summary',
    agentId: 'narada.builder',
    runtimeHandle: buildFixtureRuntimeHandle({
      handleId: 'runtime:fixture:summary',
      heartbeatDueAt: '2026-05-16T03:45:00.000Z',
    }),
    latestWorkPacketSummary: {
      task_number: 1341,
      task_id: '20260516-1341-implement-heartbeat-evidence',
      status: 'claimed',
      assignment: { agent_id: 'narada.architect' },
      source_ref: 'work-next:1341',
      prompt: 'prompt with token sk-testsecretvalue123456',
      api_token: 'sk-testsecretvalue123456',
    },
    latestHandoffRef: 'handoff:latest',
    toDataReachability: {
      status: 'reachable',
      checked_at: NOW,
      evidence_refs: ['to-data:summary'],
    },
    registration: {
      adapter_id: 'provider-openai',
      adapter_kind: 'model_executor_adapter',
      provider_kind: 'openai_compatible',
      capability_ref: 'cap_model_openai_ref',
    },
    now: NOW,
  });

  assert.equal(evidence.latest_work_packet_summary.present, true);
  assert.equal(evidence.latest_work_packet_summary.task_number, 1341);
  assert.equal(evidence.latest_work_packet_summary.task_id, '20260516-1341-implement-heartbeat-evidence');
  assert.equal(evidence.latest_work_packet_summary.status, 'claimed');
  assert.equal(evidence.latest_work_packet_summary.assignment_agent_id, 'narada.architect');
  assert.equal(evidence.latest_work_packet_summary.source_ref, 'work-next:1341');
  assert.equal(evidence.latest_work_packet_summary.raw_prompt_recorded, false);
  assert.equal(evidence.latest_work_packet_summary.raw_task_markdown_recorded, false);
  assert.equal(JSON.stringify(evidence).includes('prompt with token'), false);
  assert.equal(JSON.stringify(evidence).includes('api_token'), false);
  assert.equal(evidence.latest_handoff_ref, 'handoff:latest');
  assert.equal(evidence.to_data_reachability.status, 'reachable');
  assert.equal(evidence.provider_readiness.status, 'configured_provider_adapter');
  assert.equal(evidence.heartbeat_freshness_is_not_lifecycle_truth, true);
  assertNoRawValues(evidence);
});
