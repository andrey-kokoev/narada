import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { materializeAndClose, readiness, smokeProof } from './harness.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-carrier-'));
}

test('narada-native harness materializes and closes with reconstructable facade-only evidence', () => {
  const siteRoot = tempSite();
  const result = materializeAndClose({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId: 'carrier_session_test_native',
    agentStartEventId: 'agent_start_test_native',
    capabilityProjections: [{
      capability_ref: 'capability:task_read_packet',
      capability_kind: 'task_read_packet',
      status: 'admitted',
      consent_refs: ['consent://operator/task-read'],
      grant_freshness: { posture: 'current' },
      revocation_status: 'not_revoked',
      credential_ref_value: 'sk-should-not-persist',
    }],
    now: '2026-05-15T19:12:00.000Z',
  });

  assert.equal(result.schema, 'narada.narada_native_carrier.materialize_and_close_result.v0');
  assert.equal(result.state, 'stopped');
  for (const evidencePath of Object.values(result.evidence_paths)) {
    assert.equal(fs.existsSync(evidencePath), true);
  }

  const start = JSON.parse(fs.readFileSync(result.evidence_paths.start, 'utf8'));
  const hydrate = JSON.parse(fs.readFileSync(result.evidence_paths.hydrate, 'utf8'));
  const capabilities = JSON.parse(fs.readFileSync(result.evidence_paths.capabilities, 'utf8'));
  const heartbeat = JSON.parse(fs.readFileSync(result.evidence_paths.heartbeat, 'utf8'));
  const close = JSON.parse(fs.readFileSync(result.evidence_paths.close, 'utf8'));

  assert.equal(start.session.agent_id, 'narada.builder');
  assert.equal(start.session.capability_projection_statuses[0].capability_ref, 'capability:task_read_packet');
  assert.equal(start.session.capability_projection_statuses[0].status, 'admitted');
  assert.equal(start.session.capability_projection_statuses[0].consent_ref_present, true);
  assert.equal(start.session.capability_projection_statuses[0].values_omitted, true);
  assert.equal(JSON.stringify(start).includes('sk-should-not-persist'), false);
  assert.equal(start.session.startup_command.name, 'agent_context_startup_sequence');
  assert.equal(hydrate.hydration_result.target_local_mcp, 'narada-proper');
  assert.equal(capabilities.capability_posture, 'facade_only');
  assert.equal(capabilities.projected_capabilities_are_not_grants, true);
  assert.equal(heartbeat.direct_sqlite_inspection_required, false);
  assert.equal(heartbeat.effect_authority_admitted, false);
  assert.equal(close.effect_execution_attempted, false);
  assert.equal(close.terminal_claim, 'carrier_session_closed_without_authority_transfer');
  assert.ok(result.withheld_authorities.includes('task_lifecycle_mutation_authority'));
  assert.ok(result.withheld_authorities.includes('repository_publication_authority'));
  assert.ok(result.withheld_authorities.includes('credential_access'));
  assert.ok(result.withheld_authorities.includes('native_shell_authority'));
});

test('narada-native readiness reports planned, running, and closed posture without authority transfer', () => {
  const siteRoot = tempSite();
  const proof = smokeProof({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId: 'carrier_session_test_native_readiness',
    agentStartEventId: 'agent_start_test_native_readiness',
    now: '2026-05-15T19:13:00.000Z',
  });
  const planned = readiness({ state: 'planned' });

  assert.equal(planned.direct_sqlite_inspection_required, false);
  assert.equal(proof.planned.readiness_state, 'planned');
  assert.equal(proof.materialized.readiness_state, 'materialized');
  assert.equal(proof.running.readiness_state, 'running');
  assert.equal(proof.closed.readiness_state, 'stopped');
  assert.equal(proof.effect_execution_attempted, false);
  assert.equal(proof.closed.effect_execution_attempted, false);
  assert.equal(proof.closed.effect_owners.task_lifecycle, 'task_governance_service');
  assert.equal(proof.closed.effect_owners.command_execution, 'command_execution_intent_service');
  assert.ok(proof.closed.withheld_authorities.includes('outbox_transport_authority'));
  assert.ok(proof.closed.withheld_authorities.includes('native_shell_authority'));
  assert.equal(fs.existsSync(proof.evidence_paths.close), true);
  assert.deepEqual(proof.closed.smoke_proof_commands, [
    'node --test tools\\narada-native-carrier\\harness.test.mjs',
  ]);
});
