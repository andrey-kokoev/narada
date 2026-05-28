const OPERATOR_SURFACE_AFFORDANCE_SCHEMA = 'narada.narada_native_carrier.operator_surface_affordance_projection.v0';

function buildOperatorSurfaceAffordanceProjection({
  siteRoot,
  carrierSessionId,
  agentId,
  launchAvailable = true,
  doctorAvailable = true,
  focusAvailable = false,
} = {}) {
  return {
    schema: OPERATOR_SURFACE_AFFORDANCE_SCHEMA,
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    affordances: [
      affordanceRecord({
        name: 'launch',
        available: launchAvailable,
        command: `node tools\\narada-native-carrier\\supervisor-cli.mjs start --site-root ${siteRoot} --carrier-session-id ${carrierSessionId} --agent-id ${agentId}`,
      }),
      affordanceRecord({
        name: 'doctor',
        available: doctorAvailable,
        command: `node tools\\narada-native-carrier\\supervisor-cli.mjs doctor --site-root ${siteRoot} --carrier-session-id ${carrierSessionId}`,
      }),
      affordanceRecord({
        name: 'focus',
        available: focusAvailable,
        command: 'narada operator-surface bind-focused --as self',
      }),
    ],
    projection_only: true,
    convenience_not_authority: true,
    capability_grant_implied: false,
    task_lifecycle_authority_granted: false,
    inbox_authority_granted: false,
    outbox_authority_granted: false,
    command_execution_authority_granted: false,
    publication_authority_granted: false,
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
  };
}

function affordanceRecord({ name, available, command }) {
  return {
    name,
    available: available === true,
    command,
    command_target: canonicalTargetFor(name),
    direct_mutation_primitive: false,
    capability_grant_implied: false,
    authority_grant_implied: false,
    projection_only: true,
  };
}

function canonicalTargetFor(name) {
  if (name === 'launch') return 'narada_native_supervisor_start_surface';
  if (name === 'doctor') return 'narada_native_supervisor_doctor_surface';
  if (name === 'focus') return 'operator_surface_binding_surface';
  return 'unknown';
}

export {
  OPERATOR_SURFACE_AFFORDANCE_SCHEMA,
  buildOperatorSurfaceAffordanceProjection,
};
