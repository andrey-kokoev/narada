import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { materializeAndClose } from './harness.mjs';
import { emitCanonicalHandoffDraft } from './handoff-emission-stage.mjs';
import {
  closeSupervisedSession,
  failSupervisedSession,
  heartbeatSupervisedSession,
  interruptSupervisedSession,
  startSupervisedSession,
} from './supervisor.mjs';
import { runFixtureWorkLoop } from './work-loop.mjs';
import { buildLocalProcessRuntimeHandle } from './runtime-handle.mjs';
import { operationalReadiness, reconstruct } from './readiness.mjs';
import { supervisorDoctor } from './supervisor.mjs';
import { emitCommandIntentHandoffPacket } from './command-intent-handoff-family.mjs';
import { emitInboxHandoffPacket } from './inbox-handoff-family.mjs';
import { emitTaskReportHandoffPacket } from './task-report-handoff-family.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-readiness-'));
}

test('native carrier reconstruction and readiness work from durable evidence', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_readiness';
  materializeAndClose({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId,
    agentStartEventId: 'agent_start_readiness',
    now: '2026-05-15T20:34:00.000Z',
  });
  runFixtureWorkLoop({
    siteRoot,
    carrierSessionId,
    startupContext: { agent_id: 'narada.builder' },
    workPacket: { task_number: 1293, prompt: 'inspect readiness with token sk-testsecretvalue123456' },
    now: '2026-05-15T20:34:01.000Z',
  });

  const reconstructed = reconstruct(siteRoot, carrierSessionId);
  const readiness = operationalReadiness(siteRoot, carrierSessionId);

  assert.equal(reconstructed.direct_sqlite_inspection_required, false);
  assert.ok(reconstructed.launch);
  assert.ok(reconstructed.adapter);
  assert.ok(reconstructed.proposal);
  assert.ok(reconstructed.interrupt);
  assert.ok(reconstructed.closeout);
  assert.equal(readiness.adapter_posture, 'fixture_adapter_invoked');
  assert.equal(readiness.capability_posture, 'facade_only');
  assert.deepEqual(readiness.residual_blockers, []);
  assert.ok(readiness.authority_non_claims.includes('repository_publication_authority'));
  assert.equal(readiness.commands.reconstruct, 'reconstruct(siteRoot, carrierSessionId)');
  const readinessText = JSON.stringify(readiness);
  assert.doesNotMatch(readinessText, /sk-testsecretvalue123456/);
  assert.doesNotMatch(readinessText, /inspect readiness with token/);
});

