import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import {
  providerRuntimeEnvironment,
  redactProviderRuntimeBinding,
  resolveProviderRuntimeBinding,
} from '@narada2/carrier-provider-contract';
import {
  NARADA_AGENT_RUNTIME_SERVER_KIND,
  operatorSurfaceKindsForRuntimeHost,
} from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';

export const PROVIDER_SECRET_STORE_MODE_ENV = 'NARADA_PROVIDER_SECRET_STORE';
export const PROVIDER_ENV_FALLBACK_MODE_ENV = 'NARADA_PROVIDER_ENV_FALLBACK';
export const SECRET_MANAGEMENT_LOOKUP_TIMEOUT_MS = 5000;
const NARS_OPERATOR_SURFACE_KINDS = operatorSurfaceKindsForRuntimeHost(NARADA_AGENT_RUNTIME_SERVER_KIND);
export const SECRET_MANAGEMENT_LOOKUP_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$name = [Environment]::GetEnvironmentVariable('NARADA_SECRET_LOOKUP_NAME', 'Process')
if ([string]::IsNullOrWhiteSpace($name)) { exit 3 }
if (-not (Get-Module -ListAvailable -Name Microsoft.PowerShell.SecretManagement)) { exit 10 }
Import-Module Microsoft.PowerShell.SecretManagement -ErrorAction Stop
$secret = Get-Secret -Name $name -AsPlainText -ErrorAction SilentlyContinue
if ($null -eq $secret -or [string]::IsNullOrWhiteSpace([string]$secret)) { exit 2 }
[Console]::Out.Write([string]$secret)
`;

export function providerCredentialRequirement(provider, metadata) {
  const requirement = metadata.credential_requirement ?? null;
  if (requirement?.kind) {
    return {
      kind: requirement.kind,
      secret_ref: requirement.secret_ref ?? providerCredentialSecretRef(provider, metadata),
      env_names: [...(requirement.env_names ?? metadata.credential_env_names ?? [])].filter(Boolean),
    };
  }
  const credentialEnvNames = [...(metadata.credential_env_names ?? [])].filter(Boolean);
  if (credentialEnvNames.length === 0) {
    return { kind: 'none', secret_ref: null, env_names: [] };
  }
  return {
    kind: 'api_key_secret',
    secret_ref: providerCredentialSecretRef(provider, metadata),
    env_names: credentialEnvNames,
  };
}

export function providerEnvironmentFallbackEnabled(processEnv = process.env) {
  const mode = String(processEnv[PROVIDER_ENV_FALLBACK_MODE_ENV] ?? '').trim().toLowerCase();
  return ['1', 'true', 'on', 'enabled'].includes(mode);
}

export function redactProviderCredentialRequirement(requirement) {
  if (!requirement) return null;
  return {
    kind: requirement.kind,
    secret_ref: requirement.secret_ref ?? null,
    env_names: [...(requirement.env_names ?? [])],
  };
}

export function providerCredentialSecretRef(provider, metadata) {
  if (metadata.credential_secret_ref) return metadata.credential_secret_ref;
  if ((metadata.credential_env_names ?? []).length === 0) return null;
  return `narada/provider/${provider}/api-key`;
}

export function providerSecretStoreEnabled(processEnv = process.env) {
  const mode = String(processEnv[PROVIDER_SECRET_STORE_MODE_ENV] ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'disabled', 'none'].includes(mode);
}

export function providerCredentialFromSecretStore(secretRef, {
  processEnv = process.env,
  lookupScript = SECRET_MANAGEMENT_LOOKUP_SCRIPT,
  timeoutMs = SECRET_MANAGEMENT_LOOKUP_TIMEOUT_MS,
} = {}) {
  if (!secretRef || !providerSecretStoreEnabled(processEnv)) return null;
  const result = runGovernedCommandSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', lookupScript], {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: {
      ...processEnv,
      NARADA_SECRET_LOOKUP_NAME: secretRef,
    },
  });
  if (result.error || result.status !== 0) return null;
  const value = String(result.stdout ?? '').trim();
  return value || null;
}

export function firstEnvironmentValue(names = [], processEnv = process.env) {
  for (const name of names) {
    if (processEnv[name]) return processEnv[name];
  }
  return null;
}

export function firstEnvironmentValueWithName(names = [], processEnv = process.env) {
  for (const name of names) {
    const value = processEnv[name];
    if (value) return { name, value };
  }
  return null;
}

export function resolveProviderCredential(provider, metadata, {
  processEnv = process.env,
  codexSubscriptionPreflight,
} = {}) {
  const credentialRequirement = providerCredentialRequirement(provider, metadata);
  const credentialEnvNames = [...(credentialRequirement.env_names ?? [])].filter(Boolean);
  const primaryCredentialEnv = credentialEnvNames[0] ?? null;
  const secretRef = credentialRequirement.secret_ref ?? null;
  if (credentialRequirement.kind !== 'api_key_secret') {
    if (credentialRequirement.kind === 'local_codex_subscription') {
      const preflight = codexSubscriptionPreflight(provider);
      return {
        credential_required: true,
        credential_present: preflight.ok,
        credential_source: preflight.status,
        credential_requirement_kind: credentialRequirement.kind,
        credential_requirement: redactProviderCredentialRequirement(credentialRequirement),
        credential_secret_ref: null,
        primary_credential_env: null,
        credential_env_names: [],
        source_env: null,
        value: '',
        preflight,
      };
    }
    return {
      credential_required: false,
      credential_present: false,
      credential_source: credentialRequirement.kind === 'local_codex_subscription' ? 'local_codex_subscription' : 'not_required',
      credential_requirement_kind: credentialRequirement.kind,
      credential_requirement: redactProviderCredentialRequirement(credentialRequirement),
      credential_secret_ref: null,
      primary_credential_env: null,
      credential_env_names: [],
      source_env: null,
      value: '',
    };
  }

  const secretValue = providerCredentialFromSecretStore(secretRef, { processEnv });
  if (secretValue) {
    return {
      credential_required: true,
      credential_present: true,
      credential_source: 'secret_store',
      credential_requirement_kind: credentialRequirement.kind,
      credential_requirement: redactProviderCredentialRequirement(credentialRequirement),
      credential_secret_ref: secretRef,
      primary_credential_env: primaryCredentialEnv,
      credential_env_names: credentialEnvNames,
      source_env: null,
      environment_fallback: 'not_needed',
      value: secretValue,
    };
  }

  const envValue = providerEnvironmentFallbackEnabled(processEnv)
    ? firstEnvironmentValueWithName(credentialEnvNames, processEnv)
    : null;
  if (envValue) {
    return {
      credential_required: true,
      credential_present: true,
      credential_source: 'environment',
      credential_requirement_kind: credentialRequirement.kind,
      credential_requirement: redactProviderCredentialRequirement(credentialRequirement),
      credential_secret_ref: secretRef,
      primary_credential_env: primaryCredentialEnv,
      credential_env_names: credentialEnvNames,
      source_env: envValue.name,
      environment_fallback: 'explicit_opt_in',
      value: envValue.value,
    };
  }

  return {
    credential_required: true,
    credential_present: false,
    credential_source: 'missing',
    credential_requirement_kind: credentialRequirement.kind,
    credential_requirement: redactProviderCredentialRequirement(credentialRequirement),
    credential_secret_ref: secretRef,
    primary_credential_env: primaryCredentialEnv,
    credential_env_names: credentialEnvNames,
    source_env: null,
    environment_fallback: providerEnvironmentFallbackEnabled(processEnv) ? 'enabled_but_missing' : 'not_admitted',
    value: '',
  };
}

export function redactProviderCredentialResolution(credential) {
  if (!credential) return null;
  const { value: _value, ...redacted } = credential;
  return redacted;
}

export function intelligenceProviderEnvironmentProjection(providerResolution, {
  metadataByProvider,
  processEnv = process.env,
  codexSubscriptionPreflight,
} = {}) {
  if (!providerResolution) return { env: {}, credential: null };
  const provider = providerResolution.intelligence_provider;
  const metadata = metadataByProvider[provider];
  const credential = resolveProviderCredential(provider, metadata, { processEnv, codexSubscriptionPreflight });
  const baseUrl = firstEnvironmentValue(metadata.base_url_env_names, processEnv) ?? metadata.base_url;
  const model = firstEnvironmentValue(metadata.model_env_names, processEnv) ?? providerResolution.default_model ?? metadata.default_model;
  const thinking = firstEnvironmentValue(['NARADA_AI_THINKING', 'NARADA_THINKING_LEVEL'], processEnv)
    ?? providerResolution.default_thinking
    ?? metadata.default_thinking
    ?? 'medium';
  const runtimeBinding = resolveProviderRuntimeBinding(provider, {
    metadata: metadataByProvider,
    env: {},
    overrides: {
      apiKey: credential.value || null,
      baseUrl,
      model,
      thinking,
    },
    // Agent-start emits the authoritative structured credential refusal below.
    // Runtime entry points retain the hard missing-credential guard.
    requireCredential: false,
  });
  return {
    env: providerRuntimeEnvironment(runtimeBinding),
    credential: redactProviderCredentialResolution(credential),
    runtime_binding: redactProviderRuntimeBinding(runtimeBinding),
  };
}

export function intelligenceProviderEnvironment(providerResolution, options = {}) {
  return intelligenceProviderEnvironmentProjection(providerResolution, options).env;
}

export function mcpProviderCredentialEnvironment({
  carrier,
  agentTuiCarrier,
  metadataByProvider,
  processEnv = process.env,
  codexSubscriptionPreflight,
}) {
  if (!NARS_OPERATOR_SURFACE_KINDS.includes(carrier) && carrier !== agentTuiCarrier && carrier !== 'claude-code') return {};
  const env = {};
  for (const [provider, metadata] of Object.entries(metadataByProvider)) {
    const requirement = providerCredentialRequirement(provider, metadata);
    if (requirement.kind !== 'api_key_secret') continue;
    const credential = resolveProviderCredential(provider, metadata, { processEnv, codexSubscriptionPreflight });
    if (!credential?.credential_present || !credential.primary_credential_env || !credential.value) continue;
    env[credential.primary_credential_env] = credential.value;
    const primaryBaseUrlEnv = metadata.base_url_env_names?.[0];
    const baseUrl = primaryBaseUrlEnv ? (firstEnvironmentValue(metadata.base_url_env_names, processEnv) ?? metadata.base_url) : null;
    if (primaryBaseUrlEnv && baseUrl) {
      env[primaryBaseUrlEnv] = baseUrl;
    }
  }
  return env;
}

export function annotateIntelligenceProviderCredential(providerResolution, credential) {
  if (!providerResolution || !credential) return providerResolution;
  return {
    ...providerResolution,
    credential,
    credential_secret_ref: credential.credential_secret_ref,
    credential_source: credential.credential_source,
    credential_present: credential.credential_present,
    credential_env_names: credential.credential_env_names,
    credential_requirement_kind: credential.credential_requirement_kind,
    credential_requirement: credential.credential_requirement,
  };
}

export function providerCredentialRefusal(providerResolution, credential, { schema, withResolutionStates }) {
  if (credential.credential_requirement_kind === 'local_codex_subscription') {
    return withResolutionStates({
      schema,
      status: 'refused',
      reason_code: 'local_codex_subscription_auth_unavailable',
      intelligence_provider: providerResolution?.intelligence_provider,
      credential_requirement_kind: credential.credential_requirement_kind,
      credential_requirement: credential.credential_requirement,
      credential_source: credential.credential_source,
      credential_present: false,
      preflight: credential.preflight,
      reason: 'The selected provider uses local Codex subscription auth, but the Codex CLI preflight did not complete successfully.',
      required_next_step: 'Run codex login or repair local Codex subscription auth, then retry the launcher. For diagnostics only, set NARADA_CODEX_SUBSCRIPTION_PREFLIGHT=defer to skip the launch-time probe.',
    }, [
      ...(providerResolution?.resolution_states ?? []),
      {
        state: 'launch_refused',
        reason_code: 'local_codex_subscription_auth_unavailable',
        credential_requirement_kind: credential.credential_requirement_kind,
      },
    ]);
  }
  const states = [
    ...(providerResolution?.resolution_states ?? []),
    {
      state: 'launch_refused',
      reason_code: 'intelligence_provider_credential_missing',
      credential_requirement_kind: credential.credential_requirement_kind,
      credential_secret_ref: credential.credential_secret_ref,
      credential_env_names: credential.credential_env_names,
    },
  ];
  return withResolutionStates({
    schema,
    status: 'refused',
    reason_code: 'intelligence_provider_credential_missing',
    intelligence_provider: providerResolution?.intelligence_provider,
    api_key_env: credential.primary_credential_env,
    credential_requirement_kind: credential.credential_requirement_kind,
    credential_requirement: credential.credential_requirement,
    credential_secret_ref: credential.credential_secret_ref,
    credential_env_names: credential.credential_env_names,
    credential_source: 'missing',
    credential_present: false,
    reason: `No API key credential is available for provider '${providerResolution?.intelligence_provider}'.`,
    required_next_step: `Store the key with PowerShell SecretManagement as '${credential.credential_secret_ref}' or, for an explicit diagnostic fallback only, set ${PROVIDER_ENV_FALLBACK_MODE_ENV}=1 and one of: ${credential.credential_env_names.join(' or ')}`,
  }, states);
}
