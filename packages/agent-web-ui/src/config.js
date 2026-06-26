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
  return {
    eventEndpoint: value('event_endpoint', 'eventEndpoint', 'events'),
    healthEndpoint: value('health_endpoint', 'healthEndpoint', 'health'),
    healthTransport: value('health_transport', 'healthTransport') ?? (value('health_endpoint', 'healthEndpoint', 'health') ? 'http-proxy' : 'not-configured'),
    protocolHealthMethod: value('protocol_health_method', 'protocolHealthMethod') ?? 'session.health',
    maxReplay: Number.parseInt(value('max_replay', 'maxReplay') ?? '100', 10) || 100,
  };
}
