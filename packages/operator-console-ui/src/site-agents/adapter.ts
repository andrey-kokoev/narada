import {
  formatOperatorSiteAgentInvariantViolation,
  parseOperatorSiteAgentOverviewWireResponse,
  validateOperatorSiteAgentOverviewInvariants,
  type OperatorSiteAgentLaunchWireResponse,
  type OperatorSiteAgentOverviewWireResponse,
} from '@narada2/operator-console-contract';
import { createSiteAgentsTransport, type SiteAgentsTransport } from './transport';

export interface SiteAgentsPendingEntry {
  site_id: string;
  agent_id: string;
  session_id: string | null;
  started_at: string;
}

export interface SiteAgentsClient {
  overview(): Promise<OperatorSiteAgentOverviewWireResponse>;
  launch(siteId: string, agentId: string): Promise<OperatorSiteAgentLaunchWireResponse>;
  pending(): Promise<SiteAgentsPendingEntry[]>;
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

function parsePending(value: unknown): SiteAgentsPendingEntry[] | null {
  if (!isRecord(value)
    || value.schema !== 'narada.operator_console.agent_pending.v1'
    || value.status !== 'success'
    || !Array.isArray(value.pending)) return null;
  const entries = value.pending.map((entry: unknown) => {
    if (!isRecord(entry)
      || typeof entry.site_id !== 'string'
      || typeof entry.agent_id !== 'string'
      || !(typeof entry.session_id === 'string' || entry.session_id === null)
      || typeof entry.started_at !== 'string') return null;
    return entry as unknown as SiteAgentsPendingEntry;
  });
  if (entries.some((entry) => entry === null)) return null;
  return entries as SiteAgentsPendingEntry[];
}

export function createSiteAgentsAdapter(
  transport: SiteAgentsTransport = createSiteAgentsTransport(),
): SiteAgentsClient {
  return {
    async overview() {
      const response = parseOperatorSiteAgentOverviewWireResponse(await transport.overview());
      if (!response) throw new SiteAgentsApiError('invalid_overview', 'Sites and Agents overview did not match its contract.');
      if (response.status === 'success') {
        const flagged = validateOperatorSiteAgentOverviewInvariants(response).map(formatOperatorSiteAgentInvariantViolation);
        if (flagged.length > 0) {
          return { ...response, refusals: [...new Set([...response.refusals, ...flagged])] };
        }
      }
      return response;
    },
    async launch(siteId, agentId) {
      const response = parseLaunch(await transport.launch(siteId, agentId));
      if (!response) throw new SiteAgentsApiError('invalid_launch', 'Agent launch response did not match its contract.');
      return response;
    },
    async pending() {
      const response = parsePending(await transport.pending());
      if (!response) throw new SiteAgentsApiError('invalid_pending', 'Sites and Agents pending did not match its contract.');
      return response;
    },
  };
}
