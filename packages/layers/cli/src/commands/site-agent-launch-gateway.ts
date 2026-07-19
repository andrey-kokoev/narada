import type { OperatorSiteAgentLaunchWireResponse } from '@narada2/operator-console-contract';
import { silentCommandContext } from '../lib/command-wrapper.js';
import { workspaceLaunchCommand } from './workspace-launch-application.js';
import { readWorkspaceLaunchRecords } from './workspace-launch-registry.js';
import type { SiteAgentOverviewReadModel } from './site-agent-overview-read-model.js';

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
  // Single-flight admission: one in-flight ensure-running per canonical agent.
  // Concurrent callers join the same admission instead of racing a second
  // read-then-launch, and the lease always releases on settle so failures can
  // be retried and later callers re-validate against fresh session state.
  const admissions = new Map<string, Promise<OperatorSiteAgentLaunchWireResponse>>();

  async function launchAdmitted(request: SiteAgentLaunchRequest): Promise<OperatorSiteAgentLaunchWireResponse> {
    const overview = await dependencies.overview.read();
    const agent = overview.groups
      .flatMap((group) => group.sites)
      .find((site) => site.site_id === request.siteId)
      ?.agents.find((candidate) => candidate.agent_id === request.agentId);
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
      const key = `${request.siteId.toLowerCase()}/${request.agentId.toLowerCase()}`;
      const inFlight = admissions.get(key);
      if (inFlight) return inFlight;
      const admission = launchAdmitted(request);
      admissions.set(key, admission);
      try {
        return await admission;
      } finally {
        if (admissions.get(key) === admission) admissions.delete(key);
      }
    },
  };
}
