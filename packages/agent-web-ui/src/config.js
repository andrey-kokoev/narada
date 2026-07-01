import { buildAgentWebUiCloudflareProjectionConfig } from '@narada2/cloudflare-nars-projection';

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
  const cloudflareApiBaseUrl = value('cloudflare_api_base_url', 'cloudflareApiBaseUrl', 'api_base_url', 'apiBaseUrl');
  const cloudflareConfig = cloudflareProjectionId && cloudflareApiBaseUrl
    ? buildAgentWebUiCloudflareProjectionConfig({ projection_id: cloudflareProjectionId, api_base_url: cloudflareApiBaseUrl })
    : null;
  const eventEndpoint = cloudflareConfig?.event_endpoint ?? value('event_endpoint', 'eventEndpoint', 'events');
  const healthEndpoint = cloudflareConfig?.health_endpoint ?? value('health_endpoint', 'healthEndpoint', 'health');
  return {
    mode: cloudflareConfig?.mode ?? 'local_nars_projection',
    projectionId: cloudflareProjectionId,
    cloudflareApiBaseUrl,
    eventEndpoint,
    healthEndpoint,
    inputEndpoint: cloudflareConfig?.input_endpoint ?? value('input_endpoint', 'inputEndpoint', 'input'),
    cacheEndpoint: cloudflareConfig?.cache_endpoint ?? value('cache_endpoint', 'cacheEndpoint', 'cache'),
    healthTransport: value('health_transport', 'healthTransport') ?? (healthEndpoint ? (cloudflareConfig ? 'cloudflare-projection' : 'http-proxy') : 'not-configured'),
    artifactBasePath: cloudflareConfig?.artifact_base_path ?? value('artifact_base_path', 'artifactBasePath') ?? (healthEndpoint ? '/api/nars' : null),
    artifactTransport: cloudflareConfig ? 'cloudflare-projection' : (value('artifact_transport', 'artifactTransport') ?? 'local-nars-proxy'),
    protocolHealthMethod: value('protocol_health_method', 'protocolHealthMethod') ?? 'session.health',
    maxReplay: Number.parseInt(value('max_replay', 'maxReplay') ?? '100', 10) || 100,
  };
}
