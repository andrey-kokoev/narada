import {
  formatOperatorSiteAgentInvariantViolation,
  parseOperatorSiteAgentAdmissionOptionsWireResponse,
  parseOperatorSiteAgentAdmissionWireResponse,
  parseOperatorSiteAgentDeleteWireResponse,
  parseOperatorSiteAgentOverviewWireResponse,
  parseOperatorSiteAgentStopWireResponse,
  validateOperatorSiteAgentOverviewInvariants,
  type OperatorSiteAgentLaunchFailureWireRecord,
  type OperatorSiteAgentLaunchHandoffWireRecord,
  type OperatorSiteAgentLaunchWireResponse,
  type OperatorSiteAgentAdmissionOptionsWireResponse,
  type OperatorSiteAgentAdmissionWireRequest,
  type OperatorSiteAgentAdmissionWireResponse,
  type OperatorSiteAgentDeleteWireResponse,
  type OperatorSiteAgentOverviewWireResponse,
  type OperatorSiteAgentStopWireResponse,
} from '@narada-core/operator-console-contract';
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
  admissionOptions(siteId: string): Promise<OperatorSiteAgentAdmissionOptionsWireResponse>;
  admit(request: OperatorSiteAgentAdmissionWireRequest): Promise<OperatorSiteAgentAdmissionWireResponse>;
  stop(siteId: string, agentId: string): Promise<OperatorSiteAgentStopWireResponse>;
  delete(siteId: string, agentId: string): Promise<OperatorSiteAgentDeleteWireResponse>;
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
    || !['overview_read', 'launch_record_read', 'workspace_launch', 'web_ui_attach', 'admission'].includes(String(value.phase))
    || typeof value.code !== 'string'
    || typeof value.message !== 'string'
    || !(typeof value.diagnostic_ref === 'string' || value.diagnostic_ref === null)
    || (value.diagnostic_summary !== undefined
      && value.diagnostic_summary !== null
      && !parseLaunchDiagnosticSummary(value.diagnostic_summary))) return null;
  return value as unknown as OperatorSiteAgentLaunchFailureWireRecord;
}

function parseLaunchDiagnosticSummary(value: unknown): boolean {
  if (!isRecord(value)
    || value.source !== 'agent_start'
    || !(typeof value.source_schema === 'string' || value.source_schema === null)
    || typeof value.reason_code !== 'string'
    || !(typeof value.required_next_step === 'string' || value.required_next_step === null)
    || !(typeof value.source_result_ref === 'string' || value.source_result_ref === null)) return false;
  if (value.conflicting_session === null) return true;
  if (!isRecord(value.conflicting_session)) return false;
  const session = value.conflicting_session;
  return (typeof session.session_id === 'string' || session.session_id === null)
    && (typeof session.state === 'string' || session.state === null)
    && (typeof session.authority_epoch === 'number' || session.authority_epoch === null)
    && (typeof session.pid === 'number' || session.pid === null)
    && (['alive', 'absent', 'not_observed'].includes(String(session.process_status)) || session.process_status === null)
    && (['fresh', 'expired', 'unknown'].includes(String(session.lease_status)) || session.lease_status === null)
    && (typeof session.lease_expires_at === 'string' || session.lease_expires_at === null)
    && (typeof session.heartbeat_age_ms === 'number' || session.heartbeat_age_ms === null)
    && (typeof session.governing_rule === 'string' || session.governing_rule === null)
    && (typeof session.reclaim_eligible === 'boolean' || session.reclaim_eligible === null)
    && Array.isArray(session.reclaim_blockers)
    && session.reclaim_blockers.every((entry) => typeof entry === 'string');
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
    async admissionOptions(siteId) {
      const response = parseOperatorSiteAgentAdmissionOptionsWireResponse(await transport.admissionOptions(siteId));
      if (!response) throw new SiteAgentsApiError('invalid_admission_options', 'Agent admission options did not match its contract.');
      return response;
    },
    async admit(request) {
      const response = parseOperatorSiteAgentAdmissionWireResponse(await transport.admit(request));
      if (!response) throw new SiteAgentsApiError('invalid_admission', 'Agent admission response did not match its contract.');
      return response;
    },
    async stop(siteId, agentId) {
      const response = parseOperatorSiteAgentStopWireResponse(await transport.stop(siteId, agentId));
      if (!response) throw new SiteAgentsApiError('invalid_stop', 'Agent stop response did not match its contract.');
      return response;
    },
    async delete(siteId, agentId) {
      const response = parseOperatorSiteAgentDeleteWireResponse(await transport.delete(siteId, agentId));
      if (!response) throw new SiteAgentsApiError('invalid_delete', 'Agent deletion response did not match its contract.');
      return response;
    },
  };
}
