import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { materializeAndClose } from './harness.mjs';
import { runGovernedTaskHandoff } from './task-handoff.mjs';
import { writeRegistration } from './adapter-registration.mjs';
import { buildLocalProcessRuntimeHandle } from './runtime-handle.mjs';
import {
  closeSupervisedSession,
  failSupervisedSession,
  heartbeatSupervisedSession,
  interruptSupervisedSession,
  startSupervisedSession,
  supervisorDoctor,
} from './supervisor.mjs';
import { runSupervisorCli } from './supervisor-cli.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-supervisor-'));
}

function taskPacket() {
  return {
    task_number: 1299,
    task_id: '20260515-1299-add-narada-native-supervised-session-runtime-and-operational',
    title: 'Add Narada-native supervised session runtime',
    assignment: { agent_id: 'narada.builder' },
  };
}

test('supervised session lifecycle is startable inspectable interruptible closeable and reconstructable', async () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_supervisor';
  materializeAndClose({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId,
    agentStartEventId: 'agent_start_supervisor',
    now: '2026-05-15T21:44:00.000Z',
  });
  const handoff = await runGovernedTaskHandoff({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    taskNumber: 1299,
    readTaskPacket: async () => taskPacket(),
    capabilityGrants: { task_report_draft: true },
    now: '2026-05-15T21:44:01.000Z',
  });

  const started = startSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-15T21:44:02.000Z',
  });
  const heartbeat = heartbeatSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    latestWorkPacketSummary: { task_number: 1299, raw_task_markdown_recorded: false },
    now: '2026-05-15T21:44:03.000Z',
  });
  const interrupted = interruptSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-15T21:44:04.000Z',
  });
  const closed = closeSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-15T21:44:05.000Z',
  });
  const doctor = supervisorDoctor(siteRoot, carrierSessionId);

  for (const evidencePath of [
    handoff.draft_path,
    started.evidence_path,
    heartbeat.evidence_path,
    interrupted.evidence_path,
    closed.evidence_path,
  ]) {
    assert.equal(fs.existsSync(evidencePath), true);
  }
  assert.equal(doctor.runtime_state, 'stopped');
  assert.equal(doctor.provider_posture, 'fixture_fallback');
  assert.equal(doctor.reconstruction.closeout.status, 'closed_no_effect');
  assert.equal(heartbeat.evidence.latest_work_packet.task_number, 1299);
  assert.equal(heartbeat.evidence.latest_handoff.status, 'inert_handoff_artifact');
  assert.equal(closed.evidence.direct_task_lifecycle_mutation, false);
  assert.equal(closed.evidence.credential_access, false);
  assert.ok(doctor.authority_non_claims.includes('repository_publication_authority'));
});

test('supervisor doctor distinguishes provider configured running failed and blocked states', () => {
  const siteRoot = tempSite();
  const providerSessionId = 'carrier_session_provider';
  writeRegistration(siteRoot, {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
    provider_config: { endpoint: 'https://example.invalid/v1' },
  }, { cap_model_openai_ref: true });
  materializeAndClose({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId: providerSessionId,
    agentStartEventId: 'agent_start_provider',
    now: '2026-05-15T21:44:10.000Z',
  });
  startSupervisedSession({
    siteRoot,
    carrierSessionId: providerSessionId,
    agentId: 'narada.builder',
    now: '2026-05-15T21:44:11.000Z',
  });
  const runningDoctor = supervisorDoctor(siteRoot, providerSessionId);
  failSupervisedSession({
    siteRoot,
    carrierSessionId: providerSessionId,
    agentId: 'narada.builder',
    reason: 'fixture_failure',
    now: '2026-05-15T21:44:12.000Z',
  });
  const failedDoctor = supervisorDoctor(siteRoot, providerSessionId);
  const blockedDoctor = supervisorDoctor(tempSite(), 'missing_session');

  assert.equal(runningDoctor.runtime_state, 'running');
  assert.equal(runningDoctor.provider_posture, 'provider_configured');
  assert.equal(failedDoctor.runtime_state, 'failed');
  assert.equal(blockedDoctor.runtime_state, 'blocked');
  assert.ok(blockedDoctor.residual_blockers.includes('missing_adapter_evidence'));
});

