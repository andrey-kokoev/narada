import { buildAgentWebUiCloudflareAuthorityConfig, buildAgentWebUiCloudflareProjectionConfig } from '@narada2/cloudflare-nars-projection';
import { buildNarsCapabilityProfile, deriveNarsRuntimeQuadrant } from '@narada2/nars-runtime-contract/runtime-surface-contract';
import { isRecord, stringValue, type UnknownRecord } from './types.ts';

type RemoteConfig = {
  mode?: string;
  event_endpoint?: string | null;
  health_endpoint?: string | null;
  input_endpoint?: string | null;
  cache_endpoint?: string | null;
  artifact_base_path?: string | null;
  browser_token_fingerprint?: string | null;
  [key: string]: unknown;
};

export type AuthorityTransition = {
  authority_runtime_host: string | null;
  authority_epoch: number | null;
  authority_runtime_id: string | null;
  authority_transition_state: string | null;
  source_write_admission: string | null;
  superseded_by_session_id: string | null;
  authority_locator_ref: string | null;
  target_authority_locator: UnknownRecord | null;
  stale_source: boolean;
  input_policy: 'disabled_source_sealed' | 'enabled';
  reattach: UnknownRecord | null;
};

export type AttachConfig = {
  mode: string;
  runtimeOrigin: string;
  surfaceOrigin: string;
  quadrant: unknown;
  capabilityProfile: unknown;
  admittedMethods?: string[];
  projectionId: string | null;
  sessionId: string | null;
  authoritySessionId?: string;
  cloudflareApiBaseUrl: string | null;
  browserToken: string | null;
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  inputEndpoint: string | null;
  cacheEndpoint: string | null;
  healthTransport: string;
  artifactBasePath: string | null;
  artifactTransport: string;
  projectionControl: unknown;
  onboarding?: { mode: 'user-site' };
  authorityTransition: AuthorityTransition | null;
  protocolHealthMethod: string;
  maxReplay: number;
};

