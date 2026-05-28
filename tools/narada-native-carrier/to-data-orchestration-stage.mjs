import {
  ORCHESTRATION_NO_MUTATION_FLAGS,
  buildOrchestrationResultFixture,
} from './orchestration-session-contract.mjs';
import {
  readEvidenceRefSummaryToDataPacket,
  readReadinessSnapshotToDataPacket,
  readTaskToDataPacket,
} from './to-data-readers.mjs';

const REQUIRED_TO_DATA_FAMILIES = Object.freeze([
  'task_packet',
  'readiness_snapshot',
  'evidence_ref_summary',
]);

async function runToDataOrchestrationStage({
  siteRoot,
  carrierSessionId,
  agentId,
  taskNumber,
  readers = {},
  invokeIntelligence = null,
  now = new Date().toISOString(),
}) {
  const packets = [];
  const readerPlan = [
    ['task_packet', readers.task_packet ?? ((args) => readTaskToDataPacket({ ...args, taskNumber }))],
    ['readiness_snapshot', readers.readiness_snapshot ?? readReadinessSnapshotToDataPacket],
    ['evidence_ref_summary', readers.evidence_ref_summary ?? readEvidenceRefSummaryToDataPacket],
  ];
  for (const [family, reader] of readerPlan) {
    const packet = await reader({ siteRoot, carrierSessionId, agentId, taskNumber, now });
    packets.push(packet);
    if (!isUsableRequiredPacket(packet, family)) {
      return refusalResult({
        siteRoot,
        carrierSessionId,
        agentId,
        now,
        packets,
        missingFamily: family,
        reason: packet?.read_status === 'refused' ? 'refused_required_data_packet' : 'refused_missing_data_packet',
      });
    }
  }
  const intelligenceResult = invokeIntelligence
    ? await invokeIntelligence({ packets, siteRoot, carrierSessionId, agentId, taskNumber, now })
    : { status: 'skipped_not_implemented', evidence_ref: null };
  return {
    ...buildOrchestrationResultFixture('success', {
      stage_statuses: {
        to_data: 'completed',
        to_intelligence: intelligenceResult.status ?? 'completed',
        handoff_emission: 'not_emitted_by_to_data_stage',
      },
      evidence_refs: {
        to_data_bundle: `memory:${carrierSessionId}:required-to-data`,
        intelligence_invocation: intelligenceResult.evidence_ref ?? null,
        handoff_draft: null,
      },
    }),
    required_packets: packets,
    required_read_families: [...REQUIRED_TO_DATA_FAMILIES],
    mutation_flags: { ...ORCHESTRATION_NO_MUTATION_FLAGS },
  };
}

function refusalResult({ carrierSessionId, agentId, now, packets, missingFamily, reason }) {
  return {
    ...buildOrchestrationResultFixture('refusal', {
      status: reason,
      stage_statuses: {
        to_data: reason,
        to_intelligence: 'not_invoked',
        handoff_emission: 'bounded_refusal_emitted',
      },
      evidence_refs: {
        to_data_bundle: `memory:${carrierSessionId}:partial-required-to-data`,
        intelligence_invocation: null,
        handoff_draft: `memory:${carrierSessionId}:bounded-refusal-handoff`,
      },
      refusal_reason: reason,
    }),
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    recorded_at: now,
    missing_or_refused_family: missingFamily,
    required_packets: packets,
    bounded_refusal_handoff: {
      schema: 'narada.narada_native_carrier.bounded_refusal_handoff.v0',
      status: reason,
      missing_or_refused_family: missingFamily,
      raw_values_recorded: false,
      mutation_flags: { ...ORCHESTRATION_NO_MUTATION_FLAGS },
    },
    closeout: {
      schema: 'narada.narada_native_carrier.to_data_stage_closeout.v0',
      status: 'closed_without_intelligence_invocation',
      direct_effect_execution_attempted: false,
      mutation_flags: { ...ORCHESTRATION_NO_MUTATION_FLAGS },
    },
  };
}

function isUsableRequiredPacket(packet, family) {
  return Boolean(packet)
    && packet.read_family === family
    && packet.read_status !== 'refused'
    && packet.raw_values_recorded === false
    && packet.authority_mutation_performed === false;
}

export {
  REQUIRED_TO_DATA_FAMILIES,
  runToDataOrchestrationStage,
};