test('supervisor doctor covers fixture provider blocked running degraded failed interrupted and stopped states', () => {
  const fixtureSite = tempSite();
  const providerSite = tempSite();
  const blockedSite = tempSite();
  const runningSite = tempSite();
  const degradedSite = tempSite();
  const failedSite = tempSite();
  const interruptedSite = tempSite();
  const stoppedSite = tempSite();

  startSupervisedSession({
    siteRoot: fixtureSite,
    carrierSessionId: 'carrier_session_fixture_doctor',
    agentId: 'narada.builder',
    now: '2026-05-15T21:45:00.000Z',
  });
  writeRegistration(providerSite, {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
  }, { cap_model_openai_ref: true });
  startSupervisedSession({
    siteRoot: runningSite,
    carrierSessionId: 'carrier_session_running_doctor',
    agentId: 'narada.builder',
    now: '2026-05-15T21:45:01.000Z',
  });
  heartbeatSupervisedSession({
    siteRoot: degradedSite,
    carrierSessionId: 'carrier_session_degraded_doctor',
    agentId: 'narada.builder',
    runtimeHandle: buildLocalProcessRuntimeHandle({
      processPid: 4001,
      reachable: false,
      heartbeatDueAt: '2026-05-15T21:46:00.000Z',
    }),
    now: '2026-05-15T21:45:02.000Z',
  });
  failSupervisedSession({
    siteRoot: failedSite,
    carrierSessionId: 'carrier_session_failed_doctor',
    agentId: 'narada.builder',
    reasonClass: 'adapter_timeout',
    terminal: false,
    now: '2026-05-15T21:45:03.000Z',
  });
  interruptSupervisedSession({
    siteRoot: interruptedSite,
    carrierSessionId: 'carrier_session_interrupted_doctor',
    agentId: 'narada.builder',
    interruptStatus: 'acknowledged',
    now: '2026-05-15T21:45:04.000Z',
  });
  closeSupervisedSession({
    siteRoot: stoppedSite,
    carrierSessionId: 'carrier_session_stopped_doctor',
    agentId: 'narada.builder',
    closeStatus: 'stopped',
    now: '2026-05-15T21:45:05.000Z',
  });

  const cases = [
    [fixtureSite, 'carrier_session_fixture_doctor', 'running', 'fixture_only', 'fixture_fallback'],
    [providerSite, 'carrier_session_provider_configured_doctor', 'provider_configured', 'provider_configured', 'provider_configured'],
    [blockedSite, 'carrier_session_blocked_doctor', 'blocked', 'fixture_only', 'fixture_fallback'],
    [runningSite, 'carrier_session_running_doctor', 'running', 'fixture_only', 'fixture_fallback'],
    [degradedSite, 'carrier_session_degraded_doctor', 'degraded', 'fixture_only', 'fixture_fallback'],
    [failedSite, 'carrier_session_failed_doctor', 'failed', 'fixture_only', 'fixture_fallback'],
    [interruptedSite, 'carrier_session_interrupted_doctor', 'interrupted', 'fixture_only', 'fixture_fallback'],
    [stoppedSite, 'carrier_session_stopped_doctor', 'stopped', 'fixture_only', 'fixture_fallback'],
  ];

  for (const [siteRoot, carrierSessionId, expectedState, expectedAdapterState, expectedProviderPosture] of cases) {
    const doctor = supervisorDoctor(siteRoot, carrierSessionId);
    const text = JSON.stringify(doctor);
    assert.equal(doctor.doctor_state, expectedState);
    assert.equal(doctor.runtime_state, expectedState);
    assert.equal(doctor.adapter_state, expectedAdapterState);
    assert.ok(doctor.doctor_states.includes(expectedState));
    assert.ok(doctor.doctor_states.includes(expectedAdapterState));
    assert.equal(doctor.provider_posture, expectedProviderPosture);
    assert.equal(doctor.automatic_repair_mutation, false);
    assert.match(doctor.next_diagnostic_command, /supervisor-cli\.mjs doctor/);
    assert.doesNotMatch(text, /sk-|raw stdout|raw stderr|raw provider output/);
    assert.equal(doctor.raw_transcript_recorded, false);
    assert.equal(doctor.raw_secret_values_recorded, false);
  }
});

test('supervisor evidence excludes raw transcripts and secret values', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_redaction';
  const started = startSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-15T21:44:20.000Z',
  });
  const evidenceText = fs.readFileSync(started.evidence_path, 'utf8');
  const doctorText = JSON.stringify(supervisorDoctor(siteRoot, carrierSessionId));

  assert.equal(started.evidence.raw_transcript_recorded, false);
  assert.equal(started.evidence.raw_secret_values_recorded, false);
  assert.doesNotMatch(evidenceText, /SECRET|TOKEN|PASSWORD|sk-/);
  assert.doesNotMatch(doctorText, /SECRET|TOKEN|PASSWORD|sk-/);
});