export function readInjectedConfig(documentRef: Document | undefined = globalThis.document): UnknownRecord {
  const element = documentRef?.getElementById?.('nars-config');
  const text = element?.textContent?.trim();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveAttachConfig(
  search = '',
  injectedConfig: UnknownRecord = {},
): AttachConfig {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const value = (...keys: string[]): string | null => {
    for (const key of keys) {
      const fromQuery = params.get(key);
      if (fromQuery) return fromQuery;
      const fromConfig = injectedConfig[key];
      if (typeof fromConfig === 'string' || typeof fromConfig === 'number') return String(fromConfig);
    }
    return null;
  };

  const cloudflareProjectionId = value('cloudflare_projection_id', 'cloudflareProjectionId', 'projection_id', 'projectionId');
  const cloudflareAuthoritySessionId = value('cloudflare_authority_session_id', 'cloudflareAuthoritySessionId', 'authority_session_id', 'authoritySessionId');
  const cloudflareApiBaseUrl = value('cloudflare_api_base_url', 'cloudflareApiBaseUrl', 'api_base_url', 'apiBaseUrl');
  const browserToken = value('cloudflare_browser_token', 'cloudflareBrowserToken', 'browser_token_fingerprint', 'browserTokenFingerprint', 'browserToken');
  const sessionId = value('session_id', 'sessionId', 'nars_session_id', 'narsSessionId') ?? cloudflareAuthoritySessionId ?? cloudflareProjectionId;

  const cloudflareAuthorityConfig: RemoteConfig | null = cloudflareAuthoritySessionId && cloudflareApiBaseUrl
    ? buildAgentWebUiCloudflareAuthorityConfig({
      session_id: cloudflareAuthoritySessionId,
      api_base_url: cloudflareApiBaseUrl,
    }) as unknown as RemoteConfig
    : null;
  const cloudflareConfig: RemoteConfig | null = cloudflareProjectionId && cloudflareApiBaseUrl
    ? buildAgentWebUiCloudflareProjectionConfig({
      projection_id: cloudflareProjectionId,
      api_base_url: cloudflareApiBaseUrl,
      browser_token_fingerprint: browserToken,
    }) as unknown as RemoteConfig
    : null;
  const remoteConfig = cloudflareAuthorityConfig ?? cloudflareConfig;
  const eventEndpoint = remoteConfig?.event_endpoint ?? value('event_endpoint', 'eventEndpoint', 'events');
  const healthEndpoint = remoteConfig?.health_endpoint ?? value('health_endpoint', 'healthEndpoint', 'health');
  const runtimeOrigin = cloudflareAuthorityConfig ? 'cloudflare' : 'local';
  const surfaceOrigin = value('surface_origin', 'surfaceOrigin')
    ?? (cloudflareAuthorityConfig ? 'local' : cloudflareConfig ? 'cloudflare' : 'local');

  return {
    mode: remoteConfig?.mode ?? 'local_nars_projection',
    runtimeOrigin,
    surfaceOrigin,
    quadrant: deriveNarsRuntimeQuadrant(runtimeOrigin, surfaceOrigin),
    capabilityProfile: buildNarsCapabilityProfile(runtimeOrigin),
    ...(Array.isArray(injectedConfig.admittedMethods)
      ? { admittedMethods: injectedConfig.admittedMethods.filter((value): value is string => typeof value === 'string') }
      : {}),
    projectionId: cloudflareProjectionId,
    sessionId,
    ...(cloudflareAuthoritySessionId ? { authoritySessionId: cloudflareAuthoritySessionId } : {}),
    cloudflareApiBaseUrl,
    browserToken: cloudflareConfig?.browser_token_fingerprint ?? browserToken,
    eventEndpoint,
    healthEndpoint,
    inputEndpoint: remoteConfig?.input_endpoint ?? value('input_endpoint', 'inputEndpoint', 'input'),
    cacheEndpoint: remoteConfig?.cache_endpoint ?? value('cache_endpoint', 'cacheEndpoint', 'cache'),
    healthTransport: value('health_transport', 'healthTransport')
      ?? (healthEndpoint ? (remoteConfig ? String(remoteConfig.mode ?? 'http-proxy').replace('_', '-') : 'http-proxy') : 'not-configured'),
    artifactBasePath: remoteConfig?.artifact_base_path ?? value('artifact_base_path', 'artifactBasePath') ?? (healthEndpoint ? '/api/nars' : null),
    artifactTransport: cloudflareAuthorityConfig
      ? 'cloudflare-authority'
      : cloudflareConfig
        ? 'cloudflare-projection'
        : (value('artifact_transport', 'artifactTransport') ?? 'local-nars-proxy'),
    projectionControl: cloudflareConfig ? null : (injectedConfig.projectionControl ?? null),
    ...(isRecord(injectedConfig.onboarding) && injectedConfig.onboarding.mode === 'user-site'
      ? { onboarding: { mode: 'user-site' as const } }
      : {}),
    authorityTransition: normalizeAuthorityTransition(
      injectedConfig.authorityTransition ?? injectedConfig.authority_transition ?? null,
    ),
    protocolHealthMethod: value('protocol_health_method', 'protocolHealthMethod') ?? 'session.health',
    maxReplay: Number.parseInt(value('max_replay', 'maxReplay') ?? '100', 10) || 100,
  };
}

function normalizeAuthorityTransition(value: unknown): AuthorityTransition | null {
  if (!isRecord(value)) return null;
  const sourceWriteAdmission = stringValue(value.source_write_admission ?? value.sourceWriteAdmission);
  const transitionState = stringValue(value.authority_transition_state ?? value.authorityTransitionState);
  const supersededBySessionId = stringValue(value.superseded_by_session_id ?? value.supersededBySessionId);
  const staleSource = value.stale_source === true
    || value.staleSource === true
    || sourceWriteAdmission === 'sealed'
    || sourceWriteAdmission === 'retired'
    || transitionState === 'target_active'
    || Boolean(supersededBySessionId);
  return {
    authority_runtime_host: stringValue(value.authority_runtime_host ?? value.authorityRuntimeHost),
    authority_epoch: typeof value.authority_epoch === 'number' && Number.isInteger(value.authority_epoch)
      ? value.authority_epoch
      : typeof value.authorityEpoch === 'number' && Number.isInteger(value.authorityEpoch)
        ? value.authorityEpoch
        : null,
    authority_runtime_id: stringValue(value.authority_runtime_id ?? value.authorityRuntimeId),
    authority_transition_state: transitionState,
    source_write_admission: sourceWriteAdmission,
    superseded_by_session_id: supersededBySessionId,
    authority_locator_ref: stringValue(value.authority_locator_ref ?? value.authorityLocatorRef),
    target_authority_locator: objectField(value.target_authority_locator ?? value.targetAuthorityLocator),
    stale_source: staleSource,
    input_policy: staleSource ? 'disabled_source_sealed' : 'enabled',
    reattach: objectField(value.reattach),
  };
}

function objectField(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}
