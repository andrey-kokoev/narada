import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  providerCredentialRequirement,
  redactProviderCredentialRequirement,
} from './provider-credential-projection.ts';

export const INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA = 'narada.intelligence_provider.v1';

export const PROVIDER_SUPPORT_STATES = Object.freeze({
  DECLARED: 'declared',
  ADMITTED_UNSUPPORTED: 'admitted_unsupported',
  ADAPTER_IMPLEMENTED: 'adapter_implemented',
  VERIFIED_SUPPORTED: 'verified_supported',
  DEPRECATED: 'deprecated',
  REMOVED: 'removed',
});

export function loadIntelligenceProviderRegistry(metadataPath) {
  const packet = Object.freeze(JSON.parse(readFileSync(metadataPath, 'utf8')));
  return {
    packet,
    metadata: Object.freeze(packet.providers),
    admittedProviders: Object.freeze(Object.keys(packet.providers)),
    defaultProvider: packet.default_provider ?? 'kimi-code-api',
  };
}

export function loadSiteEnvFile(path, { processEnv = process.env, siteEnvBindings } = {}) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    if (processEnv[name]) continue;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    processEnv[name] = value;
    siteEnvBindings.set(name, { source_field: 'site_env', source_path: path });
  }
}

export function loadSiteEnvFiles(siteRoot, { siteNaradaRoot, processEnv = process.env, siteEnvBindings } = {}) {
  loadSiteEnvFile(join(siteRoot, '.env'), { processEnv, siteEnvBindings });
  loadSiteEnvFile(join(siteNaradaRoot(siteRoot), '.env'), { processEnv, siteEnvBindings });
}