test('supervisor doctor distinguishes capability projection postures without secrets', () => {
  const cases = [
    ['configured', [{
      capability_ref: 'capability:provider',
      capability_kind: 'provider_model_access',
      status: 'admitted',
      consent_refs: ['consent://provider'],
      grant_freshness: { posture: 'current' },
      revocation_status: 'not_revoked',
      credential_ref_value: 'sk-configured-secret',
    }], (siteRoot) => {
      writeRegistration(siteRoot, {
        adapter_id: 'provider-openai',
        adapter_kind: 'model_executor_adapter',
        provider_kind: 'openai_compatible',
        capability_ref: 'cap_model_openai_ref',
      }, { cap_model_openai_ref: true });
    }],
    ['blocked_missing_consent', [{
      capability_ref: 'capability:provider',
      capability_kind: 'provider_model_access',
      status: 'refused',
      refusal_reason: 'missing_consent_record',
      credential_ref_value: 'sk-missing-secret',
    }]],
    ['blocked_revoked', [{
      capability_ref: 'capability:provider',
      capability_kind: 'provider_model_access',
      status: 'refused',
      refusal_reason: 'revoked_capability',
      revocation_status: 'revoked',
      credential_ref_value: 'sk-revoked-secret',
    }]],
    ['blocked_stale', [{
      capability_ref: 'capability:provider',
      capability_kind: 'provider_model_access',
      status: 'refused',
      refusal_reason: 'stale_grant',
      grant_freshness: { posture: 'stale' },
      credential_ref_value: 'sk-stale-secret',
    }]],
    ['fixture_only', []],
  ];

  for (const [expectedPosture, projections, configure = null] of cases) {
    const siteRoot = tempSite();
    const carrierSessionId = `carrier_session_projection_${expectedPosture}`;
    configure?.(siteRoot);
    materializeAndClose({
      siteRoot,
      carrierSessionId,
      agentId: 'narada.builder',
      agentStartEventId: `agent_start_${expectedPosture}`,
      now: '2026-05-15T21:44:24.000Z',
    });
    startSupervisedSession({
      siteRoot,
      carrierSessionId,
      agentId: 'narada.builder',
      capabilityProjections: projections,
      now: '2026-05-15T21:44:25.000Z',
    });
    const doctor = supervisorDoctor(siteRoot, carrierSessionId);
    const doctorText = JSON.stringify(doctor);

    assert.equal(doctor.capability_projection_posture, expectedPosture);
    assert.doesNotMatch(doctorText, /sk-(configured|missing|revoked|stale)-secret/);
    assert.equal(doctor.raw_secret_values_recorded, false);
  }
});

test('supervisor heartbeat records bounded wrapper stage summaries', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_wrapper_heartbeat';
  const heartbeat = heartbeatSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    wrapperStageSummaries: [{
      stage: 'to_intelligence',
      status: 'completed',
      mode: 'provider_backed',
      evidence_ref: 'evidence:intelligence',
      raw_provider_output: 'sk-secret-output',
    }],
    now: '2026-05-15T21:44:25.000Z',
  });

  assert.equal(heartbeat.evidence.wrapper_stage_summaries.length, 1);
  assert.equal(heartbeat.evidence.wrapper_stage_summaries[0].stage, 'to_intelligence');
  assert.equal(heartbeat.evidence.wrapper_stage_summaries[0].raw_provider_output_recorded, false);
  assert.equal(heartbeat.evidence.wrapper_stage_summaries[0].values_omitted, true);
  assert.equal(JSON.stringify(heartbeat.evidence).includes('sk-secret-output'), false);
});

