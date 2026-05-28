import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeRegistration } from './adapter-registration.mjs';
import { buildNaradaNativeDoctorCommand } from './doctor-command.mjs';
import { buildLaunchCommandPosture } from './launch-command-posture.mjs';
import { reconstruct } from './readiness.mjs';
import { heartbeatSupervisedSession, startSupervisedSession } from './supervisor.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-operator-readback-'));
}

test('fixture path links dry-run launch evidence doctor and reconstruction by carrier session id', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_readback_fixture';
  const launch = buildLaunchCommandPosture({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    dryRun: true,
    launchEvidenceRefs: ['planned:fixture:start'],
    now: '2026-05-16T03:52:00.000Z',
  });
  const start = startSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-16T03:52:01.000Z',
  });
  const heartbeat = heartbeatSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-16T03:52:02.000Z',
  });
  const doctor = buildNaradaNativeDoctorCommand({ siteRoot, carrierSessionId, format: 'json' }).result;
  const reconstruction = reconstruct(siteRoot, carrierSessionId);
  const text = JSON.stringify({ launch, start, heartbeat, doctor, reconstruction });

  assert.equal(launch.carrier_session_id, carrierSessionId);
  assert.equal(start.evidence.carrier_session_id, carrierSessionId);
  assert.equal(heartbeat.evidence.carrier_session_id, carrierSessionId);
  assert.equal(doctor.carrier_session_id, carrierSessionId);
  assert.equal(reconstruction.carrier_session_id, carrierSessionId);
  assert.equal(launch.execution_admission_state, 'dry_run_planned_not_admitted');
  assert.equal(launch.live_provider_invoked, false);
  assert.equal(launch.provider_transport_invoked, false);
  assert.equal(doctor.runtime_posture, 'running');
  assert.ok(reconstruction.evidence_refs['supervisor-start']);
  assert.ok(reconstruction.evidence_refs['supervisor-heartbeat']);
  assert.doesNotMatch(text, /sk-|raw prompt|raw provider output|model output/);
});

test('provider-configured path links dry-run launch doctor and reconstruction without live provider network calls', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_readback_provider';
  writeRegistration(siteRoot, {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
    provider_config: { endpoint: 'https://example.invalid/v1' },
  }, { cap_model_openai_ref: true });
  const launch = buildLaunchCommandPosture({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    registration: {
      adapter_id: 'provider-openai',
      adapter_kind: 'model_executor_adapter',
      provider_kind: 'openai_compatible',
      capability_ref: 'cap_model_openai_ref',
    },
    dryRun: true,
    launchEvidenceRefs: ['planned:provider:start'],
    now: '2026-05-16T03:52:10.000Z',
  });
  const start = startSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-16T03:52:11.000Z',
  });
  const doctor = buildNaradaNativeDoctorCommand({ siteRoot, carrierSessionId, format: 'json' }).result;
  const humanDoctor = buildNaradaNativeDoctorCommand({ siteRoot, carrierSessionId, format: 'human' });
  const reconstruction = reconstruct(siteRoot, carrierSessionId);
  const text = JSON.stringify({ launch, start, doctor, humanDoctor, reconstruction });

  assert.equal(launch.carrier_session_id, carrierSessionId);
  assert.equal(start.evidence.carrier_session_id, carrierSessionId);
  assert.equal(doctor.carrier_session_id, carrierSessionId);
  assert.equal(reconstruction.carrier_session_id, carrierSessionId);
  assert.equal(launch.capability_posture.registration_status, 'configured_provider_adapter');
  assert.equal(launch.execution_admission_state, 'dry_run_planned_not_admitted');
  assert.equal(launch.live_provider_invoked, false);
  assert.equal(launch.provider_transport_invoked, false);
  assert.equal(doctor.provider_posture, 'provider_configured');
  assert.ok(doctor.state_markers.includes('provider_backed'));
  assert.match(humanDoctor.output, /provider: provider_configured/);
  assert.ok(reconstruction.evidence_refs['supervisor-start']);
  assert.doesNotMatch(text, /sk-|credential:\/\/|raw prompt|raw provider output|model output/);
});