export function nonEmptyString(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function resolveIntelligenceProviderInputSource(argumentValue, environmentValue, runtimeName, {
  processEnv = process.env,
  siteEnvBindings,
} = {}) {
  if (nonEmptyString(argumentValue)) {
    return { source_field: 'cli_argument' };
  }
  if (runtimeName === 'agent-cli' && nonEmptyString(environmentValue)) {
    const siteBinding = siteEnvBindings.get('NARADA_INTELLIGENCE_PROVIDER');
    if (siteBinding) return siteBinding;
    if (nonEmptyString(processEnv.NARADA_INTELLIGENCE_PROVIDER_SOURCE_FIELD)) {
      return {
        source_field: String(processEnv.NARADA_INTELLIGENCE_PROVIDER_SOURCE_FIELD).trim(),
        source_path: nonEmptyString(processEnv.NARADA_INTELLIGENCE_PROVIDER_SOURCE_PATH)
          ? String(processEnv.NARADA_INTELLIGENCE_PROVIDER_SOURCE_PATH).trim()
          : null,
      };
    }
    return { source_field: 'environment' };
  }
  return { source_field: null };
}

export function resolveProviderSupportState(providerContract) {
  const state = normalizeProviderSupportState(providerContract.support_state ?? providerContract.support_status);
  return {
    state,
    ready: state === PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED || state === PROVIDER_SUPPORT_STATES.DEPRECATED,
    required_next_step: requiredNextProviderSupportStep(state, providerContract.adapter_kind),
  };
}

export function normalizeProviderSupportState(value) {
  if (value === 'supported') return PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED;
  if (value === 'unsupported_until_adapter_exists') return PROVIDER_SUPPORT_STATES.ADMITTED_UNSUPPORTED;
  if (value === 'unsupported_until_reviewed') return PROVIDER_SUPPORT_STATES.ADAPTER_IMPLEMENTED;
  return value ?? PROVIDER_SUPPORT_STATES.DECLARED;
}

export function requiredNextProviderSupportStep(state, adapterKind) {
  if (state === PROVIDER_SUPPORT_STATES.DECLARED) return 'Admit provider policy and choose a request adapter before launch.';
  if (state === PROVIDER_SUPPORT_STATES.ADMITTED_UNSUPPORTED) return `Implement request adapter ${adapterKind} and move the provider to adapter_implemented.`;
  if (state === PROVIDER_SUPPORT_STATES.ADAPTER_IMPLEMENTED) return 'Verify launcher, docs, credential mapping, and runtime tests before marking verified_supported.';
  if (state === PROVIDER_SUPPORT_STATES.REMOVED) return 'Use an admitted replacement provider or restore the provider through a new contract revision.';
  if (state === PROVIDER_SUPPORT_STATES.DEPRECATED) return 'Provider remains launchable for compatibility; migrate to a non-deprecated provider.';
  return 'Provider is verified for launch.';
}

export function intelligenceProviderRefusal(candidate, { admittedProviders, schema = INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA }) {
  return {
    schema,
    status: 'refused',
    reason_code: 'intelligence_provider_unsupported',
    candidate_intelligence_provider: String(candidate ?? ''),
    admitted_intelligence_providers: [...admittedProviders],
    reason: 'intelligence_provider is not admitted by narada.intelligence_provider.v1',
    required_next_step: 'Use one of the admitted intelligence provider values or update the versioned intelligence provider contract first.',
  };
}

export function intelligenceProviderStateRefusal(provider, providerContract, { schema = INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA }) {
  const support = resolveProviderSupportState(providerContract);
  return {
    schema,
    status: 'refused',
    reason_code: 'intelligence_provider_support_state_not_ready',
    intelligence_provider: provider,
    support_state: support.state,
    request_adapter: providerContract.adapter_kind,
    reason: `intelligence_provider ${provider} is admitted but not launch-ready: ${support.state}`,
    required_next_step: support.required_next_step,
  };
}

export function withResolutionStates(outcome, states) {
  return {
    ...outcome,
    resolution_states: states,
  };
}

export function resolveIntelligenceProviderLaunch(value, runtimeName, inputSource = { source_field: null }, {
  metadataByProvider,
  admittedProviders,
  defaultProvider,
  schema = INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
} = {}) {
  const states = [];
  const pushState = (state, detail = {}) => states.push({ state, ...detail });
  const inputAbsent = value === null || value === undefined || String(value).trim() === '';
  if (inputAbsent) {
    pushState('input_absent');
    if (runtimeName !== 'agent-cli') return null;
    value = defaultProvider;
    pushState('default_provider_selected', { intelligence_provider: value });
  }

  const provider = String(value).trim();
  if (!admittedProviders.includes(provider)) {
    pushState('launch_refused', { reason_code: 'intelligence_provider_unsupported' });
    return withResolutionStates(intelligenceProviderRefusal(provider, { admittedProviders, schema }), states);
  }
  pushState('provider_known', { intelligence_provider: provider });

  if (runtimeName !== 'agent-cli') {
    pushState('launch_refused', { reason_code: 'intelligence_provider_runtime_unsupported' });
    return withResolutionStates({
      schema,
      status: 'refused',
      reason_code: 'intelligence_provider_runtime_unsupported',
      intelligence_provider: provider,
      runtime_substrate_kind: runtimeName,
      reason: '-IntelligenceProvider currently applies only to -Runtime agent-cli. Kimi and Codex CLI provider selection remains owned by those carriers.',
    }, states);
  }
  pushState('runtime_supports_provider_selection', { runtime_substrate_kind: runtimeName });

  const providerContract = metadataByProvider[provider];
  const credentialRequirement = providerCredentialRequirement(provider, providerContract);
  const support = resolveProviderSupportState(providerContract);
  if (!support.ready) {
    pushState('launch_refused', { reason_code: 'intelligence_provider_support_state_not_ready', support_state: support.state });
    return withResolutionStates(intelligenceProviderStateRefusal(provider, providerContract, { schema }), states);
  }
  pushState('adapter_supported', { request_adapter: providerContract.adapter_kind, support_state: support.state });

  const resolution = withResolutionStates({
    schema,
    intelligence_provider: provider,
    source_field: inputAbsent ? 'default_for_agent_cli' : inputSource.source_field ?? 'intelligence_provider',
    source_path: inputAbsent ? null : inputSource.source_path ?? null,
    request_adapter: providerContract.adapter_kind,
    support_state: support.state,
    default_model: providerContract.default_model,
    model_env: providerContract.model_env_names[0],
    api_base_url_env: providerContract.base_url_env_names[0],
    api_key_env: credentialRequirement.kind === 'api_key_secret' ? credentialRequirement.env_names[0] : undefined,
    credential_requirement_kind: credentialRequirement.kind,
    credential_requirement: redactProviderCredentialRequirement(credentialRequirement),
  }, states);
  pushState('environment_resolved', {
    model_env: resolution.model_env,
    api_base_url_env: resolution.api_base_url_env,
    api_key_env: resolution.api_key_env,
  });
  pushState('launch_ready');
  return resolution;
}
