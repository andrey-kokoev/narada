import { randomUUID } from 'node:crypto';
import type {
  OperatorSiteAgentLaunchFailurePhase,
  OperatorSiteAgentLaunchWireResponse,
} from '@narada2/operator-console-contract';
import { silentCommandContext } from '../lib/command-wrapper.js';
import { workspaceLaunchCommand } from './workspace-launch-application.js';
import { readWorkspaceLaunchRecords } from './workspace-launch-registry.js';
import type { SiteAgentOverviewReadModel } from './site-agent-overview-read-model.js';
import {
  createSiteAgentLaunchAdmission,
  type SiteAgentLaunchAdmission,
} from './site-agent-launch-admission.js';
import {
  createSiteAgentLaunchDiagnostics,
  type SiteAgentLaunchDiagnostics,
  type SiteAgentLaunchFailureContext,
} from './site-agent-launch-diagnostics.js';

export interface SiteAgentLaunchRequest {
  siteId: string;
  agentId: string;
}

export interface SiteAgentLaunchGateway {
  launch(request: SiteAgentLaunchRequest): Promise<OperatorSiteAgentLaunchWireResponse>;
}

export interface SiteAgentLaunchGatewayDependencies {
  overview: SiteAgentOverviewReadModel;
  readLaunchRecords?: typeof readWorkspaceLaunchRecords;
  launchCommand?: typeof workspaceLaunchCommand;
  launchAdmission?: SiteAgentLaunchAdmission;
  diagnostics?: SiteAgentLaunchDiagnostics;
}

