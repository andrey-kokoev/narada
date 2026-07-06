import { setText } from './render.js';
import { agentIdentityDisplay } from '@narada2/agent-identity';

export async function refreshHttpHealthStatus(endpointOrConfig, documentRef = document, fetchFn = globalThis.fetch) {
  const endpoint = typeof endpointOrConfig === 'object' && endpointOrConfig !== null
    ? endpointOrConfig.healthEndpoint ?? endpointOrConfig.health_endpoint ?? null
    : endpointOrConfig;
  const browserToken = typeof endpointOrConfig === 'object' && endpointOrConfig !== null
    ? endpointOrConfig.browserToken ?? endpointOrConfig.browser_token_fingerprint ?? null
    : null;
  if (!endpoint) {
    setText('health', 'health endpoint not configured', documentRef);
    return;
  }
  try {
    const response = await fetchFn(endpoint, { method: 'GET', cache: 'no-store', headers: projectionHeaders(browserToken) });
    const body = await response.json();
    setText('health', `${body.status ?? response.status} · ${agentIdentityDisplay(body.agent_identity_ref, body.agent_id ?? 'agent') ?? 'agent'} · ${body.session_id ?? 'session'}`, documentRef);
  } catch (error) {
    setText('health', `health unavailable · ${error instanceof Error ? error.message : String(error)}`, documentRef);
  }
}

function projectionHeaders(browserToken) {
  return browserToken ? { 'x-narada-browser-token-fingerprint': browserToken } : {};
}
