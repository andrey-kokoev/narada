import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAgentIdentityRefV2 } from '@narada2/agent-identity';
import { createSiteAgentLaunchAdmission } from '../../src/commands/site-agent-launch-admission.js';
import { createSiteAgentLaunchDiagnostics } from '../../src/commands/site-agent-launch-diagnostics.js';
import { createSiteAgentLaunchGateway } from '../../src/commands/site-agent-launch-gateway.js';
import { WorkspaceLaunchContractError } from '../../src/commands/workspace-launch-contracts.js';

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
            operator_surfaces: {
              default_kind: 'agent-web-ui',
              choices: [
                { kind: 'agent-web-ui' as const, label: 'Web UI', status: 'available' as const, reason: null },
                { kind: 'agent-cli' as const, label: 'CLI', status: 'available' as const, reason: null },
                { kind: 'agent-tui' as const, label: 'TUI', status: 'available' as const, reason: null },
              ],
            },
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

function testAdmission() {
  return createSiteAgentLaunchAdmission({ root: mkdtempSync(join(tmpdir(), 'site-agent-gateway-')), pollMs: 1 });
}

function testDiagnostics() {
  return createSiteAgentLaunchDiagnostics({
    root: mkdtempSync(join(tmpdir(), 'site-agent-failures-')),
    log: vi.fn(),
  });
}