function response(
  status: OperatorSiteAgentLaunchWireResponse['status'],
  request: SiteAgentLaunchRequest,
  sessionId: string | null,
  reason: string | null,
  requestId: string,
  failure: OperatorSiteAgentLaunchWireResponse['failure'] = null,
): OperatorSiteAgentLaunchWireResponse {
  return {
    schema: 'narada.operator_console.agent_launch.v1',
    status,
    site_id: request.siteId,
    agent_id: request.agentId,
    session_id: sessionId,
    reason,
    request_id: requestId,
    failure,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function messageField(value: unknown): string | null {
  return stringField(value) ?? (isRecord(value) ? stringField(value.message) : null);
}

function launchResultFailure(value: unknown): {
  code: string;
  message: string;
  error: unknown;
  workspaceResultPath: string | null;
} {
  const result = isRecord(value) ? value : {};
  const failure = isRecord(result.failure) ? result.failure : {};
  return {
    code: stringField(failure.reason_code)
      ?? stringField(failure.code)
      ?? 'workspace_launch_failed',
    message: stringField(failure.message)
      ?? messageField(result.error)
      ?? stringField(result.reason)
      ?? 'Workspace launch exited with a nonzero status.',
    error: failure.error ?? result.error,
    workspaceResultPath: stringField(result.result_path),
  };
}

function sessionIdFromLaunchResult(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const attachment = result.attachment;
  if (attachment === null || typeof attachment !== 'object' || Array.isArray(attachment)) return null;
  const sessions = (attachment as Record<string, unknown>).sessions;
  if (!Array.isArray(sessions) || sessions.length !== 1) return null;
  const session = sessions[0];
  if (session === null || typeof session !== 'object' || Array.isArray(session)) return null;
  const sessionId = (session as Record<string, unknown>).session_id;
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null;
}

export function createSiteAgentLaunchGateway(
  dependencies: SiteAgentLaunchGatewayDependencies,
): SiteAgentLaunchGateway {
  const readLaunchRecords = dependencies.readLaunchRecords ?? readWorkspaceLaunchRecords;
  const launchCommand = dependencies.launchCommand ?? workspaceLaunchCommand;
  const launchAdmission = dependencies.launchAdmission ?? createSiteAgentLaunchAdmission();
  const diagnostics = dependencies.diagnostics ?? createSiteAgentLaunchDiagnostics();

  async function failureResponse(
    request: SiteAgentLaunchRequest,
    requestId: string,
    phase: OperatorSiteAgentLaunchFailurePhase,
    code: string,
    error?: unknown,
    message?: string,
    context?: SiteAgentLaunchFailureContext,
  ): Promise<OperatorSiteAgentLaunchWireResponse> {
    const recorded = await diagnostics.recordFailure({
      requestId,
      siteId: request.siteId,
      agentId: request.agentId,
      phase,
      code,
      error,
      message,
      context,
    });
    return response('failed', request, null, code, requestId, recorded.failure);
  }

  async function reuseHealthySession(
    request: SiteAgentLaunchRequest,
    requestId: string,
  ): Promise<OperatorSiteAgentLaunchWireResponse | null> {
    const overview = await dependencies.overview.read().catch(() => null);
    if (!overview || overview.status !== 'success') return null;
    const matches = overview.groups
      .flatMap((group) => group.sites)
      .filter((site) => site.site_id === request.siteId)
      .flatMap((site) => site.agents)
      .filter((candidate) => candidate.agent_id === request.agentId);
    const agent = matches.length === 1 ? matches[0] : null;
    return agent?.runtime.state === 'running' && agent.runtime.selected_session_id
      ? response('reused', request, agent.runtime.selected_session_id, null, requestId)
      : null;
  }

  async function launchAdmitted(
    request: SiteAgentLaunchRequest,
    requestId: string,
  ): Promise<OperatorSiteAgentLaunchWireResponse> {
    let overview;
    try {
      overview = await dependencies.overview.read();
    } catch (error) {
      return failureResponse(request, requestId, 'overview_read', 'site_agent_overview_read_failed', error);
    }
    if (overview.status !== 'success') {
      return response('refused', request, null, 'site_agent_overview_refused', requestId);
    }
    const matches = overview.groups
      .flatMap((group) => group.sites)
      .filter((site) => site.site_id === request.siteId)
      .flatMap((site) => site.agents)
      .filter((candidate) => candidate.agent_id === request.agentId);
    if (matches.length > 1) return response('refused', request, null, 'duplicate_agent_identity', requestId);
    const agent = matches[0];
    if (!agent) return response('refused', request, null, 'agent_not_admitted_to_site', requestId);
    if (agent.runtime.state === 'running' && agent.runtime.selected_session_id) {
      return response('reused', request, agent.runtime.selected_session_id, null, requestId);
    }
    if (agent.runtime.state !== 'stopped') {
      return response('refused', request, null, `agent_runtime_${agent.runtime.state}`, requestId);
    }

    let launchLoad;
    try {
      launchLoad = await readLaunchRecords({ all: true });
    } catch (error) {
      return failureResponse(request, requestId, 'launch_record_read', 'launch_record_read_failed', error);
    }
    const launchRecord = launchLoad.records.find((record) =>
      record.site === request.siteId
      && `${record.site}.${record.agent_identity_ref.local_agent_id}` === request.agentId);
    if (!launchRecord) return response('refused', request, null, 'launch_record_not_found', requestId);

    let launch;
    try {
      launch = await launchCommand({
        agent: [launchRecord.agent],
        configPath: [launchRecord.config_path],
        format: 'json',
        suppressResultOutput: true,
      }, silentCommandContext({}));
    } catch (error) {
      return failureResponse(request, requestId, 'workspace_launch', 'workspace_launch_exception', error);
    }
    if (launch.exitCode !== 0) {
      const details = launchResultFailure(launch.result);
      return failureResponse(
        request,
        requestId,
        'workspace_launch',
        details.code,
        details.error,
        details.message,
        { exit_code: launch.exitCode, workspace_result_path: details.workspaceResultPath },
      );
    }
    return response('launched', request, sessionIdFromLaunchResult(launch.result), null, requestId);
  }

  return {
    async launch(request): Promise<OperatorSiteAgentLaunchWireResponse> {
      const requestId = randomUUID();
      const existing = await reuseHealthySession(request, requestId);
      if (existing) return existing;
      const key = `${request.siteId.toLowerCase()}/${request.agentId.toLowerCase()}`;
      try {
        return await launchAdmission.run(key, () => launchAdmitted(request, requestId));
      } catch (error) {
        return failureResponse(request, requestId, 'admission', 'workspace_launch_admission_failed', error);
      }
    },
  };
}
