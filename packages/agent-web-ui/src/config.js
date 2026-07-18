import { buildAgentWebUiCloudflareAuthorityConfig, buildAgentWebUiCloudflareProjectionConfig } from '@narada2/cloudflare-nars-projection';
import { buildNarsCapabilityProfile, deriveNarsRuntimeQuadrant } from '@narada2/nars-runtime-contract/runtime-surface-contract';

export function readInjectedConfig(documentRef = globalThis.document) {
  const element = documentRef?.getElementById?.('nars-config');
  if (!element?.textContent?.trim()) return {};
  try {
    return JSON.parse(element.textContent);
  } catch {
    return {};
  }
}

export function resolveAttachConfig(search = '', injectedConfig = {}) {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const value = (...keys) => {
    for (const key of keys) {
      const fromQuery = params.get(key);
      if (fromQuery) return fromQuery;
      const fromConfig = injectedConfig[key];
      if (fromConfig) return fromConfig;
    }
    return null;
  };
  const cloudflareProjectionId = value('cloudflare_projection_id', 'cloudflareProjectionId', 'projection_id', 'projectionId');
  const cloudflareAuthoritySessionId = value('cloudflare_authority_session_id', 'cloudflareAuthoritySessionId', 'authority_session_id', 'authoritySessionId');
  const cloudflareApiBaseUrl = value('cloudflare_api_base_url', 'cloudflareApiBaseUrl', 'api_base_url', 'apiBaseUrl');
  const browserToken = value('cloudflare_browser_token', 'cloudflareBrowserToken', 'browser_token_fingerprint', 'browserTokenFingerprint', 'browserToken');
  const sessionId = value('session_id', 'sessionId', 'nars_session_id', 'narsSessionId') ?? cloudflareAuthoritySessionId ?? cloudflareProjectionId;
  const cloudflareAuthorityConfig = cloudflareAuthoritySessionId && cloudflareApiBaseUrl
    ? buildAgentWebUiCloudflareAuthorityConfig({ session_id: cloudflareAuthoritySessionId, api_base_url: cloudflareApiBaseUrl })
    : null;
  const cloudflareConfig = cloudflareProjectionId && cloudflareApiBaseUrl
    ? buildAgentWebUiCloudflareProjectionConfig({ projection_id: cloudflareProjectionId, api_base_url: cloudflareApiBaseUrl, browser_token_fingerprint: browserToken })
    : null;
  const remoteConfig = cloudflareAuthorityConfig ?? cloudflareConfig;
  const eventEndpoint = remoteConfig?.event_endpoint ?? value('event_endpoint', 'eventEndpoint', 'events');
  const healthEndpoint = remoteConfig?.health_endpoint ?? value('health_endpoint', 'healthEndpoint', 'health');
  // Declared, not inferred: runtime_origin comes from the explicit attach mode;
  // surface_origin defaults per mode and may be pinned by an explicit
  // surface_origin declaration (e.g. the Cloudflare-hosted authority page).
  const runtimeOrigin = cloudflareAuthorityConfig ? 'cloudflare' : 'local';
  const surfaceOrigin = value('surface_origin', 'surfaceOrigin')
    ?? (cloudflareAuthorityConfig ? 'local' : cloudflareConfig ? 'cloudflare' : 'local');
  return {
    mode: remoteConfig?.mode ?? 'local_nars_projection',
    runtimeOrigin,
    surfaceOrigin,
    quadrant: deriveNarsRuntimeQuadrant(runtimeOrigin, surfaceOrigin),
    capabilityProfile: buildNarsCapabilityProfile(runtimeOrigin),
    ...(Array.isArray(injectedConfig.admittedMethods) ? { admittedMethods: [...injectedConfig.admittedMethods] } : {}),
    projectionId: cloudflareProjectionId,
    sessionId,
    ...(cloudflareAuthoritySessionId ? { authoritySessionId: cloudflareAuthoritySessionId } : {}),
    cloudflareApiBaseUrl,
    browserToken: cloudflareConfig?.browser_token_fingerprint ?? browserToken,
    eventEndpoint,
    healthEndpoint,
    inputEndpoint: remoteConfig?.input_endpoint ?? value('input_endpoint', 'inputEndpoint', 'input'),
    cacheEndpoint: remoteConfig?.cache_endpoint ?? value('cache_endpoint', 'cacheEndpoint', 'cache'),
    healthTransport: value('health_transport', 'healthTransport') ?? (healthEndpoint ? (remoteConfig ? remoteConfig.mode.replace('_', '-') : 'http-proxy') : 'not-configured'),
    artifactBasePath: remoteConfig?.artifact_base_path ?? value('artifact_base_path', 'artifactBasePath') ?? (healthEndpoint ? '/api/nars' : null),
    artifactTransport: cloudflareAuthorityConfig ? 'cloudflare-authority' : cloudflareConfig ? 'cloudflare-projection' : (value('artifact_transport', 'artifactTransport') ?? 'local-nars-proxy'),
    projectionControl: cloudflareConfig ? null : (injectedConfig.projectionControl ?? null),
    ...(injectedConfig.onboarding?.mode === 'user-site' ? { onboarding: { mode: 'user-site' } } : {}),
    authorityTransition: normalizeAuthorityTransition(injectedConfig.authorityTransition ?? injectedConfig.authority_transition ?? null),
    protocolHealthMethod: value('protocol_health_method', 'protocolHealthMethod') ?? 'session.health',
    maxReplay: Number.parseInt(value('max_replay', 'maxReplay') ?? '100', 10) || 100,
  };
}

function normalizeAuthorityTransition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const sourceWriteAdmission = stringField(value.source_write_admission ?? value.sourceWriteAdmission);
  const transitionState = stringField(value.authority_transition_state ?? value.authorityTransitionState);
  const supersededBySessionId = stringField(value.superseded_by_session_id ?? value.supersededBySessionId);
  const staleSource = value.stale_source === true
    || value.staleSource === true
    || sourceWriteAdmission === 'sealed'
    || sourceWriteAdmission === 'retired'
    || transitionState === 'target_active'
    || Boolean(supersededBySessionId);
  return {
    authority_runtime_host: stringField(value.authority_runtime_host ?? value.authorityRuntimeHost),
    authority_epoch: Number.isInteger(value.authority_epoch) ? value.authority_epoch : Number.isInteger(value.authorityEpoch) ? value.authorityEpoch : null,
    authority_runtime_id: stringField(value.authority_runtime_id ?? value.authorityRuntimeId),
    authority_transition_state: transitionState,
    source_write_admission: sourceWriteAdmission,
    superseded_by_session_id: supersededBySessionId,
    authority_locator_ref: stringField(value.authority_locator_ref ?? value.authorityLocatorRef),
    target_authority_locator: objectField(value.target_authority_locator ?? value.targetAuthorityLocator),
    stale_source: staleSource,
    input_policy: staleSource ? 'disabled_source_sealed' : 'enabled',
    reattach: objectField(value.reattach),
  };
}

function stringField(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function objectField(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
