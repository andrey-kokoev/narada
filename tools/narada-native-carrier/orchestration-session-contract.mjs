export const ORCHESTRATION_INPUT_SCHEMA = 'https://narada.dev/schemas/narada-native/orchestration-input/v0';
export const ORCHESTRATION_RESULT_SCHEMA = 'https://narada.dev/schemas/narada-native/orchestration-result/v0';

export const ORCHESTRATION_NO_MUTATION_FLAGS = Object.freeze({
  task_lifecycle_mutation: false,
  inbox_mutation: false,
  outbox_mutation: false,
  command_execution: false,
  publication_mutation: false,
  repository_mutation: false,
  credential_value_access: false,
  authority_decision_performed: false,
});

export function buildOrchestrationInputFixture(overrides = {}) {
  return deepMerge({
    schema: ORCHESTRATION_INPUT_SCHEMA,
    siteRoot: 'D:\\code\\narada',
    carrierSessionId: 'carrier_session_fixture',
    agentId: 'narada.builder',
    taskNumber: 1327,
    toDataRegistry: {
      task_packet: 'readTaskToDataPacket',
      work_next_peek: 'readWorkNextToDataPacket',
      inbox_summary: 'readInboxSummaryToDataPacket',
      readiness_snapshot: 'readReadinessSnapshotToDataPacket',
      evidence_ref_summary: 'readEvidenceRefSummaryToDataPacket',
      bounded_file_excerpt: 'readBoundedFileExcerptToDataPacket',
    },
    providerOrIntelligenceRegistry: {
      mode: 'fixture',
      provider_ref: null,
      intelligence_adapter: 'fixtureAdapter',
    },
    capabilityLookup: {
      kind: 'projected_capability_lookup',
      raw_secret_values_recorded: false,
      projected_capabilities_are_not_grants: true,
    },
    clock: {
      now: '2026-05-16T00:00:00.000Z',
      source: 'injected_clock',
    },
  }, overrides);
}

export function buildOrchestrationResultFixture(mode, overrides = {}) {
  if (!['success', 'refusal', 'fixture_fallback', 'provider_backed'].includes(mode)) {
    throw new Error(`unsupported_orchestration_result_mode:${mode}`);
  }
  return deepMerge({
    schema: ORCHESTRATION_RESULT_SCHEMA,
    mode,
    status: mode === 'refusal' ? 'refused' : 'completed_no_effect',
    stage_statuses: {
      to_data: mode === 'refusal' ? 'skipped' : 'completed',
      to_intelligence: mode === 'refusal' ? 'skipped' : mode === 'fixture_fallback' ? 'fixture_fallback' : 'completed',
      handoff_emission: mode === 'refusal' ? 'skipped' : 'inert_handoff_prepared',
    },
    evidence_refs: {
      to_data_bundle: mode === 'refusal' ? null : 'evidence:to-data-bundle',
      intelligence_invocation: mode === 'refusal' ? null : `evidence:${mode}:intelligence`,
      handoff_draft: mode === 'refusal' ? null : 'evidence:handoff-draft',
    },
    refusal_reason: mode === 'refusal' ? 'missing_required_capability_projection' : null,
    fallback_reason: mode === 'fixture_fallback' ? 'provider_capability_missing_or_ungranted' : null,
    intelligence_authority_posture: {
      intelligence_output_is_inert: true,
      authority_owner: 'narada_control_plane',
      decision_performed: false,
    },
    mutation_flags: { ...ORCHESTRATION_NO_MUTATION_FLAGS },
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
  }, overrides);
}

export function validateOrchestrationInput(input) {
  const errors = [];
  if (!isRecord(input)) return ['input must be an object'];
  for (const field of [
    'schema',
    'siteRoot',
    'carrierSessionId',
    'agentId',
    'taskNumber',
    'toDataRegistry',
    'providerOrIntelligenceRegistry',
    'capabilityLookup',
    'clock',
  ]) {
    if (!(field in input)) errors.push(`${field} is required`);
  }
  if (input.schema !== ORCHESTRATION_INPUT_SCHEMA) errors.push('schema must be orchestration input v0');
  if (input.capabilityLookup?.raw_secret_values_recorded !== false) {
    errors.push('capabilityLookup.raw_secret_values_recorded must be false');
  }
  if (input.capabilityLookup?.projected_capabilities_are_not_grants !== true) {
    errors.push('capabilityLookup.projected_capabilities_are_not_grants must be true');
  }
  return errors;
}

export function validateOrchestrationResult(result) {
  const errors = [];
  if (!isRecord(result)) return ['result must be an object'];
  for (const field of [
    'schema',
    'mode',
    'status',
    'stage_statuses',
    'evidence_refs',
    'refusal_reason',
    'fallback_reason',
    'intelligence_authority_posture',
    'mutation_flags',
  ]) {
    if (!(field in result)) errors.push(`${field} is required`);
  }
  if (result.schema !== ORCHESTRATION_RESULT_SCHEMA) errors.push('schema must be orchestration result v0');
  if (JSON.stringify(result.mutation_flags) !== JSON.stringify(ORCHESTRATION_NO_MUTATION_FLAGS)) {
    errors.push('mutation_flags must preserve no-authority posture');
  }
  if (result.intelligence_authority_posture?.intelligence_output_is_inert !== true) {
    errors.push('intelligence output must be inert');
  }
  if (result.intelligence_authority_posture?.decision_performed !== false) {
    errors.push('intelligence must not perform authority decision');
  }
  for (const field of ['raw_prompt_recorded', 'raw_provider_output_recorded', 'raw_transcript_recorded', 'raw_secret_values_recorded']) {
    if (result[field] !== false) errors.push(`${field} must be false`);
  }
  return errors;
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function deepMerge(base, override) {
  const output = { ...base };
  for (const [key, value] of Object.entries(override)) {
    output[key] = isRecord(value) && isRecord(output[key])
      ? deepMerge(output[key], value)
      : value;
  }
  return output;
}
