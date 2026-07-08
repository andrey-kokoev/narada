import { lifecycleBindingFromArgs } from './lifecycle-hooks.mjs';

function argValue(args = [], name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  return typeof value === 'string' && value.length > 0 && !value.startsWith('--') ? value : null;
}

function authorityModeFromArgs(args = [], env = process.env) {
  const value = argValue(args, '--authority') ?? env.NARADA_AUTHORITY_MODE ?? env.NARADA_DELEGATED_AUTHORITY_MODE ?? null;
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return ['read', 'write', 'command', 'mutation', 'mutating'].includes(normalized) ? normalized : null;
}

function delegatedAuthorityRef({ args = [], env = process.env, binding } = {}) {
  const explicit = env.NARADA_AUTHORITY_REF ?? env.NARADA_DELEGATED_AUTHORITY_REF ?? null;
  if (explicit) return explicit;
  const authorityMode = authorityModeFromArgs(args, env);
  if (!authorityMode || authorityMode === 'read') return null;
  return `nars-delegated:${authorityMode}:${binding.session_id}`;
}

export function createDelegatedAuthorityHandoff({ args = [], env = process.env, generatedAt = new Date().toISOString() } = {}) {
  const binding = lifecycleBindingFromArgs(args, env);
  const authorityMode = authorityModeFromArgs(args, env);
  return {
    schema: 'narada.nars.delegated_authority_handoff.v1',
    crossing_regime: 'nars_runtime_server_to_carrier_substrate',
    source: {
      package: '@narada2/agent-runtime-server',
      entrypoint: 'narada-agent-runtime-server',
    },
    target: {
      package: '@narada2/carrier-runtime',
      mode: 'in-process',
    },
    generated_at: generatedAt,
    agent_id: binding.agent_id,
    agent_identity_ref: binding.agent_identity_ref,
    session_id: binding.session_id,
    authority_ref: delegatedAuthorityRef({ args, env, binding }),
    authority_mode: authorityMode,
    evidence: {
      site_root: binding.metadata.site_root ?? null,
      agent_start_event_id: binding.metadata.agent_start_event_id ?? null,
      codex_admission_id: env.NARADA_CODEX_ADMISSION_ID ?? null,
      authority_source: (env.NARADA_AUTHORITY_REF ?? env.NARADA_DELEGATED_AUTHORITY_REF) ? 'env_ref' : authorityMode ? 'argv_authority' : null,
    },
  };
}