test('native carrier readiness reports unsafe adapter evidence as residual blockers', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_unsafe_readiness';
  const sessionDir = path.join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'adapter-invocation.json'), `${JSON.stringify({
    schema: 'narada.narada_native_carrier.adapter_invocation.v0',
    input_summary: {
      raw_secret_values_recorded: true,
      unbounded_transcript_recorded: false,
    },
    output: {
      raw_output_recorded: true,
      raw_secret_values_recorded: false,
      unbounded_transcript_recorded: true,
    },
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(sessionDir, 'work-loop-closeout.json'), `${JSON.stringify({
    schema: 'narada.narada_native_carrier.loop_closeout.v0',
    status: 'closed_no_effect',
  }, null, 2)}\n`, 'utf8');

  const readiness = operationalReadiness(siteRoot, carrierSessionId);

  assert.deepEqual(readiness.residual_blockers, [
    'adapter_evidence_records_raw_secret_values',
    'adapter_evidence_records_unbounded_transcript',
    'adapter_evidence_records_raw_output',
  ]);
});

test('native carrier reconstruction exposes bounded session-start projection statuses', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_projection_reconstruction';
  materializeAndClose({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId,
    agentStartEventId: 'agent_start_projection_reconstruction',
    capabilityProjections: [{
      capability_ref: 'capability:carrier_readiness_read',
      capability_kind: 'carrier_readiness_read',
      status: 'refused',
      refusal_reason: 'stale_grant',
      grant_freshness: { posture: 'stale' },
      credential_ref_value: 'sk-reconstruction-secret',
    }],
    now: '2026-05-15T20:34:30.000Z',
  });

  const reconstructed = reconstruct(siteRoot, carrierSessionId);
  const statuses = reconstructed.launch.session.capability_projection_statuses;
  const text = JSON.stringify(reconstructed);

  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].capability_ref, 'capability:carrier_readiness_read');
  assert.equal(statuses[0].status, 'refused');
  assert.equal(statuses[0].refusal_reason, 'stale_grant');
  assert.equal(statuses[0].values_omitted, true);
  assert.doesNotMatch(text, /sk-reconstruction-secret/);
});

test('native carrier reconstructs capability consent posture without secret-store inspection', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_capability_consent_reconstruction';
  materializeAndClose({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId,
    agentStartEventId: 'agent_start_capability_consent_reconstruction',
    capabilityProjections: [{
      capability_ref: 'capability:provider_model_access',
      capability_kind: 'provider_model_access',
      status: 'admitted',
      credential_ref_present: true,
      consent_refs: ['consent://operator/provider'],
      grant_freshness: { posture: 'current' },
      revocation_status: 'not_revoked',
      credential_ref_value: 'sk-consent-reconstruction-secret',
    }],
    now: '2026-05-15T20:34:45.000Z',
  });

  const reconstructed = reconstruct(siteRoot, carrierSessionId);
  const readiness = operationalReadiness(siteRoot, carrierSessionId);
  const consent = reconstructed.capability_consent_reconstruction;
  const text = JSON.stringify({ reconstructed, readiness });

  assert.equal(reconstructed.direct_secret_store_inspection_required, false);
  assert.equal(consent.direct_secret_store_inspection_required, false);
  assert.equal(consent.raw_secret_values_recorded, false);
  assert.equal(consent.projection_count, 1);
  assert.equal(consent.projections[0].capability_ref, 'capability:provider_model_access');
  assert.equal(consent.projections[0].credential_ref_present, true);
  assert.equal(consent.projections[0].consent_ref_present, true);
  assert.equal(consent.residuals[0].owner, 'canonical_capability_governed_secret_management');
  assert.equal(readiness.capability_consent_reconstruction.residuals[0].residual, 'credential_secret_resolution_and_rotation_not_reconstructed_by_carrier');
  assert.doesNotMatch(text, /sk-consent-reconstruction-secret/);
});

test('native carrier reconstruction includes bounded wrapper evidence refs', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_wrapper_reconstruction';
  materializeAndClose({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId,
    agentStartEventId: 'agent_start_wrapper_reconstruction',
    now: '2026-05-15T20:35:00.000Z',
  });
  runFixtureWorkLoop({
    siteRoot,
    carrierSessionId,
    startupContext: { agent_id: 'narada.builder' },
    workPacket: { task_number: 1331, prompt: 'do not record raw prompt sk-wrappersecret' },
    now: '2026-05-15T20:35:01.000Z',
  });
  const handoff = emitCanonicalHandoffDraft({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    reviewer: 'narada.architect',
    taskNumber: 1331,
    taskId: '20260516-1331-integrate-supervisor-heartbeat-and-reconstruction',
    orchestrationResult: {
      mode: 'fixture',
      status: 'completed_no_effect',
      stage_statuses: { to_data: 'completed', to_intelligence: 'completed', handoff_emission: 'completed' },
      evidence_refs: { to_data_stage: 'evidence:to-data', to_intelligence_stage: 'evidence:to-intelligence' },
    },
    now: '2026-05-15T20:35:02.000Z',
  });
  const heartbeat = heartbeatSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    wrapperStageSummaries: [{
      stage: 'handoff_emission',
      status: handoff.status,
      mode: 'fixture',
      evidence_ref: handoff.draft_path,
      raw_prompt: 'sk-wrappersecret',
    }],
    now: '2026-05-15T20:35:03.000Z',
  });

  const reconstructed = reconstruct(siteRoot, carrierSessionId);
  const summaryNames = reconstructed.wrapper_evidence_summaries.map((summary) => summary.name).sort();
  const reconstructedText = JSON.stringify(reconstructed);

  assert.equal(reconstructed.wrapper_evidence_refs['canonical-task-report-draft'], handoff.draft_path);
  assert.equal(reconstructed.wrapper_evidence_refs['supervisor-heartbeat'], heartbeat.evidence_path);
  assert.ok(summaryNames.includes('canonical-task-report-draft'));
  assert.ok(summaryNames.includes('supervisor-heartbeat'));
  assert.equal(reconstructed.wrapper_evidence_summaries.every((summary) => summary.values_omitted), true);
  assert.equal(reconstructed.wrapper_evidence_summaries.every((summary) => summary.raw_prompt_recorded === false), true);
  assert.equal(reconstructed.wrapper_evidence_summaries.every((summary) => summary.raw_provider_output_recorded === false), true);
  assert.equal(reconstructed.wrapper_evidence_summaries.every((summary) => summary.raw_transcript_recorded === false), true);
  assert.equal(reconstructed.wrapper_evidence_summaries.every((summary) => summary.raw_secret_values_recorded === false), true);
  assert.doesNotMatch(reconstructedText, /sk-wrappersecret/);
  assert.doesNotMatch(reconstructedText, /do not record raw prompt/);
});

test('native carrier reconstructs live session posture from ordered durable JSON evidence', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_live_reconstruction';
  materializeAndClose({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId,
    agentStartEventId: 'agent_start_live_reconstruction',
    now: '2026-05-15T20:36:00.000Z',
  });
  runFixtureWorkLoop({
    siteRoot,
    carrierSessionId,
    startupContext: { agent_id: 'narada.builder' },
    workPacket: {
      task_number: 1344,
      prompt: 'raw prompt must not appear sk-live-reconstruction',
    },
    now: '2026-05-15T20:36:01.000Z',
  });
  startSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-15T20:36:02.000Z',
  });
  heartbeatSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    runtimeHandle: buildLocalProcessRuntimeHandle({
      processPid: 5001,
      reachable: false,
      heartbeatDueAt: '2026-05-15T20:37:00.000Z',
    }),
    latestWorkPacketSummary: {
      task_number: 1344,
      prompt: 'raw heartbeat prompt sk-live-reconstruction',
    },
    now: '2026-05-15T20:36:03.000Z',
  });
  interruptSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    interruptStatus: 'acknowledged',
    latestEvidenceRefs: ['supervisor-heartbeat'],
    now: '2026-05-15T20:36:04.000Z',
  });
  closeSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    closeStatus: 'stopped',
    latestEvidenceRefs: ['supervisor-interrupt'],
    now: '2026-05-15T20:36:05.000Z',
  });
  failSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    reasonClass: 'post_close_observation_failure',
    terminal: true,
    diagnostics: {
      codes: ['post_close_observation_failure'],
      stderr: 'raw stderr sk-live-reconstruction',
    },
    latestEvidenceRefs: ['supervisor-close'],
    now: '2026-05-15T20:36:06.000Z',
  });

  const reconstructed = reconstruct(siteRoot, carrierSessionId);
  const orderedNames = reconstructed.ordered_events.map((event) => event.name);
  const reconstructedText = JSON.stringify(reconstructed);

  assert.ok(reconstructed.launch);
  assert.ok(reconstructed.supervisor_events.length >= 4);
  assert.ok(reconstructed.adapter);
  assert.ok(reconstructed.proposal);
  assert.ok(reconstructed.interrupt);
  assert.ok(reconstructed.closeout);
  assert.ok(reconstructed.failure);
  assert.ok(orderedNames.indexOf('start') < orderedNames.indexOf('supervisor-start'));
  assert.ok(orderedNames.indexOf('supervisor-start') < orderedNames.indexOf('supervisor-heartbeat'));
  assert.ok(orderedNames.indexOf('supervisor-heartbeat') < orderedNames.indexOf('supervisor-interrupt'));
  assert.ok(orderedNames.indexOf('supervisor-interrupt') < orderedNames.indexOf('supervisor-close'));
  assert.ok(orderedNames.indexOf('supervisor-close') < orderedNames.indexOf('supervisor-failure'));
  assert.equal(reconstructed.latest_posture_summary.latest_phase, 'failure');
  assert.equal(reconstructed.latest_posture_summary.latest_state, 'failed');
  assert.equal(reconstructed.latest_posture_summary.control_status, 'post_close_observation_failure');
  assert.equal(reconstructed.direct_sqlite_inspection_required, false);
  assert.equal(reconstructed.direct_secret_store_inspection_required, false);
  assert.doesNotMatch(reconstructedText, /sk-live-reconstruction/);
  assert.doesNotMatch(reconstructedText, /raw prompt must not appear/);
  assert.doesNotMatch(reconstructedText, /raw heartbeat prompt/);
  assert.doesNotMatch(reconstructedText, /raw stderr/);
});

test('readiness and doctor expose bounded handoff artifacts for all families', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_handoff_reconstruction';
  const sessionDir = path.join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
  emitTaskReportHandoffPacket({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    taskNumber: 1350,
    reportSummary: 'task report handoff',
  });
  emitInboxHandoffPacket({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    envelopeKind: 'recommendation',
    sourceRef: 'source:operator',
    authorityAssertion: 'proposal only',
    payloadSummary: { body: 'raw body sk-handoffsecret123456' },
  });
  emitCommandIntentHandoffPacket({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    argv: ['node', '--version'],
  });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'outbox-intent-handoff-payload.json'), `${JSON.stringify({
    schema: 'narada.narada_native_carrier.outbox_intent_handoff_payload.v0',
    status: 'inert_outbox_intent_draft',
    direct_mutation_performed: false,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(sessionDir, 'repository-publication-handoff-payload.json'), `${JSON.stringify({
    schema: 'narada.narada_native_carrier.repository_publication_handoff_payload.v0',
    status: 'inert_repository_publication_draft',
    direct_mutation_performed: false,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
  }, null, 2)}\n`, 'utf8');

  const reconstructed = reconstruct(siteRoot, carrierSessionId);
  const readiness = operationalReadiness(siteRoot, carrierSessionId);
  const doctor = supervisorDoctor(siteRoot, carrierSessionId);
  const families = reconstructed.handoff_artifacts.map((artifact) => artifact.family).sort();
  const text = JSON.stringify({ reconstructed, readiness, doctor });

  assert.deepEqual(families, ['command_intent', 'inbox', 'outbox_intent', 'repository_publication', 'task_report']);
  assert.equal(readiness.handoff_artifacts.length, 5);
  assert.equal(doctor.handoff_artifacts.length, 5);
  assert.equal(reconstructed.handoff_artifacts.every((artifact) => artifact.requires_canonical_admission), true);
  assert.equal(reconstructed.handoff_artifacts.every((artifact) => artifact.direct_mutation_performed === false), true);
  assert.equal(reconstructed.handoff_artifacts.every((artifact) => artifact.payload_ref.endsWith('.json')), true);
  assert.doesNotMatch(text, /sk-handoffsecret123456/);
  assert.doesNotMatch(text, /raw body/);
});
