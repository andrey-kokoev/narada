export const LIVE_EVIDENCE_SCHEMA = 'narada.agent.live_evidence.v2';

/**
 * A live result must identify the boundary it actually exercised.  The
 * runtime-server owns this vocabulary because it is the launch/binding
 * authority; client packages may record evidence but may not invent a fourth
 * posture name.
 */
export const LIVE_EVIDENCE_POSTURES = Object.freeze({
  FIXTURE_BOUNDARY: 'fixture-boundary',
  PARTIAL_PRODUCTION_LAUNCH: 'partial-production-launch',
  PRODUCTION_LAUNCH: 'production-launch',
});

function fail(message, details = {}) {
  const error = new Error(`live_evidence_contract:${message}`);
  error.code = 'live_evidence_contract_invalid';
  error.details = details;
  throw error;
}

function nonEmpty(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field}_required`);
  return value.trim();
}

function arrayField(value, field) {
  if (!Array.isArray(value)) fail(`${field}_must_be_array`);
  return value;
}

function assertProductionBinding(binding) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    fail('production_launch_binding_evidence_required');
  }
  if (binding.status !== 'ready') fail('production_launch_binding_not_ready', { status: binding.status });
  if (binding.schema !== 'narada.operator_projection_launch_binding.v1') {
    fail('production_launch_binding_schema_invalid', { schema: binding.schema });
  }
  nonEmpty(binding.path, 'production_launch_binding_path');
  nonEmpty(binding.site_root, 'production_launch_binding_site_root');
  nonEmpty(binding.workspace_root, 'production_launch_binding_workspace_root');
  nonEmpty(binding.agent, 'production_launch_binding_agent');
  nonEmpty(binding.runtime_host_kind, 'production_launch_binding_runtime_host');
  nonEmpty(binding.nars_session_id ?? binding.runtime_session_id ?? binding.carrier_session_id ?? binding.session_id, 'production_launch_binding_session');
  if (binding.operator_surface_kind !== 'agent-pi-tui') {
    fail('production_launch_binding_surface_invalid', { operator_surface_kind: binding.operator_surface_kind });
  }
  return binding;
}

export function assertLiveEvidenceContract(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) fail('record_required');
  if (evidence.schema !== LIVE_EVIDENCE_SCHEMA) fail('schema_invalid', { schema: evidence.schema });
  nonEmpty(evidence.scenario, 'scenario');
  nonEmpty(evidence.input_boundary, 'input_boundary');
  const postureValues = Object.values(LIVE_EVIDENCE_POSTURES);
  if (!postureValues.includes(evidence.posture)) fail('posture_invalid', { posture: evidence.posture, admitted: postureValues });
  if (!['passed', 'failed', 'skipped'].includes(evidence.status)) fail('status_invalid');
  arrayField(evidence.runtime_pids, 'runtime_pids');
  arrayField(evidence.client_pids, 'client_pids');
  arrayField(evidence.external_oracles, 'external_oracles');
  arrayField(evidence.negative_assertions, 'negative_assertions');
  arrayField(evidence.session_ids, 'session_ids');
  if (typeof evidence.production_launch_binding !== 'boolean') fail('production_launch_binding_boolean_required');
  if (typeof evidence.same_session_after_fault !== 'boolean') fail('same_session_after_fault_boolean_required');
  nonEmpty(evidence.durable_oracle, 'durable_oracle');

  const isFixture = evidence.posture === LIVE_EVIDENCE_POSTURES.FIXTURE_BOUNDARY;
  if (isFixture && evidence.production_launch_binding) fail('fixture_claims_production_binding');
  if (!isFixture) {
    if (!evidence.production_launch_binding) fail('production_posture_requires_binding');
    if (!evidence.external_oracles.includes('production-launch-binding')) fail('production_binding_oracle_missing');
    assertProductionBinding(evidence.production_launch_binding_evidence);
    if (evidence.runtime_pids.length < 1) fail('production_runtime_pid_missing');
    if (evidence.posture === LIVE_EVIDENCE_POSTURES.PRODUCTION_LAUNCH
      && evidence.input_boundary !== 'four-surface-real-process') {
      fail('full_production_posture_requires_four_surface_boundary');
    }
  } else if (evidence.production_launch_binding_evidence != null) {
    fail('fixture_must_not_have_production_binding_evidence');
  }
  return evidence;
}

