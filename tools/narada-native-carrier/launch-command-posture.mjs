import { WITHHELD_AUTHORITIES } from './harness.mjs';
import { registrationReadiness } from './adapter-registration.mjs';
import { buildFixtureRuntimeHandle } from './runtime-handle.mjs';

const LAUNCH_COMMAND_POSTURE_SCHEMA = 'narada.narada_native_carrier.launch_command_posture.v0';

function buildLaunchCommandPosture({
  siteRoot,
  carrierSessionId,
  agentId,
  registration = null,
  runtimeHandle = null,
  dryRun = true,
  launchEvidenceRefs = [],
  now = new Date().toISOString(),
} = {}) {
  const readiness = registrationReadiness(
    registration,
    registration?.capability_ref ? { [registration.capability_ref]: true } : {},
  );
  const handle = runtimeHandle ?? buildFixtureRuntimeHandle({
    handleId: `runtime:fixture:${carrierSessionId}`,
    startedAt: dryRun ? null : now,
    evidenceRefs: launchEvidenceRefs,
  });
  return {
    schema: LAUNCH_COMMAND_POSTURE_SCHEMA,
    site_root: siteRoot,
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    runtime: {
      kind: handle.kind,
      handle_present: handle.handle_present,
      handle_id: handle.handle_id,
      raw_transcript_recorded: false,
      raw_secret_values_recorded: false,
    },
    startup_command: {
      name: 'agent_context_startup_sequence',
      arguments: {},
      raw_prompt_recorded: false,
      raw_secret_values_recorded: false,
    },
    capability_posture: {
      registration_status: readiness.status,
      provider_kind: readiness.provider_kind,
      capability_posture: readiness.capability_posture,
      refusal_reason: readiness.refusal?.reason ?? null,
      raw_provider_config_recorded: false,
      raw_secret_values_recorded: false,
    },
    withheld_authorities: WITHHELD_AUTHORITIES,
    launch_evidence_refs: boundedEvidenceRefs(launchEvidenceRefs),
    execution_admission_state: dryRun ? 'dry_run_planned_not_admitted' : 'launch_evidence_projected_not_authority',
    dry_run: dryRun === true,
    live_provider_invoked: false,
    provider_transport_invoked: false,
    model_output_recorded: false,
    narada_mutation_performed: false,
    direct_task_lifecycle_mutation: false,
    direct_inbox_mutation: false,
    direct_outbox_mutation: false,
    direct_publication_mutation: false,
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    recorded_at: now,
  };
}

function boundedEvidenceRefs(refs) {
  if (!Array.isArray(refs)) return [];
  return refs
    .filter((ref) => typeof ref === 'string' && ref.length > 0)
    .map((ref) => (/sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(ref) ? 'omitted_sensitive_ref' : ref.slice(0, 300)))
    .slice(0, 20);
}

export {
  LAUNCH_COMMAND_POSTURE_SCHEMA,
  buildLaunchCommandPosture,
};
