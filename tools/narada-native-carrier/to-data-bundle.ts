import { validateToDataPacket } from './to-data-packet.ts';
import {
  NO_MUTATION_FLAGS,
  readBoundedFileExcerptToDataPacket,
  readEvidenceRefSummaryToDataPacket,
  readInboxSummaryToDataPacket,
  readReadinessSnapshotToDataPacket,
  readTaskToDataPacket,
  readWorkNextToDataPacket,
} from './to-data-readers.ts';

const TO_DATA_BUNDLE_SCHEMA = 'https://narada.dev/schemas/narada-native/to-data-bundle/v0';

async function buildIntegratedToDataBundle({
  siteRoot,
  carrierSessionId,
  agentId,
  taskNumber,
  excerptFilePath,
  fileExcerptCapabilityRef,
  readTaskCommand,
  readWorkNextCommand,
  readInboxCommand,
  now = new Date().toISOString(),
}: any) {
  const packets = [
    await readTaskToDataPacket({
      siteRoot,
      carrierSessionId,
      agentId,
      taskNumber,
      runCommand: readTaskCommand,
      now,
    }),
    await readWorkNextToDataPacket({
      siteRoot,
      carrierSessionId,
      agentId,
      runCommand: readWorkNextCommand,
      noClaimPeekAvailable: Boolean(readWorkNextCommand),
      now,
    }),
    await readInboxSummaryToDataPacket({
      siteRoot,
      carrierSessionId,
      agentId,
      runCommand: readInboxCommand,
      now,
    }),
    await readReadinessSnapshotToDataPacket({
      siteRoot,
      carrierSessionId,
      agentId,
      now,
    }),
    await readEvidenceRefSummaryToDataPacket({
      siteRoot,
      carrierSessionId,
      agentId,
      now,
    }),
    await readBoundedFileExcerptToDataPacket({
      siteRoot,
      carrierSessionId,
      agentId,
      filePath: excerptFilePath,
      capabilityRef: fileExcerptCapabilityRef,
      maxBytes: 2048,
      maxLines: 80,
      now,
    }),
  ];
  return {
    schema: TO_DATA_BUNDLE_SCHEMA,
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    created_at: now,
    packets,
    read_families: packets.map((packet: any) => packet.read_family),
    validation: validateToDataBundlePackets(packets),
    residuals: [
      'capability_consent_binding_not_materialized_in_this_proof',
      'orchestration_wrapper_chapter_still_required',
    ],
    no_mutation_flags_required: { ...NO_MUTATION_FLAGS },
    direct_sqlite_requirement_recorded: packets.some((packet: any) => packet.bounded_summary?.direct_sqlite_inspection_required === true),
    raw_provider_output_recorded: packets.some((packet: any) => packet.bounded_summary?.raw_provider_output_recorded === true),
    unbounded_transcript_recorded: packets.some((packet: any) => packet.bounded_summary?.unbounded_transcript_recorded === true),
    authority_mutation_performed: packets.some((packet: any) => packet.authority_mutation_performed !== false),
  };
}

function validateToDataBundlePackets(packets: any) {
  const errors = [];
  for (const packet of packets) {
    errors.push(...validateToDataPacket(packet).map((error: any) => `${packet.read_family}:${error}`));
    if (!packet.attribution?.command) errors.push(`${packet.read_family}:missing source attribution command`);
    if (!packet.capability_ref?.ref) errors.push(`${packet.read_family}:missing capability ref`);
    if (packet.freshness?.posture !== 'bounded_snapshot') errors.push(`${packet.read_family}:missing bounded freshness`);
    if (JSON.stringify(packet.mutation_flags) !== JSON.stringify(NO_MUTATION_FLAGS)) {
      errors.push(`${packet.read_family}:mutation flags differ from no-mutation posture`);
    }
  }
  return {
    status: errors.length === 0 ? 'passed' : 'failed',
    errors,
  };
}

export {
  TO_DATA_BUNDLE_SCHEMA,
  buildIntegratedToDataBundle,
  validateToDataBundlePackets,
};
