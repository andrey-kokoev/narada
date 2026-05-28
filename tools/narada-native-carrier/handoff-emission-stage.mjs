import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const HANDOFF_NO_MUTATION_FLAGS = Object.freeze({
  task_report_executed: false,
  task_close_executed: false,
  inbox_mutation_executed: false,
  outbox_mutation_executed: false,
  command_execution_performed: false,
  publication_mutation_executed: false,
  repository_mutation_executed: false,
});

function handoffDraftPath(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId, 'canonical-task-report-draft.json');
}

function emitCanonicalHandoffDraft({
  siteRoot,
  carrierSessionId,
  agentId,
  reviewer = '<reviewer>',
  taskNumber,
  taskId,
  orchestrationResult,
  lifecycleStateBefore = null,
  now = new Date().toISOString(),
}) {
  const path = handoffDraftPath(siteRoot, carrierSessionId);
  const draft = {
    schema: 'narada.narada_native_carrier.canonical_handoff_draft.v0',
    status: 'inert_draft_requires_canonical_admission',
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    task_number: taskNumber,
    task_id: taskId ?? null,
    summary: `Narada-native carrier prepared an inert handoff draft for task ${taskNumber}.`,
    changed_files: [],
    verification: [],
    known_residuals: [],
    orchestration_summary: summarizeOrchestration(orchestrationResult),
    suggested_admission_command: `narada task report ${taskNumber} --agent ${agentId} --reviewer ${reviewer} --report-file ${path}`,
    report_file_path: path,
    lifecycle_state_before: lifecycleStateBefore,
    lifecycle_state_after: lifecycleStateBefore,
    lifecycle_state_changed: false,
    mutation_flags: { ...HANDOFF_NO_MUTATION_FLAGS },
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
    recorded_at: now,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  return {
    schema: 'narada.narada_native_carrier.handoff_emission_result.v0',
    status: 'draft_emitted',
    draft_path: path,
    draft,
    mutation_flags: { ...HANDOFF_NO_MUTATION_FLAGS },
    lifecycle_state_changed: false,
  };
}

function summarizeOrchestration(result) {
  return {
    mode: result?.mode ?? null,
    status: result?.status ?? null,
    stage_statuses: result?.stage_statuses ?? null,
    evidence_ref_keys: result?.evidence_refs ? Object.keys(result.evidence_refs).sort() : [],
    values_omitted: true,
  };
}

export {
  HANDOFF_NO_MUTATION_FLAGS,
  emitCanonicalHandoffDraft,
  handoffDraftPath,
};
