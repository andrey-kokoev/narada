const REPAIR_GUIDANCE_SCHEMA = 'narada.narada_native_carrier.repair_guidance.v0';

function buildRepairGuidance({
  carrierSessionId,
  blockedState,
  now = new Date().toISOString(),
} = {}) {
  const state = normalizeBlockedState(blockedState);
  const safeCarrierSessionId = boundedText(carrierSessionId);
  const entry = guidanceFor(state, safeCarrierSessionId);
  return {
    schema: REPAIR_GUIDANCE_SCHEMA,
    carrier_session_id: safeCarrierSessionId,
    blocked_state: state,
    guidance: entry.guidance,
    next_diagnostic_commands: entry.commands,
    automatic_repair_mutation: false,
    repair_performed: false,
    capability_grant_performed: false,
    credential_access_performed: false,
    provider_transport_invoked: false,
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    values_omitted: true,
    recorded_at: now,
  };
}

function normalizeBlockedState(state) {
  const allowed = [
    'missing_registration',
    'missing_consent',
    'revoked_grant',
    'missing_runtime',
    'stale_heartbeat',
    'unavailable_provider_transport',
  ];
  return allowed.includes(state) ? state : 'unknown_blocked_state';
}

function guidanceFor(state, carrierSessionId) {
  const doctor = `node tools\\narada-native-carrier\\supervisor-cli.mjs doctor --site-root <site-root> --carrier-session-id ${carrierSessionId}`;
  const guidance = {
    missing_registration: 'Register or confirm an adapter registration through the governed carrier registration surface.',
    missing_consent: 'Admit the required capability consent through the canonical capability consent registry.',
    revoked_grant: 'Request a fresh capability grant; do not reuse revoked grant evidence.',
    missing_runtime: 'Relaunch or inspect the carrier runtime handle before attempting live execution.',
    stale_heartbeat: 'Run a fresh heartbeat or inspect the runtime handle; do not treat stale heartbeat as lifecycle truth.',
    unavailable_provider_transport: 'Inspect provider transport availability and capability posture without invoking model transport.',
    unknown_blocked_state: 'Inspect bounded doctor output and route the blocker through governed handoff surfaces.',
  }[state];
  return {
    guidance,
    commands: [
      doctor,
      'node tools\\narada-native-carrier\\supervisor-cli.mjs inspect --site-root <site-root> --carrier-session-id <carrier-session-id>',
    ],
  };
}

function boundedText(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (/sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(value)) return 'omitted_sensitive_value';
  return value.slice(0, 300);
}

export {
  REPAIR_GUIDANCE_SCHEMA,
  buildRepairGuidance,
};
