import { registrationReadiness } from './adapter-registration.mjs';
import { resolveProviderCapabilityProjection } from './capability-projection.mjs';
import { buildFixtureRuntimeHandle, buildMissingRuntimeHandle, validateRuntimeHandle } from './runtime-handle.mjs';

const LIVE_START_SCHEMA = 'narada.narada_native_carrier.live_start_evidence.v0';

const NO_START_MUTATION_FLAGS = Object.freeze({
  provider_transport_invoked: false,
  task_lifecycle_mutation: false,
  inbox_mutation: false,
  outbox_mutation: false,
  command_execution: false,
  publication_mutation: false,
  repository_mutation: false,
  credential_value_access: false,
});

async function buildLiveStartEvidence({
  siteRoot,
  carrierSessionId,
  agentId,
  registration = null,
  capabilityLookup = null,
  runtimeHandle = null,
  requireRegistration = false,
  requiredLocalExecutable = null,
  executableAvailable = true,
  now = new Date().toISOString(),
}) {
  const readiness = registrationReadiness(
    registration,
    registration?.capability_ref ? { [registration.capability_ref]: true } : {},
  );
  const handle = runtimeHandle ?? buildFixtureRuntimeHandle({
    handleId: `runtime:fixture:${carrierSessionId}`,
    startedAt: now,
    evidenceRefs: [`session:${carrierSessionId}`],
  });
  const blockedReasons = [];
  const reachability = {
    to_data: {
      status: 'reachable',
      checked_at: now,
      values_omitted: true,
    },
    to_intelligence: {
      status: readiness.provider_kind === 'fixture' ? 'fixture_only' : 'checking_capability_projection',
      checked_at: now,
      values_omitted: true,
    },
  };
  let capabilityProjection = null;

  if (validateRuntimeHandle(handle).length > 0 || handle.kind === 'missing') {
    blockedReasons.push('blocked_runtime_unavailable');
    reachability.to_data.status = 'blocked_runtime_unavailable';
    reachability.to_intelligence.status = 'blocked_runtime_unavailable';
  }

  if (requireRegistration && !registration) {
    blockedReasons.push('blocked_missing_registration');
    reachability.to_intelligence.status = 'blocked_missing_registration';
  }

  if (readiness.status === 'refused') {
    blockedReasons.push(`blocked_${readiness.capability_posture}`);
    reachability.to_intelligence.status = `blocked_${readiness.capability_posture}`;
  }

  if (registration?.provider_kind && registration.provider_kind !== 'fixture' && readiness.status !== 'refused') {
    const lookup = await resolveProviderCapabilityProjection({
      registration,
      capabilityLookup,
      now,
    });
    capabilityProjection = lookup.projection;
    if (lookup.status === 'refused') {
      blockedReasons.push(blockedReasonForCapability(lookup.refusal_reason));
      reachability.to_intelligence.status = blockedReasonForCapability(lookup.refusal_reason);
    } else {
      reachability.to_intelligence.status = 'provider_configured_not_invoked';
    }
  }

  if (requiredLocalExecutable && executableAvailable !== true) {
    blockedReasons.push('blocked_runtime_executable_missing');
    reachability.to_data.status = 'blocked_runtime_executable_missing';
    reachability.to_intelligence.status = 'blocked_runtime_executable_missing';
  }

  const status = blockedReasons.length > 0 ? 'blocked' : 'started';
  return {
    schema: LIVE_START_SCHEMA,
    site_root: siteRoot,
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    status,
    blocked_reasons: [...new Set(blockedReasons)],
    runtime_handle: handle,
    registration_readiness: boundedRegistrationReadiness(readiness),
    capability_projection: capabilityProjection,
    reachability,
    required_local_executable: requiredLocalExecutable ? {
      command: requiredLocalExecutable,
      present: executableAvailable === true,
      raw_path_values_recorded: false,
    } : null,
    provider_transport_invoked: false,
    narada_mutation_performed: false,
    mutation_flags: { ...NO_START_MUTATION_FLAGS },
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    recorded_at: now,
  };
}

function blockedReasonForCapability(reason) {
  if (reason === 'missing_consent_record' || reason === 'missing_capability_ref') return 'blocked_missing_capability';
  if (reason === 'revoked_capability') return 'blocked_revoked_grant';
  if (reason === 'stale_grant') return 'blocked_stale_grant';
  if (reason === 'secret_bearing_capability_material') return 'blocked_secret_bearing_capability_material';
  return `blocked_${reason ?? 'capability_unavailable'}`;
}

function boundedRegistrationReadiness(readiness) {
  return {
    schema: readiness.schema,
    status: readiness.status,
    provider_kind: readiness.provider_kind,
    capability_posture: readiness.capability_posture,
    refusal_reason: readiness.refusal?.reason ?? null,
    raw_provider_config_recorded: false,
    raw_secret_values_recorded: false,
  };
}

export {
  LIVE_START_SCHEMA,
  NO_START_MUTATION_FLAGS,
  buildLiveStartEvidence,
  buildMissingRuntimeHandle,
};
