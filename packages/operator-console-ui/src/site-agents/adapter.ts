import {
  parseOperatorSiteAgentOverviewWireResponse,
  type OperatorSiteAgentLaunchWireResponse,
  type OperatorSiteAgentOverviewWireResponse,
} from '@narada2/operator-console-contract';
import { createSiteAgentsTransport, type SiteAgentsTransport } from './transport';

export interface SiteAgentsClient {
  overview(): Promise<OperatorSiteAgentOverviewWireResponse>;
  launch(siteId: string, agentId: string): Promise<OperatorSiteAgentLaunchWireResponse>;
}

export class SiteAgentsApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SiteAgentsApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseLaunch(value: unknown): OperatorSiteAgentLaunchWireResponse | null {
  if (!isRecord(value)
    || value.schema !== 'narada.operator_console.agent_launch.v1'
    || !['launched', 'reused', 'refused', 'failed'].includes(String(value.status))
    || typeof value.site_id !== 'string'
    || typeof value.agent_id !== 'string'
    || !(typeof value.session_id === 'string' || value.session_id === null)
    || !(typeof value.reason === 'string' || value.reason === null)) return null;
  return value as unknown as OperatorSiteAgentLaunchWireResponse;
}

export function createSiteAgentsAdapter(
  transport: SiteAgentsTransport = createSiteAgentsTransport(),
): SiteAgentsClient {
  return {
    async overview() {
      const response = parseOperatorSiteAgentOverviewWireResponse(await transport.overview());
      if (!response) throw new SiteAgentsApiError('invalid_overview', 'Sites and Agents overview did not match its contract.');
      return response;
    },
    async launch(siteId, agentId) {
      const response = parseLaunch(await transport.launch(siteId, agentId));
      if (!response) throw new SiteAgentsApiError('invalid_launch', 'Agent launch response did not match its contract.');
      return response;
    },
  };
}
