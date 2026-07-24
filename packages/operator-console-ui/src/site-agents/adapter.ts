import {
  formatOperatorSiteAgentInvariantViolation,
  parseOperatorSiteAgentOverviewWireResponse,
  validateOperatorSiteAgentOverviewInvariants,
  type OperatorSiteAgentLaunchFailureWireRecord,
  type OperatorSiteAgentLaunchHandoffWireRecord,
  type OperatorSiteAgentLaunchWireResponse,
  type OperatorSiteAgentOverviewWireResponse,
} from '@narada2/operator-console-contract';
import { createSiteAgentsTransport, type SiteAgentsTransport } from './transport';

export interface SiteAgentsPendingEntry {
  site_id: string;
  agent_id: string;
  session_id: string | null;
  started_at: string;
  updated_at: string;
  phase: 'launch_accepted' | 'waiting_for_session' | 'waiting_for_route';
}

function parseLaunchHandoff(value: unknown): OperatorSiteAgentLaunchHandoffWireRecord | null {
  if (!isRecord(value)
    || !['browser', 'terminal', 'none'].includes(String(value.kind))
    || !['ready', 'started', 'pending', 'refused'].includes(String(value.status))
    || !(typeof value.url === 'string' || value.url === null)
    || !(typeof value.command === 'string' || value.command === null)
    || !(typeof value.message === 'string' || value.message === null)) return null;
  return value as unknown as OperatorSiteAgentLaunchHandoffWireRecord;
}

export interface SiteAgentsClient {
  overview(): Promise<OperatorSiteAgentOverviewWireResponse>;
  launch(siteId: string, agentId: string, operatorSurface?: string): Promise<OperatorSiteAgentLaunchWireResponse>;
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

function parseLaunchFailure(value: unknown): OperatorSiteAgentLaunchFailureWireRecord | null {
  if (!isRecord(value)
    || !['overview_read', 'launch_record_read', 'workspace_launch', 'admission'].includes(String(value.phase))
    || typeof value.code !== 'string'
    || typeof value.message !== 'string'
    || !(typeof value.diagnostic_ref === 'string' || value.diagnostic_ref === null)) return null;
  return value as unknown as OperatorSiteAgentLaunchFailureWireRecord;
}

export function parseOperatorSiteAgentLaunchWireResponse(value: unknown): OperatorSiteAgentLaunchWireResponse | null {
  if (!isRecord(value)
    || value.schema !== 'narada.operator_console.agent_launch.v1'
    || !['launched', 'reused', 'refused', 'failed'].includes(String(value.status))
    || typeof value.site_id !== 'string'
    || typeof value.agent_id !== 'string'
    || !(typeof value.session_id === 'string' || value.session_id === null)
    || !(typeof value.reason === 'string' || value.reason === null)
    || (value.operator_surface !== undefined && typeof value.operator_surface !== 'string')
    || (value.handoff !== undefined && !parseLaunchHandoff(value.handoff))
    || (value.request_id !== undefined && typeof value.request_id !== 'string')
    || (value.failure !== undefined && value.failure !== null && !parseLaunchFailure(value.failure))) return null;
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
      || typeof entry.started_at !== 'string'
      || typeof entry.updated_at !== 'string'
      || !['launch_accepted', 'waiting_for_session', 'waiting_for_route'].includes(String(entry.phase))) return null;
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
    async launch(siteId, agentId, operatorSurface) {
      const response = parseOperatorSiteAgentLaunchWireResponse(await transport.launch(siteId, agentId, operatorSurface));
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