test('supervisor control evidence covers clean stale interrupted nonterminal and terminal outcomes', () => {
  const cleanSite = tempSite();
  const staleSite = tempSite();
  const interruptedSite = tempSite();
  const nonterminalSite = tempSite();
  const terminalSite = tempSite();

  const cleanClose = closeSupervisedSession({
    siteRoot: cleanSite,
    carrierSessionId: 'carrier_session_clean_close',
    agentId: 'narada.builder',
    closeStatus: 'stopped',
    latestEvidenceRefs: ['supervisor:start'],
    now: '2026-05-15T21:44:26.000Z',
  });
  const staleClose = closeSupervisedSession({
    siteRoot: staleSite,
    carrierSessionId: 'carrier_session_stale_close',
    agentId: 'narada.builder',
    closeStatus: 'stale',
    latestEvidenceRefs: ['supervisor:heartbeat'],
    now: '2026-05-15T21:44:27.000Z',
  });
  const interrupted = interruptSupervisedSession({
    siteRoot: interruptedSite,
    carrierSessionId: 'carrier_session_interrupted',
    agentId: 'narada.builder',
    interruptStatus: 'acknowledged',
    latestEvidenceRefs: ['supervisor:heartbeat'],
    now: '2026-05-15T21:44:28.000Z',
  });
  const nonterminalFailure = failSupervisedSession({
    siteRoot: nonterminalSite,
    carrierSessionId: 'carrier_session_nonterminal_failure',
    agentId: 'narada.builder',
    reasonClass: 'adapter_timeout',
    terminal: false,
    diagnostics: {
      codes: ['adapter_timeout'],
      classes: ['transport'],
      stdout: 'raw stdout sk-secret',
      stderr: 'raw stderr sk-secret',
    },
    latestEvidenceRefs: ['supervisor:start'],
    now: '2026-05-15T21:44:29.000Z',
  });
  const terminalFailure = failSupervisedSession({
    siteRoot: terminalSite,
    carrierSessionId: 'carrier_session_terminal_failure',
    agentId: 'narada.builder',
    reasonClass: 'runtime_exited',
    terminal: true,
    diagnostics: {
      codes: ['exit_code_1'],
      classes: ['runtime'],
      provider_output: 'raw provider output sk-secret',
    },
    latestEvidenceRefs: ['supervisor:start'],
    now: '2026-05-15T21:44:30.000Z',
  });

  assert.equal(cleanClose.evidence.close.status, 'stopped');
  assert.equal(cleanClose.evidence.close.authority_transfer, false);
  assert.equal(staleClose.evidence.close.status, 'stale');
  assert.equal(interrupted.evidence.interrupt.status, 'acknowledged');
  assert.equal(interrupted.evidence.interrupt.supported, true);
  assert.equal(nonterminalFailure.evidence.failure.reason_class, 'adapter_timeout');
  assert.equal(nonterminalFailure.evidence.failure.terminal, false);
  assert.equal(terminalFailure.evidence.failure.reason_class, 'runtime_exited');
  assert.equal(terminalFailure.evidence.failure.terminal, true);

  const cleanReconstruction = supervisorDoctor(cleanSite, 'carrier_session_clean_close').reconstruction.supervisor_control;
  const interruptedReconstruction = supervisorDoctor(interruptedSite, 'carrier_session_interrupted').reconstruction.supervisor_control;
  const terminalReconstruction = supervisorDoctor(terminalSite, 'carrier_session_terminal_failure').reconstruction.supervisor_control;
  assert.equal(cleanReconstruction.close.status, 'stopped');
  assert.equal(cleanReconstruction.close.authority_transfer, false);
  assert.equal(interruptedReconstruction.interrupt.status, 'acknowledged');
  assert.equal(terminalReconstruction.failure.terminal, true);

  for (const evidence of [cleanClose.evidence, staleClose.evidence, interrupted.evidence, nonterminalFailure.evidence, terminalFailure.evidence]) {
    const text = JSON.stringify(evidence);
    assert.equal(evidence.authority_transfer ?? evidence.close?.authority_transfer ?? false, false);
    assert.equal(evidence.unrelated_process_kill_attempted ?? evidence.close?.unrelated_process_kill_attempted ?? false, false);
    assert.doesNotMatch(text, /raw stdout|raw stderr|raw provider output|sk-secret/);
    assert.equal(evidence.raw_transcript_recorded, false);
    assert.equal(evidence.raw_secret_values_recorded, false);
  }
});

test('operator-facing supervisor command exposes bounded lifecycle and doctor readback', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_cli_surface';
  const start = runSupervisorCli([
    'start',
    '--site-root', siteRoot,
    '--carrier-session-id', carrierSessionId,
    '--agent-id', 'narada.builder',
    '--now', '2026-05-15T21:44:30.000Z',
  ]);
  const inspect = runSupervisorCli([
    'inspect',
    '--site-root', siteRoot,
    '--carrier-session-id', carrierSessionId,
  ]);

  assert.equal(start.status, 'success');
  assert.equal(start.result.evidence.state, 'running');
  assert.equal(inspect.status, 'success');
  assert.equal(inspect.result.runtime_state, 'running');
  assert.equal(inspect.direct_task_lifecycle_mutation, false);
  assert.equal(inspect.credential_access, false);
  assert.equal(inspect.raw_transcript_recorded, false);
  assert.equal(inspect.raw_secret_values_recorded, false);
});

test('supervisor CLI script emits JSON doctor output', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_cli_script';
  const script = path.join(process.cwd(), 'tools', 'narada-native-carrier', 'supervisor-cli.mjs');
  const started = spawnSync(process.execPath, [
    script,
    'start',
    '--site-root', siteRoot,
    '--carrier-session-id', carrierSessionId,
    '--agent-id', 'narada.builder',
    '--now', '2026-05-15T21:44:40.000Z',
  ], { encoding: 'utf8' });
  const doctor = spawnSync(process.execPath, [
    script,
    'doctor',
    '--site-root', siteRoot,
    '--carrier-session-id', carrierSessionId,
  ], { encoding: 'utf8' });
  const doctorOutput = JSON.parse(doctor.stdout);

  assert.equal(started.status, 0);
  assert.equal(doctor.status, 0);
  assert.equal(doctorOutput.status, 'success');
  assert.equal(doctorOutput.result.runtime_state, 'running');
  assert.equal(doctorOutput.raw_secret_values_recorded, false);
});
