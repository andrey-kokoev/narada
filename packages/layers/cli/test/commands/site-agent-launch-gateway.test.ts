import { describe, expect, it, vi } from 'vitest';
import { buildAgentIdentityRefV2 } from '@narada2/agent-identity';
import { createSiteAgentLaunchGateway } from '../../src/commands/site-agent-launch-gateway.js';

function overview(state: 'running' | 'stopped' | 'degraded', sessionId: string | null = null) {
  return {
    read: async () => ({
      schema: 'narada.operator_console.site_agent_overview.v1' as const,
      status: 'success' as const,
      generated_at: '2026-07-18T00:00:00.000Z',
      refusals: [],
      groups: [{
        id: 'sites' as const,
        label: 'Sites',
        sites: [{
          site_id: 'sonar',
          display_name: 'Sonar',
          site_kind: 'site' as const,
          group_id: 'sites' as const,
          observation_status: 'present',
          agents: [{
            agent_id: 'sonar.resident',
            local_agent_id: 'resident',
            title: 'Resident',
            role: 'resident',
            admission_status: 'admitted' as const,
            runtime: {
              state,
              session_count: sessionId ? 1 : 0,
              healthy_session_ids: sessionId ? [sessionId] : [],
              selected_session_id: sessionId,
            },
            work: { state: 'unavailable', detail: null, source: 'unavailable' as const },
            actions: { start: state === 'stopped', inspect: state === 'running', inspect_reason: null },
          }],
        }],
      }],
    }),
  };
}

const launchRecord = {
  agent: 'resident',
  agent_identity_ref: buildAgentIdentityRefV2({
    identity_scope: { kind: 'narada_site', site_id: 'sonar' },
    local_agent_id: 'resident',
    role: 'resident',
  }),
  title: 'Resident',
  role: 'resident',
  site: 'sonar',
  narada_root: 'D:/sites/sonar',
  site_root: 'D:/sites/sonar',
  workspace_root: 'D:/sites/sonar',
  launcher_path: 'D:/sites/sonar/start.ps1',
  operator_surface: 'agent-web-ui',
  runtime: 'narada-agent-runtime-server',
  authority: null,
  enable_native_shell: false,
  mcp_scope: 'all',
  config_path: 'C:/Users/test/Narada/config/launch/agents.json',
};

describe('site-agent launch gateway', () => {
  it('reuses one healthy session without launching', async () => {
    const launchCommand = vi.fn();
    const gateway = createSiteAgentLaunchGateway({
      overview: overview('running', 'session-1'),
      launchCommand,
    });
    expect(await gateway.launch({ siteId: 'sonar', agentId: 'sonar.resident' })).toMatchObject({
      status: 'reused',
      session_id: 'session-1',
    });
    expect(launchCommand).not.toHaveBeenCalled();
  });

  it('launches one stopped admitted agent through workspace launch', async () => {
    const launchCommand = vi.fn(async () => ({
      exitCode: 0,
      result: { attachment: { sessions: [{ session_id: 'session-2' }] } },
    }));
    const gateway = createSiteAgentLaunchGateway({
      overview: overview('stopped'),
      readLaunchRecords: async () => ({ records: [launchRecord], siteCatalog: [] }),
      launchCommand: launchCommand as never,
    });
    expect(await gateway.launch({ siteId: 'sonar', agentId: 'sonar.resident' })).toMatchObject({
      status: 'launched',
      session_id: 'session-2',
    });
    expect(launchCommand).toHaveBeenCalledTimes(1);
  });

  it('refuses degraded or unadmitted agents before mutation', async () => {
    const launchCommand = vi.fn();
    const gateway = createSiteAgentLaunchGateway({ overview: overview('degraded'), launchCommand });
    expect(await gateway.launch({ siteId: 'sonar', agentId: 'sonar.resident' })).toMatchObject({
      status: 'refused',
      reason: 'agent_runtime_degraded',
    });
    expect(await gateway.launch({ siteId: 'sonar', agentId: 'sonar.builder' })).toMatchObject({
      status: 'refused',
      reason: 'agent_not_admitted_to_site',
    });
    expect(launchCommand).not.toHaveBeenCalled();
  });
});
