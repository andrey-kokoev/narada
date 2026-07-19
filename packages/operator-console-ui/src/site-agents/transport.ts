import { OPERATOR_CONSOLE_AGENTS_API_PATH } from '@narada2/operator-console-contract';

export type SiteAgentsFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface SiteAgentsTransport {
  overview(): Promise<unknown>;
  launch(siteId: string, agentId: string): Promise<unknown>;
  pending(): Promise<unknown>;
}

export class SiteAgentsTransportError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'SiteAgentsTransportError';
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new SiteAgentsTransportError(response.status, `Sites and Agents returned HTTP ${response.status} without valid JSON.`);
  }
}

export function createSiteAgentsTransport(
  basePath = OPERATOR_CONSOLE_AGENTS_API_PATH,
  fetchLike: SiteAgentsFetch = (input, init) => fetch(input, init),
): SiteAgentsTransport {
  return {
    async overview(): Promise<unknown> {
      const response = await fetchLike(`${basePath}/overview`, { headers: { Accept: 'application/json' } });
      const payload = await readJson(response);
      if (!response.ok) throw new SiteAgentsTransportError(response.status, `Sites and Agents overview failed with HTTP ${response.status}.`);
      return payload;
    },
    async launch(siteId, agentId): Promise<unknown> {
      const response = await fetchLike(`${basePath}/launch`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, agent_id: agentId }),
      });
      const payload = await readJson(response);
      if (!response.ok && response.status !== 409) {
        throw new SiteAgentsTransportError(response.status, `Agent launch failed with HTTP ${response.status}.`);
      }
      return payload;
    },
    async pending(): Promise<unknown> {
      const response = await fetchLike(`${basePath}/pending`, { headers: { Accept: 'application/json' } });
      const payload = await readJson(response);
      if (!response.ok) throw new SiteAgentsTransportError(response.status, `Sites and Agents pending failed with HTTP ${response.status}.`);
      return payload;
    },
  };
}
