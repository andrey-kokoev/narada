import { setText } from './render.ts';
import { agentIdentityDisplay } from '@narada2/agent-identity';
import { isRecord, type UnknownRecord } from './types.ts';

type HealthAttachConfig = {
  healthEndpoint?: string | null;
  health_endpoint?: string | null;
  browserToken?: string | null;
  browser_token_fingerprint?: string | null;
};

export async function refreshHttpHealthStatus(
  endpointOrConfig: string | HealthAttachConfig | null | undefined,
  documentRef: Document | undefined = globalThis.document,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<void> {
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
    const response = await fetchFn(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: projectionHeaders(browserToken),
    });
    const parsed: unknown = await response.json();
    const body: UnknownRecord = isRecord(parsed) ? parsed : {};
    const identity = agentIdentityDisplay(
      body.agent_identity_ref,
      typeof body.agent_id === 'string' ? body.agent_id : 'agent',
    );
    setText(
      'health',
      `${typeof body.status === 'string' ? body.status : response.status} · ${identity ?? 'agent'} · ${typeof body.session_id === 'string' ? body.session_id : 'session'}`,
      documentRef,
    );
  } catch (error) {
    setText('health', `health unavailable · ${error instanceof Error ? error.message : String(error)}`, documentRef);
  }
}

function projectionHeaders(browserToken: string | null): Record<string, string> {
  return browserToken ? { 'x-narada-browser-token-fingerprint': browserToken } : {};
}
