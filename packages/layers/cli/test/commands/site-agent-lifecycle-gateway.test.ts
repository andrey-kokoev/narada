import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { OperatorSiteAgentOverviewWireResponse } from '@narada-core/operator-console-contract';
import { createSiteAgentLifecycleGateway } from '../../src/commands/site-agent-lifecycle-gateway.js';
import type { WorkspaceLaunchRecord } from '../../src/commands/workspace-launch-types.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function launchRecord(configPath: string): WorkspaceLaunchRecord {
  return {
    agent: 'site.builder',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'site' },
      local_agent_id: 'builder',
      role: 'builder',
    },
    title: 'Builder',
    role: 'builder',
    site: 'site',
    narada_root: 'D:/code/narada',
    site_root: 'D:/code/site',
    workspace_root: 'D:/code/site',
    launcher_path: 'D:/code/site/site.ps1',
    operator_surface: 'agent-cli',
    runtime: 'narada-agent-runtime-server',
    authority: 'auto',
    enable_native_shell: false,
    mcp_scope: 'local-site',
    config_path: configPath,
  };
}

function overview(state: 'running' | 'stopped'): OperatorSiteAgentOverviewWireResponse {
  return {
    schema: 'narada.operator_console.site_agent_overview.v1',
    status: 'success',
    generated_at: new Date().toISOString(),
    refusals: [],
    groups: [{
      id: 'sites',
      label: 'Sites',
      sites: [{
        site_id: 'site',
        display_name: 'Site',
        site_kind: 'site',
        group_id: 'sites',
        observation_status: 'healthy',
        agents: [{
          agent_id: 'site.builder',
          local_agent_id: 'builder',
          title: 'Builder',
          role: 'builder',
          admission_status: 'admitted',
          runtime: {
            state,
            session_count: state === 'running' ? 1 : 0,
            healthy_session_ids: state === 'running' ? ['session-1'] : [],
            selected_session_id: state === 'running' ? 'session-1' : null,
          },
          work: { state: 'idle', detail: null, source: 'unavailable' },
          operator_surfaces: { default_kind: 'agent-cli', choices: [] },
          actions: { start: state === 'stopped', inspect: false, inspect_reason: null },
        }],
      }],
    }],
  };
}

describe('site-agent lifecycle gateway', () => {
  it('writes a governed session.close request to the selected session sideband', async () => {
    const requests: Array<{ path: string; request: Record<string, unknown> }> = [];
    const gateway = createSiteAgentLifecycleGateway({
      overview: { read: async () => overview('running') },
      readLaunchRecords: async () => ({ records: [launchRecord('D:/code/site/agents.json')], siteCatalog: [] }),
      appendControlRequest: async (path, request) => { requests.push({ path, request }); },
    });

    const result = await gateway.stop({ siteId: 'site', agentId: 'site.builder' });
    expect(result.status).toBe('requested');
    expect(result.session_id).toBe('session-1');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.request.method).toBe('session.close');
    expect(requests[0]?.request.params).toMatchObject({ source: 'operator-console', agent_id: 'site.builder' });
  });

  it('deletes only after stop and removes both launch and operator identity admissions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-agent-lifecycle-'));
    roots.push(root);
    const configPath = join(root, 'agents.json');
    await writeFile(configPath, JSON.stringify({ Agents: [
      { Agent: 'site.resident', Site: 'site' },
      { Agent: 'site.builder', Site: 'site' },
    ] }, null, 2));
    let removedIdentity: Record<string, unknown> | null = null;
    const gateway = createSiteAgentLifecycleGateway({
      overview: { read: async () => overview('stopped') },
      readLaunchRecords: async () => ({ records: [launchRecord(configPath)], siteCatalog: [] }),
      removeSurfaceIdentity: async (options) => {
        removedIdentity = options as unknown as Record<string, unknown>;
        return { exitCode: 0, result: { status: 'success' } };
      },
    });

    const result = await gateway.delete({ siteId: 'site', agentId: 'site.builder' });
    expect(result.status).toBe('deleted');
    expect(removedIdentity).toMatchObject({ identityName: 'site.builder', site: 'site' });
    const registry = JSON.parse(await readFile(configPath, 'utf8')) as { Agents: Array<{ Agent: string }> };
    expect(registry.Agents.map((agent) => agent.Agent)).toEqual(['site.resident']);
  });

  it('refuses deletion while a healthy runtime session remains', async () => {
    const gateway = createSiteAgentLifecycleGateway({
      overview: { read: async () => overview('running') },
      readLaunchRecords: async () => ({ records: [], siteCatalog: [] }),
    });
    const result = await gateway.delete({ siteId: 'site', agentId: 'site.builder' });
    expect(result.status).toBe('refused');
    expect(result.reason).toBe('agent_must_be_stopped');
  });
});