describe('site-agent launch gateway', () => {
  it('reuses one healthy session without launching', async () => {
    const launchCommand = vi.fn();
    const attachWebUiCommand = vi.fn(async () => ({ exitCode: 0, result: {} }));
    const gateway = createSiteAgentLaunchGateway({
      overview: overview('running', 'session-1'),
      launchCommand,
      attachWebUiCommand: attachWebUiCommand as never,
      launchAdmission: testAdmission(),
      diagnostics: testDiagnostics(),
    });
    expect(await gateway.launch({ siteId: 'sonar', agentId: 'sonar.resident' })).toMatchObject({
      status: 'reused',
      session_id: 'session-1',
    });
    expect(launchCommand).not.toHaveBeenCalled();
    expect(attachWebUiCommand).toHaveBeenCalledWith(expect.objectContaining({
      session: 'session-1',
      agent: 'sonar.resident',
      site: 'sonar',
      format: 'json',
      open: false,
    }), expect.anything());
  });

  it('fails explicitly when a healthy runtime cannot be attached to the Web UI', async () => {
    const attachWebUiCommand = vi.fn(async () => ({
      exitCode: 1,
      result: { reason: 'health_unavailable', message: 'runtime health is unavailable' },
    }));
    const gateway = createSiteAgentLaunchGateway({
      overview: overview('running', 'session-1'),
      attachWebUiCommand: attachWebUiCommand as never,
      launchAdmission: testAdmission(),
      diagnostics: testDiagnostics(),
    });
    expect(await gateway.launch({ siteId: 'sonar', agentId: 'sonar.resident' })).toMatchObject({
      status: 'failed',
      session_id: 'session-1',
      reason: 'health_unavailable',
      failure: {
        phase: 'web_ui_attach',
        code: 'health_unavailable',
        message: 'runtime health is unavailable',
      },
    });
  });

  it('launches one stopped admitted agent through workspace launch', async () => {
    const launchCommand = vi.fn(async () => ({
      exitCode: 0,
      result: { attachment: { sessions: [{ session_id: 'session-2' }] } },
    }));
    const attachWebUiCommand = vi.fn(async () => ({ exitCode: 0, result: {} }));
    const gateway = createSiteAgentLaunchGateway({
      overview: overview('stopped'),
      readLaunchRecords: async () => ({ records: [launchRecord], siteCatalog: [] }),
      launchCommand: launchCommand as never,
      attachWebUiCommand: attachWebUiCommand as never,
      diagnostics: testDiagnostics(),
      launchAdmission: testAdmission(),
    });
    expect(await gateway.launch({ siteId: 'sonar', agentId: 'sonar.resident' })).toMatchObject({
      status: 'launched',
      session_id: 'session-2',
    });
    expect(launchCommand).toHaveBeenCalledTimes(1);
    expect(launchCommand.mock.calls[0]?.[0]).toMatchObject({
      agent: ['resident'],
      configPath: [launchRecord.config_path],
      format: 'json',
      operatorSurface: 'agent-web-ui',
    });
  });

  it('forwards an explicitly selected compact operator surface', async () => {
    const launchCommand = vi.fn(async () => ({
      exitCode: 0,
      result: { attachment: { sessions: [{ session_id: 'session-tui' }] } },
    }));
    const gateway = createSiteAgentLaunchGateway({
      overview: overview('stopped'),
      readLaunchRecords: async () => ({ records: [launchRecord], siteCatalog: [] }),
      launchCommand: launchCommand as never,
      launchAdmission: testAdmission(),
      diagnostics: testDiagnostics(),
    });
    expect(await gateway.launch({ siteId: 'sonar', agentId: 'sonar.resident', operatorSurface: 'agent-tui' })).toMatchObject({
      status: 'launched',
      operator_surface: 'agent-tui',
      handoff: { kind: 'terminal', status: 'started' },
    });
    expect(launchCommand.mock.calls[0]?.[0]).toMatchObject({ operatorSurface: 'agent-tui' });
  });

  it('refuses a terminal surface for an existing session instead of creating a duplicate', async () => {
    const launchCommand = vi.fn();
    const runningOverview = overview('running', 'session-1');
    runningOverview.read = async () => {
      const result = await overview('running', 'session-1').read();
      result.groups[0]!.sites[0]!.agents[0]!.operator_surfaces.choices = [
        { kind: 'agent-web-ui', label: 'Web UI', status: 'available', reason: null },
        { kind: 'agent-cli', label: 'CLI', status: 'unavailable', reason: 'Existing sessions are not terminal-attachable.' },
        { kind: 'agent-tui', label: 'TUI', status: 'unavailable', reason: 'Existing sessions are not terminal-attachable.' },
      ];
      return result;
    };
    const gateway = createSiteAgentLaunchGateway({
      overview: runningOverview,
      launchCommand,
      launchAdmission: testAdmission(),
      diagnostics: testDiagnostics(),
    });
    expect(await gateway.launch({ siteId: 'sonar', agentId: 'sonar.resident', operatorSurface: 'agent-cli' })).toMatchObject({
      status: 'refused',
      reason: 'operator_surface_not_available',
      operator_surface: 'agent-cli',
      handoff: {
        kind: 'terminal',
        status: 'refused',
        message: 'Existing sessions are not terminal-attachable.',
      },
    });
    expect(launchCommand).not.toHaveBeenCalled();
  });

  it('refuses degraded or unadmitted agents before mutation', async () => {
    const launchCommand = vi.fn();
    const gateway = createSiteAgentLaunchGateway({
      overview: overview('degraded'),
      launchCommand,
      launchAdmission: testAdmission(),
      diagnostics: testDiagnostics(),
    });
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

  it('serializes concurrent launches into one atomic admission', async () => {
    let resolveLaunch: ((value: unknown) => void) | null = null;
    const launchCommand = vi.fn(() => new Promise((resolve) => { resolveLaunch = resolve; }));
    const gateway = createSiteAgentLaunchGateway({
      overview: overview('stopped'),
      readLaunchRecords: async () => ({ records: [launchRecord], siteCatalog: [] }),
      launchCommand: launchCommand as never,
    });
    const request = { siteId: 'sonar', agentId: 'sonar.resident' };
    const launches = [gateway.launch(request), gateway.launch(request), gateway.launch(request)];
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(launchCommand).toHaveBeenCalledTimes(1);
    resolveLaunch!({ exitCode: 0, result: { attachment: { sessions: [{ session_id: 'session-9' }] } } });
    const results = await Promise.all(launches);
    expect(launchCommand).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toMatchObject({ status: 'launched', session_id: 'session-9' });
    }
  });

  it('reuses a session that appears after a completed admission', async () => {
    let state: 'running' | 'stopped' = 'stopped';
    let sessionId: string | null = null;
    const dynamicOverview = { read: async () => overview(state, sessionId).read() };
    const launchCommand = vi.fn(async () => ({
      exitCode: 0,
      result: { attachment: { sessions: [{ session_id: 'session-2' }] } },
    }));
    const attachWebUiCommand = vi.fn(async () => ({ exitCode: 0, result: {} }));
    const gateway = createSiteAgentLaunchGateway({
      overview: dynamicOverview,
      readLaunchRecords: async () => ({ records: [launchRecord], siteCatalog: [] }),
      launchCommand: launchCommand as never,
      attachWebUiCommand: attachWebUiCommand as never,
    });
    const request = { siteId: 'sonar', agentId: 'sonar.resident' };
    expect(await gateway.launch(request)).toMatchObject({ status: 'launched', session_id: 'session-2' });
    state = 'running';
    sessionId = 'session-2';
    expect(await gateway.launch(request)).toMatchObject({ status: 'reused', session_id: 'session-2' });
    expect(launchCommand).toHaveBeenCalledTimes(1);
    expect(attachWebUiCommand).toHaveBeenCalledTimes(1);
  });

  it('releases the admission after a failed launch so a retry can succeed', async () => {
    const launchCommand = vi.fn()
      .mockResolvedValueOnce({
        exitCode: 1,
        result: {
          failure: { reason_code: 'workspace_launch_exit', message: 'startup failed api_key=secret' },
          result_path: 'D:/runtime/workspace-launch-result.json',
        },
      })
      .mockResolvedValueOnce({ exitCode: 0, result: { attachment: { sessions: [{ session_id: 'session-3' }] } } });
    const diagnostics = testDiagnostics();
    const gateway = createSiteAgentLaunchGateway({
      overview: overview('stopped'),
      readLaunchRecords: async () => ({ records: [launchRecord], siteCatalog: [] }),
      launchCommand: launchCommand as never,
      diagnostics,
    });
    const request = { siteId: 'sonar', agentId: 'sonar.resident' };
    const failure = await gateway.launch(request);
    expect(failure).toMatchObject({
      status: 'failed',
      reason: 'workspace_launch_exit',
      request_id: expect.any(String),
      failure: {
        phase: 'workspace_launch',
        code: 'workspace_launch_exit',
        message: 'startup failed api_key=<redacted>',
        diagnostic_ref: expect.any(String),
      },
    });
    const artifactPath = failure.failure?.diagnostic_ref;
    if (!artifactPath) throw new Error('expected persisted launch failure artifact');
    const artifact = JSON.parse(await readFile(artifactPath, 'utf8')) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      schema: 'narada.operator_console.agent_launch_failure.v1',
      request_id: failure.request_id,
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      failure: { code: 'workspace_launch_exit' },
    });
    expect(JSON.stringify(artifact)).not.toContain('secret');
    expect(await gateway.launch(request)).toMatchObject({ status: 'launched', session_id: 'session-3' });
    expect(launchCommand).toHaveBeenCalledTimes(2);
  });

  it('records the phase when an internal launch boundary throws', async () => {
    const request = { siteId: 'sonar', agentId: 'sonar.resident' };
    const cases = [
      {
        gateway: createSiteAgentLaunchGateway({
          overview: { read: async () => { throw new Error('overview unavailable'); } },
          diagnostics: testDiagnostics(),
        }),
        phase: 'overview_read',
      },
      {
        gateway: createSiteAgentLaunchGateway({
          overview: overview('stopped'),
          readLaunchRecords: async () => { throw new Error('launch record unavailable'); },
          diagnostics: testDiagnostics(),
        }),
        phase: 'launch_record_read',
      },
      {
        gateway: createSiteAgentLaunchGateway({
          overview: overview('stopped'),
          readLaunchRecords: async () => ({ records: [launchRecord], siteCatalog: [] }),
          launchCommand: async () => { throw new Error('workspace launch unavailable'); },
          diagnostics: testDiagnostics(),
        }),
        phase: 'workspace_launch',
      },
      {
        gateway: createSiteAgentLaunchGateway({
          overview: overview('stopped'),
          launchAdmission: { run: async () => { throw new Error('admission unavailable'); } },
          diagnostics: testDiagnostics(),
        }),
        phase: 'admission',
      },
    ] as const;

    for (const entry of cases) {
      const result = await entry.gateway.launch(request);
      expect(result).toMatchObject({
        status: 'failed',
        failure: { phase: entry.phase, diagnostic_ref: expect.any(String) },
      });
    }
  });

  it('preserves the workspace failure artifact path when execution throws', async () => {
    const diagnostics = testDiagnostics();
    let launchOptions: Record<string, unknown> | null = null;
    const gateway = createSiteAgentLaunchGateway({
      overview: overview('stopped'),
      readLaunchRecords: async () => ({ records: [launchRecord], siteCatalog: [] }),
      launchCommand: async (options) => {
        launchOptions = options as Record<string, unknown>;
        throw new WorkspaceLaunchContractError(
          'workspace_launch_projection_start_failed',
          'projection failed',
          'Inspect the launch artifact and retry.',
          'D:/runtime/workspace-launch-result.json',
        );
      },
      diagnostics,
    });

    const result = await gateway.launch({ siteId: 'sonar', agentId: 'sonar.resident' });
    expect(typeof launchOptions?.resultPath).toBe('string');
    expect(launchOptions?.resultPath).toMatch(/\.narada[\\/]runtime[\\/]operator-console[\\/]workspace-launch-results[\\/]/);
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'workspace_launch_exception',
      failure: { phase: 'workspace_launch', diagnostic_ref: expect.any(String) },
    });
    const artifactPath = result.failure?.diagnostic_ref;
    if (!artifactPath) throw new Error('expected persisted launch failure artifact');
    const artifact = JSON.parse(await readFile(artifactPath, 'utf8')) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      context: { workspace_result_path: 'D:/runtime/workspace-launch-result.json' },
    });
  });
});
