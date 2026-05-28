import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeRegistration } from './adapter-registration.mjs';
import { buildNaradaNativeDoctorCommand } from './doctor-command.mjs';
import {
  closeSupervisedSession,
  failSupervisedSession,
  heartbeatSupervisedSession,
  startSupervisedSession,
} from './supervisor.mjs';
import { runSupervisorCli } from './supervisor-cli.mjs';
import { buildLocalProcessRuntimeHandle } from './runtime-handle.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-doctor-command-'));
}

test('doctor command returns compact bounded JSON and human output', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_doctor_command';
  startSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-16T03:47:00.000Z',
  });

  const json = buildNaradaNativeDoctorCommand({ siteRoot, carrierSessionId, format: 'json' });
  const human = buildNaradaNativeDoctorCommand({ siteRoot, carrierSessionId, format: 'human' });

  assert.equal(json.status, 'success');
  assert.equal(json.result.schema, 'narada.narada_native_carrier.doctor_command.v0');
  assert.equal(json.result.carrier_session_id, carrierSessionId);
  assert.equal(json.result.runtime_posture, 'running');
  assert.equal(json.result.provider_posture, 'fixture_fallback');
  assert.equal(json.result.reconstruction_status.status, 'available');
  assert.match(json.result.next_diagnostic_command, /supervisor-cli\.mjs doctor/);
  assert.equal(json.result.automatic_repair_mutation, false);
  assert.equal(json.result.output_authority, 'bounded_projection_not_task_truth');
  assert.equal(human.status, 'success');
  assert.equal(human.format, 'human');
  assert.match(human.output, /runtime: running/);
  assert.match(human.output, /authority: bounded_projection_not_task_truth/);
});

test('doctor command distinguishes configured blocked fixture provider live failed and stopped states', () => {
  const configuredSite = tempSite();
  const blockedSite = tempSite();
  const fixtureSite = tempSite();
  const providerSite = tempSite();
  const failedSite = tempSite();
  const stoppedSite = tempSite();
  const degradedSite = tempSite();

  writeRegistration(configuredSite, {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
  }, { cap_model_openai_ref: true });
  startSupervisedSession({
    siteRoot: fixtureSite,
    carrierSessionId: 'carrier_session_fixture',
    agentId: 'narada.builder',
    now: '2026-05-16T03:47:01.000Z',
  });
  writeRegistration(providerSite, {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
  }, { cap_model_openai_ref: true });
  startSupervisedSession({
    siteRoot: providerSite,
    carrierSessionId: 'carrier_session_provider',
    agentId: 'narada.builder',
    now: '2026-05-16T03:47:02.000Z',
  });
  failSupervisedSession({
    siteRoot: failedSite,
    carrierSessionId: 'carrier_session_failed',
    agentId: 'narada.builder',
    reasonClass: 'adapter_timeout',
    terminal: false,
    now: '2026-05-16T03:47:03.000Z',
  });
  closeSupervisedSession({
    siteRoot: stoppedSite,
    carrierSessionId: 'carrier_session_stopped',
    agentId: 'narada.builder',
    closeStatus: 'stopped',
    now: '2026-05-16T03:47:04.000Z',
  });
  heartbeatSupervisedSession({
    siteRoot: degradedSite,
    carrierSessionId: 'carrier_session_degraded',
    agentId: 'narada.builder',
    runtimeHandle: buildLocalProcessRuntimeHandle({
      processPid: 4102,
      reachable: false,
      heartbeatDueAt: '2026-05-16T03:50:00.000Z',
    }),
    now: '2026-05-16T03:47:05.000Z',
  });

  const configured = buildNaradaNativeDoctorCommand({
    siteRoot: configuredSite,
    carrierSessionId: 'carrier_session_configured',
  }).result;
  const blocked = buildNaradaNativeDoctorCommand({
    siteRoot: blockedSite,
    carrierSessionId: 'carrier_session_blocked',
  }).result;
  const fixture = buildNaradaNativeDoctorCommand({
    siteRoot: fixtureSite,
    carrierSessionId: 'carrier_session_fixture',
  }).result;
  const provider = buildNaradaNativeDoctorCommand({
    siteRoot: providerSite,
    carrierSessionId: 'carrier_session_provider',
  }).result;
  const failed = buildNaradaNativeDoctorCommand({
    siteRoot: failedSite,
    carrierSessionId: 'carrier_session_failed',
  }).result;
  const stopped = buildNaradaNativeDoctorCommand({
    siteRoot: stoppedSite,
    carrierSessionId: 'carrier_session_stopped',
  }).result;
  const degraded = buildNaradaNativeDoctorCommand({
    siteRoot: degradedSite,
    carrierSessionId: 'carrier_session_degraded',
  }).result;

  assert.ok(configured.state_markers.includes('configured'));
  assert.ok(configured.state_markers.includes('provider_backed'));
  assert.ok(blocked.state_markers.includes('blocked'));
  assert.ok(fixture.state_markers.includes('fixture_only'));
  assert.ok(fixture.state_markers.includes('live_running'));
  assert.ok(provider.state_markers.includes('provider_backed'));
  assert.ok(provider.state_markers.includes('live_running'));
  assert.ok(failed.state_markers.includes('failed'));
  assert.ok(stopped.state_markers.includes('stopped'));
  assert.equal(degraded.runtime_posture, 'degraded');
});

test('doctor command output omits secrets raw prompts and model output', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_doctor_redaction';
  writeRegistration(siteRoot, {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
    provider_config: { endpoint: 'https://example.invalid/v1' },
  }, { cap_model_openai_ref: true });
  startSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-16T03:47:06.000Z',
  });
  const sessionDir = path.join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
  fs.writeFileSync(path.join(sessionDir, 'raw-prompt-sk-doctorsecret123456.json'), `${JSON.stringify({
    schema: 'narada.test.secret_payload.v0',
    prompt: 'raw prompt text sk-doctorsecret123456',
    model_output: 'raw model output',
  })}\n`, 'utf8');

  const json = runSupervisorCli([
    'doctor',
    '--site-root', siteRoot,
    '--carrier-session-id', carrierSessionId,
    '--format', 'json',
  ]);
  const human = runSupervisorCli([
    'doctor-compact',
    '--site-root', siteRoot,
    '--carrier-session-id', carrierSessionId,
    '--format', 'human',
  ]);
  const text = JSON.stringify(json) + human.output;

  assert.equal(json.result.raw_transcript_recorded, false);
  assert.equal(json.result.raw_prompt_recorded, false);
  assert.equal(json.result.raw_provider_output_recorded, false);
  assert.equal(json.result.raw_secret_values_recorded, false);
  assert.equal(human.raw_secret_values_recorded, false);
  assert.doesNotMatch(text, /sk-doctorsecret123456/);
  assert.doesNotMatch(text, /raw prompt text/);
  assert.doesNotMatch(text, /raw model output/);
  assert.doesNotMatch(text, /provider config value/);
});
