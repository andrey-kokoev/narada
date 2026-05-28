import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCarrierActionPacket } from './carrier-action-packet.mjs';

const COMMAND_INTENT_HANDOFF_PAYLOAD_SCHEMA = 'narada.narada_native_carrier.command_intent_handoff_payload.v0';
const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|token)/i;
const SHELL_METACHAR_PATTERN = /[;&|`$<>]/;

function commandIntentPayloadPath(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId, 'command-intent-handoff-payload.json');
}

function emitCommandIntentHandoffPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  argv = [],
  cwd = null,
  envPolicy = {},
  sideEffectClass = 'diagnostic',
  timeoutMs = 30000,
  outputAdmissionProfile = 'bounded_summary',
  rationale = null,
  now = new Date().toISOString(),
} = {}) {
  const payloadPath = commandIntentPayloadPath(siteRoot, carrierSessionId);
  const safeArgv = boundedArgv(argv);
  const payload = {
    schema: COMMAND_INTENT_HANDOFF_PAYLOAD_SCHEMA,
    status: 'inert_command_intent_draft',
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    argv: safeArgv.argv,
    argv_omissions: safeArgv.omissions,
    cwd: boundedText(cwd),
    env_policy: boundedEnvPolicy(envPolicy),
    side_effect_class: boundedText(sideEffectClass),
    timeout_ms: Number.isFinite(Number(timeoutMs)) ? Math.max(0, Math.min(Number(timeoutMs), 3_600_000)) : 30000,
    output_admission_profile: boundedText(outputAdmissionProfile),
    rationale: boundedText(rationale),
    suggested_command_intent_surface: 'narada command intent submit --file <payload>',
    process_spawned: false,
    shell_invoked: false,
    direct_mutation_performed: false,
    raw_shell_string_recorded: false,
    raw_env_values_recorded: false,
    raw_stdout_recorded: false,
    raw_stderr_recorded: false,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
    recorded_at: now,
  };
  mkdirSync(dirname(payloadPath), { recursive: true });
  writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const packet = buildCarrierActionPacket({
    carrierSessionId,
    actionFamily: 'command_intent',
    summary: `Command intent draft for ${payload.argv[0] ?? 'unspecified command'}`,
    payloadSummary: {
      argv_count: payload.argv.length,
      cwd_present: Boolean(payload.cwd),
      side_effect_class: payload.side_effect_class,
      output_admission_profile: payload.output_admission_profile,
    },
    payloadRef: payloadPath,
  });
  return {
    schema: 'narada.narada_native_carrier.command_intent_handoff_result.v0',
    status: 'packet_emitted',
    packet,
    payload,
    payload_ref: payloadPath,
    process_spawned: false,
    shell_invoked: false,
    direct_mutation_performed: false,
  };
}

function boundedArgv(argv) {
  if (!Array.isArray(argv)) return { argv: [], omissions: ['argv_not_array'] };
  const omissions = [];
  const bounded = [];
  for (const arg of argv.slice(0, 50)) {
    if (typeof arg !== 'string') {
      omissions.push('non_string_arg');
      continue;
    }
    if (SECRET_KEY_PATTERN.test(arg) || SHELL_METACHAR_PATTERN.test(arg)) {
      omissions.push('unsafe_or_secret_like_arg');
      continue;
    }
    bounded.push(arg.slice(0, 200));
  }
  return { argv: bounded, omissions };
}

function boundedEnvPolicy(envPolicy) {
  const allowed_keys = Array.isArray(envPolicy?.allowed_keys)
    ? envPolicy.allowed_keys.filter((key) => typeof key === 'string' && !SECRET_KEY_PATTERN.test(key)).slice(0, 50)
    : [];
  return {
    mode: typeof envPolicy?.mode === 'string' ? envPolicy.mode : 'deny_all',
    allowed_keys,
    secret_keys_omitted: true,
    values_omitted: true,
  };
}

function boundedText(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (/sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(value)) return 'omitted_sensitive_value';
  return value.slice(0, 300);
}

export {
  COMMAND_INTENT_HANDOFF_PAYLOAD_SCHEMA,
  commandIntentPayloadPath,
  emitCommandIntentHandoffPacket,
};
