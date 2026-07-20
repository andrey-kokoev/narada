import type { OperatorSiteAgentLaunchWireResponse } from '@narada2/operator-console-contract';
import { silentCommandContext } from '../lib/command-wrapper.js';
import { workspaceLaunchCommand } from './workspace-launch-application.js';
import { readWorkspaceLaunchRecords } from './workspace-launch-registry.js';
import type { SiteAgentOverviewReadModel } from './site-agent-overview-read-model.js';
import {
  createSiteAgentLaunchAdmission,
  type SiteAgentLaunchAdmission,
} from './site-agent-launch-admission.js';

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
}

function response(
  status: OperatorSiteAgentLaunchWireResponse['status'],
  request: SiteAgentLaunchRequest,
  sessionId: string | null,
  reason: string | null,
): OperatorSiteAgentLaunchWireResponse {
  return {
    schema: 'narada.operator_console.agent_launch.v1',
    status,
    site_id: request.siteId,
    agent_id: request.agentId,
    session_id: sessionId,
    reason,
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

  async function reuseHealthySession(request: SiteAgentLaunchRequest): Promise<OperatorSiteAgentLaunchWireResponse | null> {
    const overview = await dependencies.overview.read().catch(() => null);
    if (!overview || overview.status !== 'success') return null;
    const matches = overview.groups
      .flatMap((group) => group.sites)
      .filter((site) => site.site_id === request.siteId)
      .flatMap((site) => site.agents)
      .filter((candidate) => candidate.agent_id === request.agentId);
    const agent = matches.length === 1 ? matches[0] : null;
    return agent?.runtime.state === 'running' && agent.runtime.selected_session_id
      ? response('reused', request, agent.runtime.selected_session_id, null)
      : null;
  }

  async function launchAdmitted(request: SiteAgentLaunchRequest): Promise<OperatorSiteAgentLaunchWireResponse> {
    const overview = await dependencies.overview.read();
    if (overview.status !== 'success') {
      return response('refused', request, null, 'site_agent_overview_refused');
    }
    const matches = overview.groups
      .flatMap((group) => group.sites)
      .filter((site) => site.site_id === request.siteId)
      .flatMap((site) => site.agents)
      .filter((candidate) => candidate.agent_id === request.agentId);
    if (matches.length > 1) return response('refused', request, null, 'duplicate_agent_identity');
    const agent = matches[0];
    if (!agent) return response('refused', request, null, 'agent_not_admitted_to_site');
    if (agent.runtime.state === 'running' && agent.runtime.selected_session_id) {
      return response('reused', request, agent.runtime.selected_session_id, null);
    }
    if (agent.runtime.state !== 'stopped') {
      return response('refused', request, null, `agent_runtime_${agent.runtime.state}`);
    }

    const launchLoad = await readLaunchRecords({ all: true });
    const launchRecord = launchLoad.records.find((record) =>
      record.site === request.siteId
      && `${record.site}.${record.agent_identity_ref.local_agent_id}` === request.agentId);
    if (!launchRecord) return response('refused', request, null, 'launch_record_not_found');

    const launch = await launchCommand({
      agent: [launchRecord.agent],
      configPath: [launchRecord.config_path],
      format: 'json',
      suppressResultOutput: true,
    }, silentCommandContext({}));
    if (launch.exitCode !== 0) return response('failed', request, null, 'workspace_launch_failed');
    return response('launched', request, sessionIdFromLaunchResult(launch.result), null);
  }

  return {
    async launch(request): Promise<OperatorSiteAgentLaunchWireResponse> {
      const existing = await reuseHealthySession(request);
      if (existing) return existing;
      const key = `${request.siteId.toLowerCase()}/${request.agentId.toLowerCase()}`;
      return launchAdmission.run(key, () => launchAdmitted(request).catch(() =>
        response('failed', request, null, 'workspace_launch_admission_failed')));
    },
  };
}
