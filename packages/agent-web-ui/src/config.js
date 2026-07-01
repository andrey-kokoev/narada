import { buildAgentWebUiCloudflareAuthorityConfig, buildAgentWebUiCloudflareProjectionConfig } from '@narada2/cloudflare-nars-projection';

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
  const cloudflareAuthorityConfig = cloudflareAuthoritySessionId && cloudflareApiBaseUrl
    ? buildAgentWebUiCloudflareAuthorityConfig({ session_id: cloudflareAuthoritySessionId, api_base_url: cloudflareApiBaseUrl })
    : null;
  const cloudflareConfig = cloudflareProjectionId && cloudflareApiBaseUrl
    ? buildAgentWebUiCloudflareProjectionConfig({ projection_id: cloudflareProjectionId, api_base_url: cloudflareApiBaseUrl, browser_token_fingerprint: browserToken })
    : null;
  const remoteConfig = cloudflareAuthorityConfig ?? cloudflareConfig;
  const eventEndpoint = remoteConfig?.event_endpoint ?? value('event_endpoint', 'eventEndpoint', 'events');
  const healthEndpoint = remoteConfig?.health_endpoint ?? value('health_endpoint', 'healthEndpoint', 'health');
  return {
    mode: remoteConfig?.mode ?? 'local_nars_projection',
    projectionId: cloudflareProjectionId,
    ...(cloudflareAuthoritySessionId ? { authoritySessionId: cloudflareAuthoritySessionId } : {}),
    cloudflareApiBaseUrl,
    browserToken: cloudflareConfig?.browser_token_fingerprint ?? browserToken,
    eventEndpoint,
    healthEndpoint,
    inputEndpoint: remoteConfig?.input_endpoint ?? value('input_endpoint', 'inputEndpoint', 'input'),
    cacheEndpoint: remoteConfig?.cache_endpoint ?? value('cache_endpoint', 'cacheEndpoint', 'cache'),
    healthTransport: value('health_transport', 'healthTransport') ?? (healthEndpoint ? (remoteConfig ? remoteConfig.mode.replace('_', '-') : 'http-proxy') : 'not-configured'),
    artifactBasePath: cloudflareConfig?.artifact_base_path ?? value('artifact_base_path', 'artifactBasePath') ?? (healthEndpoint ? '/api/nars' : null),
    artifactTransport: cloudflareConfig ? 'cloudflare-projection' : (value('artifact_transport', 'artifactTransport') ?? 'local-nars-proxy'),
    projectionControl: cloudflareConfig ? null : (injectedConfig.projectionControl ?? null),
    protocolHealthMethod: value('protocol_health_method', 'protocolHealthMethod') ?? 'session.health',
    maxReplay: Number.parseInt(value('max_replay', 'maxReplay') ?? '100', 10) || 100,
  };
}
