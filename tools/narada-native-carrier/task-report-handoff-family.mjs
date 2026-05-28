import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCarrierActionPacket } from './carrier-action-packet.mjs';

const TASK_REPORT_HANDOFF_PAYLOAD_SCHEMA = 'narada.narada_native_carrier.task_report_handoff_payload.v0';

function taskReportPayloadPath(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId, 'task-report-handoff-payload.json');
}

function emitTaskReportHandoffPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  reviewer = '<reviewer>',
  taskNumber,
  taskId = null,
  reportSummary,
  changedFileRefs = [],
  verificationRefs = [],
  residuals = [],
  lifecycleStateBefore = null,
  now = new Date().toISOString(),
} = {}) {
  const payloadPath = taskReportPayloadPath(siteRoot, carrierSessionId);
  const payload = {
    schema: TASK_REPORT_HANDOFF_PAYLOAD_SCHEMA,
    status: 'inert_task_report_draft',
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    task_number: taskNumber,
    task_id: taskId,
    report_summary: boundedText(reportSummary),
    changed_file_refs: boundedStringArray(changedFileRefs),
    verification_refs: boundedStringArray(verificationRefs),
    residuals: boundedResiduals(residuals),
    suggested_admission_command: `narada task report ${taskNumber} --agent ${agentId} --reviewer ${reviewer} --report-file ${payloadPath}`,
    lifecycle_state_before: lifecycleStateBefore,
    lifecycle_state_after: lifecycleStateBefore,
    lifecycle_state_changed: false,
    direct_task_lifecycle_mutation: false,
    direct_inbox_mutation: false,
    direct_outbox_mutation: false,
    direct_publication_mutation: false,
    repository_mutation: false,
    raw_task_markdown_recorded: false,
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    recorded_at: now,
  };
  mkdirSync(dirname(payloadPath), { recursive: true });
  writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const packet = buildCarrierActionPacket({
    carrierSessionId,
    actionFamily: 'task_report',
    summary: `Task report handoff draft for task ${taskNumber}`,
    payloadSummary: {
      task_number: taskNumber,
      task_id: taskId,
      changed_file_ref_count: payload.changed_file_refs.length,
      verification_ref_count: payload.verification_refs.length,
      residual_count: payload.residuals.length,
    },
    payloadRef: payloadPath,
  });
  return {
    schema: 'narada.narada_native_carrier.task_report_handoff_result.v0',
    status: 'packet_emitted',
    packet,
    payload,
    payload_ref: payloadPath,
    lifecycle_state_before: lifecycleStateBefore,
    lifecycle_state_after: lifecycleStateBefore,
    lifecycle_state_changed: false,
    direct_task_lifecycle_mutation: false,
    raw_secret_values_recorded: false,
  };
}

function boundedText(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (/sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(value)) return 'summary_omitted_sensitive_value';
  return value.slice(0, 500);
}

function boundedStringArray(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === 'string' && value.length > 0).slice(0, 50)
    : [];
}

function boundedResiduals(residuals) {
  return Array.isArray(residuals)
    ? residuals.slice(0, 50).map((residual) => ({
        kind: typeof residual?.kind === 'string' ? residual.kind : 'unspecified',
        summary: boundedText(residual?.summary) ?? null,
        evidence_ref: typeof residual?.evidence_ref === 'string' ? residual.evidence_ref : null,
        values_omitted: true,
      }))
    : [];
}

export {
  TASK_REPORT_HANDOFF_PAYLOAD_SCHEMA,
  emitTaskReportHandoffPacket,
  taskReportPayloadPath,
};
