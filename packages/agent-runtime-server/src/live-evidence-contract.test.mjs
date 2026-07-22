import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLiveEvidenceContract,
  LIVE_EVIDENCE_POSTURES,
  LIVE_EVIDENCE_SCHEMA,
} from './live-evidence-contract.mjs';

function evidence(overrides = {}) {
  return {
    schema: LIVE_EVIDENCE_SCHEMA,
    scenario: 'contract-test',
    status: 'passed',
    posture: LIVE_EVIDENCE_POSTURES.FIXTURE_BOUNDARY,
    runtime_pids: [100],
    client_pids: [101],
    input_boundary: 'agent-pi-tui-pty',
    durable_oracle: 'events.jsonl',
    external_oracles: ['fixture-provider-request-log'],
    negative_assertions: ['no-native-tools'],
    same_session_after_fault: false,
    production_launch_binding: false,
    production_launch_binding_evidence: null,
    session_ids: ['session-contract'],
    ...overrides,
  };
}

function binding() {
  return {
    schema: 'narada.operator_projection_launch_binding.v1',
    status: 'ready',
    path: 'launch-binding.json',
    site_root: 'site',
    workspace_root: 'site',
    agent: 'agent.resident',
    operator_surface_kind: 'agent-pi-tui',
    runtime_host_kind: 'narada-agent-runtime-server',
    runtime_session_id: 'session-contract',
  };
}

test('live evidence contract admits explicit fixture and production postures', () => {
  const fixture = evidence();
  assert.equal(assertLiveEvidenceContract(fixture), fixture);
  const production = evidence({
    posture: LIVE_EVIDENCE_POSTURES.PARTIAL_PRODUCTION_LAUNCH,
    input_boundary: 'agent-pi-tui-pty',
    external_oracles: ['fixture-provider-request-log', 'production-launch-binding'],
    production_launch_binding: true,
    production_launch_binding_evidence: binding(),
  });
  assert.equal(assertLiveEvidenceContract(production), production);
});

test('live evidence contract rejects invented postures and false binding claims', () => {
  assert.throws(() => assertLiveEvidenceContract(evidence({ posture: 'real-process-partial' })), /posture_invalid/);
  assert.throws(() => assertLiveEvidenceContract(evidence({
    posture: LIVE_EVIDENCE_POSTURES.PARTIAL_PRODUCTION_LAUNCH,
    production_launch_binding: false,
  })), /production_posture_requires_binding/);
  assert.throws(() => assertLiveEvidenceContract(evidence({
    posture: LIVE_EVIDENCE_POSTURES.FIXTURE_BOUNDARY,
    production_launch_binding: true,
  })), /fixture_claims_production_binding/);
});

