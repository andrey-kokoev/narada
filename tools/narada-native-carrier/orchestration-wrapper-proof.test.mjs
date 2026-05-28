import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeRegistration } from './adapter-registration.mjs';
import { materializeAndClose } from './harness.mjs';
import { emitCanonicalHandoffDraft } from './handoff-emission-stage.mjs';
import { executeProviderAdapter, makeProviderRegistry } from './provider-adapter.mjs';
import { operationalReadiness, reconstruct } from './readiness.mjs';
import {
  closeSupervisedSession,
  heartbeatSupervisedSession,
  interruptSupervisedSession,
  startSupervisedSession,
  supervisorDoctor,
} from './supervisor.mjs';
import { buildToDataPacketFixture } from './to-data-packet.mjs';
import { runToDataOrchestrationStage } from './to-data-orchestration-stage.mjs';
import { runToIntelligenceOrchestrationStage } from './to-intelligence-orchestration-stage.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-wrapper-proof-'));
}

function sessionDir(siteRoot, carrierSessionId) {
  return path.join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
}

function writeStageEvidence(siteRoot, carrierSessionId, name, record) {
  const filePath = path.join(sessionDir(siteRoot, carrierSessionId), `${name}.json`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return filePath;
}

function packet(carrierSessionId, family, boundedSummary) {
  return buildToDataPacketFixture(family, {
    carrier_session_id: carrierSessionId,
    agent_id: 'narada.builder',
    bounded_summary: boundedSummary,
  });
}

test('end-to-end mocked wrapper proof composes bounded evidence without authority mutation', async () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_wrapper_e2e';
  const taskNumber = 1332;
  const taskId = '20260516-1332-add-end-to-end-mocked-wrapper-proof';
  const rawSecret = 'sk-wrapperproofsecret123456';
  const rawPrompt = `mock wrapper prompt ${rawSecret}`;

  materializeAndClose({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId,
    agentStartEventId: 'agent_start_wrapper_e2e',
    now: '2026-05-16T01:40:00.000Z',
  });
  writeRegistration(siteRoot, {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_wrapper_ref',
    provider_config: { endpoint_ref: 'capability:endpoint' },
  }, { cap_model_wrapper_ref: true });
  const started = startSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-16T01:40:01.000Z',
  });

  let providerCalls = 0;
  let providerEvidencePath = null;
  let intelligenceStageResult = null;
  const registration = {
    adapter_id: 'provider-openai',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_wrapper_ref',
  };
  const providerRegistry = makeProviderRegistry({
    openai_compatible: async () => {
      providerCalls += 1;
      return {
        text: `mocked provider response containing ${rawSecret}`,
        action_type: 'observation',
        proposed_payload: { summary: 'bounded proposal', secret: rawSecret },
      };
    },
  });

  const toDataResult = await runToDataOrchestrationStage({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    taskNumber,
    readers: {
      task_packet: async () => packet(carrierSessionId, 'task_packet', {
        task_number: taskNumber,
        task_id: taskId,
        raw_prompt_recorded: false,
      }),
      readiness_snapshot: async () => packet(carrierSessionId, 'readiness_snapshot', {
        runtime_state: 'running',
        raw_transcript_recorded: false,
      }),
      evidence_ref_summary: async () => packet(carrierSessionId, 'evidence_ref_summary', {
        evidence_ref_count: 1,
        raw_values_recorded: false,
      }),
    },
    invokeIntelligence: async ({ packets, now }) => {
      intelligenceStageResult = await runToIntelligenceOrchestrationStage({
        registration,
        readiness: operationalReadiness(siteRoot, carrierSessionId),
        packets,
        providerExecutor: async () => {
          const invocation = await executeProviderAdapter({
            siteRoot,
            carrierSessionId,
            registration,
            input: { prompt: rawPrompt, context: { task_number: taskNumber } },
            capabilityLookup: async () => ({
              granted: true,
              credential_ref: 'credential://narada/mock-wrapper-provider',
              consent_ref: 'consent://operator/mock-wrapper-provider',
              policy_ref: 'policy://narada/mock-wrapper',
            }),
            providerRegistry,
            now,
          });
          providerEvidencePath = invocation.evidence_path;
          return invocation.evidence.output;
        },
        now,
      });
      return { status: intelligenceStageResult.status, evidence_ref: providerEvidencePath };
    },
    now: '2026-05-16T01:40:02.000Z',
  });
  const toDataPath = writeStageEvidence(siteRoot, carrierSessionId, 'to-data-stage', toDataResult);
  const toIntelligencePath = writeStageEvidence(siteRoot, carrierSessionId, 'to-intelligence-stage', intelligenceStageResult);
  const handoff = emitCanonicalHandoffDraft({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    reviewer: 'narada.architect',
    taskNumber,
    taskId,
    orchestrationResult: {
      ...toDataResult,
      stage_statuses: {
        ...toDataResult.stage_statuses,
        handoff_emission: 'completed',
      },
      evidence_refs: {
        ...toDataResult.evidence_refs,
        to_data_stage: toDataPath,
        to_intelligence_stage: toIntelligencePath,
        handoff_draft: null,
      },
    },
    now: '2026-05-16T01:40:03.000Z',
  });
  const heartbeat = heartbeatSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    latestWorkPacketSummary: { task_number: taskNumber, raw_task_markdown_recorded: false },
    wrapperStageSummaries: [
      { stage: 'to_data', status: toDataResult.stage_statuses.to_data, mode: toDataResult.mode, evidence_ref: toDataPath },
      { stage: 'to_intelligence', status: intelligenceStageResult.status, mode: intelligenceStageResult.mode, evidence_ref: toIntelligencePath },
      { stage: 'handoff_emission', status: handoff.status, mode: 'inert_handoff', evidence_ref: handoff.draft_path },
    ],
    now: '2026-05-16T01:40:04.000Z',
  });
  const interrupted = interruptSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-16T01:40:05.000Z',
  });
  const closed = closeSupervisedSession({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: '2026-05-16T01:40:06.000Z',
  });

  const readiness = operationalReadiness(siteRoot, carrierSessionId);
  const reconstructed = reconstruct(siteRoot, carrierSessionId);
  const doctor = supervisorDoctor(siteRoot, carrierSessionId);
  const allEvidenceText = JSON.stringify({
    toDataResult,
    intelligenceStageResult,
    handoff: handoff.draft,
    heartbeat: heartbeat.evidence,
    interrupted: interrupted.evidence,
    closed: closed.evidence,
    readiness,
    reconstructed,
    doctor,
  });

  assert.equal(providerCalls, 1);
  assert.equal(toDataResult.stage_statuses.to_data, 'completed');
  assert.equal(intelligenceStageResult.mode, 'provider_backed');
  assert.equal(intelligenceStageResult.status, 'completed');
  assert.equal(handoff.status, 'draft_emitted');
  assert.equal(heartbeat.evidence.wrapper_stage_summaries.length, 3);
  assert.equal(interrupted.evidence.direct_effect_execution_attempted, false);
  assert.equal(closed.evidence.closeout.status, 'closed_with_supervisor_evidence');
  assert.equal(readiness.adapter_posture, 'provider_adapter_invoked');
  assert.deepEqual(readiness.residual_blockers, []);
  assert.equal(reconstructed.wrapper_evidence_refs['to-data-stage'], toDataPath);
  assert.equal(reconstructed.wrapper_evidence_refs['to-intelligence-stage'], toIntelligencePath);
  assert.equal(reconstructed.wrapper_evidence_refs['canonical-task-report-draft'], handoff.draft_path);
  assert.equal(reconstructed.wrapper_evidence_refs['supervisor-heartbeat'], heartbeat.evidence_path);
  assert.equal(doctor.runtime_state, 'stopped');
  assert.equal(doctor.blocked, false);

  for (const value of Object.values(toDataResult.mutation_flags)) assert.equal(value, false);
  for (const value of Object.values(handoff.mutation_flags)) assert.equal(value, false);
  assert.equal(started.evidence.direct_task_lifecycle_mutation, false);
  assert.equal(heartbeat.evidence.direct_task_lifecycle_mutation, false);
  assert.equal(heartbeat.evidence.direct_outbox_mutation, false);
  assert.equal(heartbeat.evidence.direct_publication_mutation, false);
  assert.equal(intelligenceStageResult.authority_decision_performed, false);
  assert.equal(intelligenceStageResult.raw_provider_output_recorded, false);
  assert.equal(readiness.reconstruction.direct_sqlite_inspection_required, false);
  assert.doesNotMatch(allEvidenceText, /sk-wrapperproofsecret123456/);
  assert.doesNotMatch(allEvidenceText, /mock wrapper prompt/);
  assert.doesNotMatch(allEvidenceText, /mocked provider response/);
});
