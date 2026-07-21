import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceLaunchAdmissionPolicy } from '../../src/commands/workspace-launch-admission.js';
import { explainMcpCommand, workspaceLaunchCommand, workspaceLaunchPlanCommand } from '../../src/commands/workspace-launch-application.js';
import { buildAgentPlan } from '../../src/commands/workspace-launch-plan-builder.js';
import { hasWorkspaceLaunchSelectionIntent, readLaunchRegistry } from '../../src/commands/workspace-launch-registry.js';
import type { WorkspaceLaunchRecord } from '../../src/commands/workspace-launch-types.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

const discoverNarsSessionsMock = vi.hoisted(() => vi.fn());
const runAgentStartCommandMock = vi.hoisted(() => vi.fn(() => ({
  schema: 'narada.agent_start.command_result.v0',
  status: 'success',
  mutation_performed: false,
  site_root: 'D:/code/test-site',
  agent: 'test.agent',
  carrier: 'agent-cli',
  runtime: 'narada-agent-runtime-server',
  command: [],
  parsed_result: {
    schema: 'narada.agent_start.intelligence_catalog_preflight.v1',
    status: 'ready',
  },
})));

vi.mock('@narada2/nars-session-core/session-index', () => ({
  discoverNarsSessions: discoverNarsSessionsMock,
}));

vi.mock('../../src/lib/launcher-runtime.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/launcher-runtime.js')>('../../src/lib/launcher-runtime.js');
  return {
    ...actual,
    runAgentStartCommand: runAgentStartCommandMock,
  };
});

function createMockContext(): CommandContext {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
  return {
    configPath: '/test/config.json',
    logger: logger as unknown as CommandContext['logger'],
    verbose: false,
  };
}

function titleValues(wtArgs: string[]): string[] {
  return wtArgs.flatMap((arg, index) => arg === '--title' && typeof wtArgs[index + 1] === 'string' ? [wtArgs[index + 1]] : []);
}

function expectedIntelligenceSelectionAuthority(siteId: string, siteRoot: string): Record<string, unknown> {
  return {
    schema: 'narada.invokable-intelligence.selection-authority.v1',
    owner: '@narada2/invokable-intelligence-runtime',
    resolution_phase: 'runtime-invocation',
    authority_scope: { kind: 'site', site_id: siteId },
    catalog: { store_kind: 'node:sqlite', locator: join(siteRoot, '.ai', 'intelligence-registry.db') },
    launcher_selection: false,
    authoritative_inputs: ['invocation-intent', 'catalog', 'materialized-policy', 'runtime-context'],
  };
}

async function tempSiteWithDivergentMcpAuthority(): Promise<string> {
  const dir = join(process.cwd(), '.ai', 'tmp-tests', `launcher-mcp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(join(dir, '.ai', 'mcp'), { recursive: true });
  await mkdir(join(dir, '.narada', 'capabilities'), { recursive: true });
  tempDirs.push(dir);
  await writeFile(join(dir, '.ai', 'mcp', 'site-mcp.json'), JSON.stringify({
    schema: 'narada.mcp.client_config.v0',
    mcpServers: {
      'narada-test-local-filesystem': {
        transport: 'stdio',
        command: 'node',
        args: [
          'local-filesystem.js',
          '--mode',
          'write',
          '--allowed-root',
          join(dir, 'runtime-root'),
          '--output-root',
          dir,
        ],
      },
    },
  }), 'utf8');
  await writeFile(join(dir, '.narada', 'capabilities', 'mcp-registration.json'), JSON.stringify({
    schema: 'narada.site_mcp_registration.v0',
    mcp_servers: [
      {
        name: 'narada-test-local-filesystem',
        transport: 'stdio',
        command: 'node',
        args: [
          'local-filesystem.js',
          '--mode',
          'write',
          '--allowed-root',
          join(dir, 'projection-only-root'),
          '--output-root',
          join(dir, '.ai', 'tmp', 'mcp-outputs'),
        ],
      },
    ],
  }), 'utf8');
  return dir;
}

const tempDirs: string[] = [];

beforeEach(() => {
  runAgentStartCommandMock.mockClear();
});

async function tempRegistry(): Promise<string> {
  const dir = join(process.cwd(), '.ai', 'tmp-tests', `launcher-plan-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  const registry = join(dir, 'agents.json');
  await writeFile(registry, JSON.stringify({
    NaradaRoot: 'C:/Users/Andrey/Narada',
    McpScope: 'all',
    Runtime: 'codex',
    Agents: [
      {
        Agent: 'sonar.resident',
        Role: 'resident',
        Site: 'narada-sonar',
        NaradaRoot: 'D:/code/narada.sonar',
        SiteRoot: 'D:/code/narada.sonar',
        WorkspaceRoot: 'D:/code/narada.sonar',
        LauncherPath: 'D:/code/narada.sonar/narada-sonar.ps1',
        OperatorSurface: 'agent-cli',
        Runtime: 'narada-agent-runtime-server',
      },
      {
        Agent: 'smart-scheduling.resident',
        Role: 'resident',
        Site: 'smart-scheduling',
        NaradaRoot: 'D:/code/smart-scheduling',
        SiteRoot: 'D:/code/smart-scheduling/.narada',
        WorkspaceRoot: 'D:/code/smart-scheduling',
        LauncherPath: 'D:/code/smart-scheduling/narada-smart-scheduling.ps1',
        OperatorSurface: 'codex',
      },
      {
        Agent: 'narada.architect',
        Role: 'architect',
        Site: 'narada',
        NaradaRoot: 'D:/code/narada',
        SiteRoot: 'D:/code/narada',
        WorkspaceRoot: 'D:/code/narada',
        LauncherPath: 'D:/code/narada/narada.ps1',
        OperatorSurface: 'codex',
      },
    ],
  }), 'utf8');
  return registry;
}


function launchSelectionFixtureRecords(): WorkspaceLaunchRecord[] {
  return [
    {
      agent: 'sonar.resident',
      title: 'Sonar Resident',
      role: 'resident',
      site: 'sonar',
      narada_root: 'D:/code/narada.sonar',
      site_root: 'D:/code/narada.sonar',
      workspace_root: 'D:/code/narada.sonar',
      launcher_path: 'D:/code/narada.sonar/narada-sonar.ps1',
      operator_surface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      enable_native_shell: false,
      mcp_scope: 'all',
      config_path: 'registry.json',
    },
    {
      agent: 'sonar.architect',
      title: 'Sonar Architect',
      role: 'architect',
      site: 'sonar',
      narada_root: 'D:/code/narada.sonar',
      site_root: 'D:/code/narada.sonar',
      workspace_root: 'D:/code/narada.sonar',
      launcher_path: 'D:/code/narada.sonar/narada-sonar.ps1',
      operator_surface: 'agent-web-ui',
      runtime: 'narada-agent-runtime-server',
      enable_native_shell: false,
      mcp_scope: 'all',
      config_path: 'registry.json',
    },
    {
      agent: 'narada.architect',
      title: 'Narada Architect',
      role: 'architect',
      site: 'narada',
      narada_root: 'D:/code/narada',
      site_root: 'D:/code/narada',
      workspace_root: 'D:/code/narada',
      launcher_path: 'D:/code/narada/narada.ps1',
      operator_surface: 'codex',
      runtime: 'codex',
      enable_native_shell: false,
      mcp_scope: 'all',
      config_path: 'registry.json',
    },
  ] as WorkspaceLaunchRecord[];
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  discoverNarsSessionsMock.mockReset();
});


describe('launcher workspace planning', () => {
  it('refuses launch registry records without explicit operator surface or runtime', async () => {
    const dir = join(process.cwd(), '.ai', 'tmp-tests', `launcher-registry-contract-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    const base = {
      Agent: 'example.resident',
      Role: 'resident',
      Site: 'example',
      NaradaRoot: 'D:/code/example',
      SiteRoot: 'D:/code/example/.narada',
      WorkspaceRoot: 'D:/code/example',
      LauncherPath: 'D:/code/example/narada-example.ps1',
    };
    const missingSurfacePath = join(dir, 'missing-surface.json');
    await writeFile(missingSurfacePath, JSON.stringify({ Agents: [base] }), 'utf8');
    await expect(readLaunchRegistry(missingSurfacePath)).rejects.toThrow('launch_registry_operator_surface_missing');

    const missingRuntimePath = join(dir, 'missing-runtime.json');
    await writeFile(missingRuntimePath, JSON.stringify({ Agents: [{ ...base, OperatorSurface: 'agent-web-ui' }] }), 'utf8');
    await expect(readLaunchRegistry(missingRuntimePath)).rejects.toThrow('launch_registry_runtime_missing');
  });

  it('moves registry selection and Windows Terminal planning into Narada CLI', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as {
      schema: string;
      mutation_performed: boolean;
      selected_agents: Array<{
        agent: string;
        operator_surface_kind: string;
        runtime_host_kind: string;
        launch_operator_surface: string;
        launch_operator_surfaces: string[];
        launch_runtime: string;
        intelligence_selection_authority: {
          schema: string;
          owner: string;
          resolution_phase: string;
          authority_scope: { kind: string; site_id: string | null };
          catalog: { store_kind: string; locator: string };
          launcher_selection: boolean;
          authoritative_inputs: string[];
        };
        launch_session_id: string;
        process_ownership: Record<string, unknown>;
        wait_for_enter_before_exec: boolean;
        runtime_start_execution_mode: string;
        runtime_start_command: string[];
        hidden_runtime_start_command: string[];
        runtime_start_cwd: string;
        wt_args: string[];
        smoke_command: string[];
      }>;
      wt_args: string[];
      ownership: { planner: string; executor: string };
    };
    expect(result.schema).toBe('narada.workspace_launch.plan.v1');
    expect(result.mutation_performed).toBe(false);
    expect(result.ownership.planner).toBe('narada-cli');
    expect(result.ownership.executor).toBe('narada-cli.workspace-launch');
    expect(result.selected_agents).toHaveLength(1);
    expect(result.selected_agents[0].agent).toBe('sonar.resident');
    expect(result.selected_agents[0].operator_surface_kind).toBe('agent-cli');
    expect(result.selected_agents[0].operator_surface).toBe('agent-cli');
    expect(result.selected_agents[0].runtime_host_kind).toBe('narada-agent-runtime-server');
    expect(result.selected_agents[0].launch_operator_surface).toBe('agent-cli');
    expect(result.selected_agents[0].launch_operator_surfaces).toEqual(['agent-cli']);
    expect(result.selected_agents[0].launch_runtime).toBe('narada-agent-runtime-server');
    expect(result.selected_agents[0].intelligence_selection_authority).toEqual({
      schema: 'narada.invokable-intelligence.selection-authority.v1',
      owner: '@narada2/invokable-intelligence-runtime',
      resolution_phase: 'runtime-invocation',
      authority_scope: { kind: 'site', site_id: 'sonar' },
      catalog: {
        store_kind: 'node:sqlite',
        locator: join('D:/code/narada.sonar', '.ai', 'intelligence-registry.db'),
      },
      launcher_selection: false,
      authoritative_inputs: ['invocation-intent', 'catalog', 'materialized-policy', 'runtime-context'],
    });
    expect(result.selected_agents[0].launch_session_id).toMatch(/^launch_/);
    expect(result.selected_agents[0].process_ownership).toMatchObject({
      schema: 'narada.launch_process_ownership.v1',
      launch_session_id: result.selected_agents[0].launch_session_id,
      ownership: 'session_owned',
      process_role: 'workspace_launch_plan',
      cleanup_policy: 'terminate_with_launch_session',
      transfer_policy: 'explicit_only',
      evidence_status: 'complete',
      validation_errors: [],
    });
    expect(result.selected_agents[0].wait_for_enter_before_exec).toBe(false);
    expect(result.selected_agents[0].runtime_start_execution_mode).toBe('hidden_detached');
    expect(result.selected_agents[0].runtime_start_command).toEqual(expect.arrayContaining([
      'pnpm',
      '--dir',
      'D:\\code\\narada',
      'exec',
      'narada',
      'operator-surface',
      'runtime',
      'start',
      'agent-cli',
      '--exec',
    ]));
    expect(result.selected_agents[0].runtime_start_cwd).toBe('D:/code/narada.sonar');
    expect(result.selected_agents[0].wt_args).toEqual([]);
    expect(result.selected_agents[0].hidden_runtime_start_command[0]).toBe(process.execPath);
    expect(result.selected_agents[0].hidden_runtime_start_command[1]).toContain('packages');
    expect(result.selected_agents[0].hidden_runtime_start_command).toEqual(expect.arrayContaining([
      'operator-surface',
      'runtime',
      'start',
      'agent-cli',
      '--runtime',
      'narada-agent-runtime-server',
      '--workspace-root',
      'D:/code/narada.sonar',
      '--launch-session-id',
      result.selected_agents[0].launch_session_id,
    ]));
    expect(result.selected_agents[0].hidden_runtime_start_command).not.toContain('--intelligence-provider');
    expect(result.selected_agents[0].smoke_command).toEqual(expect.arrayContaining([
      'narada',
      'operator-surface',
      'runtime',
      'start',
      'agent-cli',
      '--site-root',
      'D:/code/narada.sonar',
      '--agent',
      'sonar.resident',
      '--runtime',
      'narada-agent-runtime-server',
      '--launch-session-id',
      result.selected_agents[0].launch_session_id,
      '--dry-run',
    ]));
    expect(result.wt_args).toEqual([]);
  });

  it('threads local-site MCP scope into runtime start commands', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['narada'],
      operatorSurface: 'codex',
      runtime: 'codex',
      mcpScope: 'local-site',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ mcp_scope: string; wt_args: string[]; smoke_command: string[] }> };
    const agent = result.selected_agents[0];
    expect(agent.mcp_scope).toBe('local-site');
    const commandText = agent.wt_args[agent.wt_args.indexOf('-Command') + 1];
    expect(commandText).toContain("'--mcp-scope' 'local-site'");
    expect(agent.smoke_command).toEqual(expect.arrayContaining(['--mcp-scope', 'local-site']));
  });

  it('uses registry McpScope as the launch default when no explicit scope is supplied', async () => {
    const dir = join(process.cwd(), '.ai', 'tmp-tests', `launcher-plan-mcp-scope-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    const registryPath = join(dir, 'agents.json');
    await writeFile(registryPath, JSON.stringify({
      NaradaRoot: 'D:/code/narada',
      SiteRoot: 'D:/code/narada',
      WorkspaceRoot: 'D:/code/narada',
      McpScope: 'none',
      Agents: [{ Agent: 'narada.architect', Role: 'architect', Site: 'narada', NaradaRoot: 'D:/code/narada', SiteRoot: 'D:/code/narada', WorkspaceRoot: 'D:/code/narada', LauncherPath: 'D:/code/narada/narada.ps1', OperatorSurface: 'codex', Runtime: 'codex' }],
    }), 'utf8');

    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ mcp_scope: string; wt_args: string[]; smoke_command: string[] }> };
    const agent = result.selected_agents[0];
    expect(agent.mcp_scope).toBe('none');
    expect(agent.wt_args[agent.wt_args.indexOf('-Command') + 1]).toContain("'--mcp-scope' 'none'");
    expect(agent.smoke_command).toEqual(expect.arrayContaining(['--mcp-scope', 'none']));
  });

  it('exposes workspace launch as the CLI-owned execution boundary', async () => {
    const registryPath = await tempRegistry();
    const launch = await workspaceLaunchCommand({
      registryPath,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(launch.exitCode).toBe(ExitCode.SUCCESS);
    const result = launch.result as { selected_agents: Array<{ agent: string }>; windows_terminal_invoked: boolean; wt_args: string[] };
    expect(result.windows_terminal_invoked).toBe(false);
    expect(result.selected_agents.map((agent) => agent.agent)).toEqual(['sonar.resident']);
    expect(result.wt_args).toEqual([]);
    expect(runAgentStartCommandMock).not.toHaveBeenCalled();
  });

  it('launches NARS runtime starts through hidden posture instead of Windows Terminal', async () => {
    const registryPath = await tempRegistry();
    const hiddenLog = join(tempDirs[0], 'hidden-runtime.jsonl');
    const terminalLog = join(tempDirs[0], 'terminal.jsonl');
    const resultPath = join(tempDirs[0], 'workspace-launch-result.json');
    const previousHiddenLog = process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG;
    const previousTerminalLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
    process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG = hiddenLog;
    process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG = terminalLog;
    try {
      const launch = await workspaceLaunchCommand({
        registryPath,
        site: ['sonar'],
        role: ['resident'],
        operatorSurface: 'agent-cli',
        runtime: 'narada-agent-runtime-server',
        resultPath,
        suppressResultOutput: true,
        format: 'json',
      }, createMockContext());

      expect(launch.exitCode).toBe(ExitCode.SUCCESS);
      const result = launch.result as {
        schema: string;
        status: string;
        mode: string;
        mutation_performed: boolean;
        windows_terminal_invoked: boolean;
        hidden_runtime_invoked: boolean;
        hidden_runtime_launches: Array<{ posture: string; windowsHide: boolean }>;
        launch_agents: Array<{ runtime_start_execution_mode: string }>;
        selected_agents: Array<{ runtime_start_execution_mode: string }>;
        selected_agents_authority: string;
        wt_args?: string[];
        operator_terminal_handoff?: { authority: string; wt_args: string[] };
        attachment: { status: string; exact_session: boolean };
      };
      expect(result.schema).toBe('narada.workspace_launch.launch_result.v1');
      expect(result.status).toBe('launched');
      expect(result.mode).toBe('launch');
      expect(result.mutation_performed).toBe(true);
      expect(result.windows_terminal_invoked).toBe(false);
      expect(result.hidden_runtime_invoked).toBe(true);
      expect(result.wt_args).toBeUndefined();
      expect(result.operator_terminal_handoff).toBeUndefined();
      expect(result.attachment).toMatchObject({
        status: 'not_checked',
        exact_session: false,
      });
      expect(result.launch_agents).toEqual(result.selected_agents);
      expect(result.selected_agents_authority).toBe('narada-cli.plan_selection');
      expect(result.selected_agents[0].runtime_start_execution_mode).toBe('hidden_detached');
      expect(result.hidden_runtime_launches[0]).toMatchObject({ posture: 'agent_runtime_server', windowsHide: true });
      expect(runAgentStartCommandMock).toHaveBeenCalledWith(expect.objectContaining({
        siteRoot: 'D:/code/narada.sonar',
        workspaceRoot: 'D:/code/narada.sonar',
        agent: 'sonar.resident',
        runtime: 'narada-agent-runtime-server',
        preflightOnly: true,
      }));
      const hiddenLogText = await readFile(hiddenLog, 'utf8');
      expect(hiddenLogText).toContain('operator-surface');
      const writtenResult = JSON.parse(await readFile(resultPath, 'utf8')) as typeof result;
      expect(writtenResult).toEqual(result);
      expect(writtenResult.schema).toBe('narada.workspace_launch.launch_result.v1');
      expect(writtenResult.status).toBe('launched');
      expect(writtenResult.mode).toBe('launch');
      expect(writtenResult.mutation_performed).toBe(true);
      expect(writtenResult.windows_terminal_invoked).toBe(false);
      expect(writtenResult.hidden_runtime_invoked).toBe(true);
      await expect(readFile(terminalLog, 'utf8')).rejects.toThrow();
    } finally {
      if (previousHiddenLog === undefined) delete process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG;
      else process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG = previousHiddenLog;
      if (previousTerminalLog === undefined) delete process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
      else process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG = previousTerminalLog;
    }
  });

  it('surfaces a Site intelligence catalog preflight refusal before spawning a NARS runtime', async () => {
    const registryPath = await tempRegistry();
    const resultPath = join(tempDirs[0], 'catalog-preflight-failure.json');
    runAgentStartCommandMock.mockReturnValueOnce({
      schema: 'narada.agent_start.command_result.v0',
      status: 'failed',
      mutation_performed: false,
      site_root: 'D:/code/narada.sonar',
      agent: 'sonar.resident',
      carrier: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      command: [],
      parsed_result: {
        schema: 'narada.agent_start.intelligence_catalog_preflight.v1',
        status: 'failed',
        reason_code: 'intelligence_catalog_not_ready',
        reason: 'Site intelligence catalog is not initialized.',
        recovery: {
          kind: 'user_site_intelligence_catalog_bootstrap',
          primary_command: 'narada onboarding start --platform windows --scope user-site',
          followup_command: 'retry the launch',
        },
      },
    });

    await expect(workspaceLaunchCommand({
      registryPath,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      resultPath,
      format: 'json',
    }, createMockContext())).rejects.toThrow(
      'workspace_launch_catalog_preflight_failed: sonar.resident: intelligence_catalog_not_ready: Site intelligence catalog is not initialized. Recovery: narada onboarding start --platform windows --scope user-site; then retry the launch',
    );
    const failure = JSON.parse(await readFile(resultPath, 'utf8')) as {
      schema: string;
      status: string;
      mutation_performed: boolean;
      transaction: { state: string; history: string[] };
      failure: { schema: string; stage: string; reason_code: string; artifact_status: string; rollback: { completed: boolean } };
    };
    expect(failure).toMatchObject({
      schema: 'narada.workspace_launch.failure.v1',
      status: 'failed',
      mutation_performed: false,
      transaction: { state: 'failed', history: ['planned', 'failed'] },
      failure: {
        schema: 'narada.workspace_launch.failure_evidence.v1',
        stage: 'catalog_preflight',
        reason_code: 'workspace_launch_catalog_preflight_failed',
        artifact_status: 'written',
        rollback: { completed: true },
      },
    });
  });

  it('launches NARS runtime starts through a visible terminal when explicitly requested', async () => {
    const registryPath = await tempRegistry();
    const hiddenLog = join(tempDirs[0], 'visible-request-hidden-runtime.jsonl');
    const terminalLog = join(tempDirs[0], 'visible-request-terminal.jsonl');
    const resultPath = join(tempDirs[0], 'visible-request-result.json');
    const previousHiddenLog = process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG;
    const previousTerminalLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
    process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG = hiddenLog;
    process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG = terminalLog;
    try {
      const launch = await workspaceLaunchCommand({
        registryPath,
        site: ['sonar'],
        role: ['resident'],
        operatorSurface: 'agent-cli',
        runtime: 'narada-agent-runtime-server',
        visibleRuntimeTerminal: true,
        resultPath,
        suppressResultOutput: true,
        format: 'json',
      }, createMockContext());

      expect(launch.exitCode).toBe(ExitCode.SUCCESS);
      const result = launch.result as {
        windows_terminal_invoked: boolean;
        hidden_runtime_invoked: boolean;
        selected_agents: Array<{ runtime_start_execution_mode: string }>;
        operator_terminal_handoff: { wt_args: string[] };
      };
      expect(result.windows_terminal_invoked).toBe(true);
      expect(result.hidden_runtime_invoked).toBe(false);
      expect(result.selected_agents[0].runtime_start_execution_mode).toBe('operator_terminal');
      expect(result.operator_terminal_handoff.wt_args[0]).toBe('new-tab');
      expect(await readFile(terminalLog, 'utf8')).toContain('new-tab');
      await expect(readFile(hiddenLog, 'utf8')).rejects.toThrow();
      expect(JSON.parse(await readFile(resultPath, 'utf8'))).toEqual(result);
    } finally {
      if (previousHiddenLog === undefined) delete process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG;
      else process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG = previousHiddenLog;
      if (previousTerminalLog === undefined) delete process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
      else process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG = previousTerminalLog;
    }
  });

  it('materializes terminal launch results with launch schema and non-overlapping invocation posture', async () => {
    const registryPath = await tempRegistry();
    const terminalLog = join(tempDirs[0], 'terminal-launch.jsonl');
    const resultPath = join(tempDirs[0], 'terminal-launch-result.json');
    const previousTerminalLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
    process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG = terminalLog;
    try {
      const launch = await workspaceLaunchCommand({
        registryPath,
        site: ['narada'],
        role: ['architect'],
        operatorSurface: 'codex',
        runtime: 'codex',
        resultPath,
        suppressResultOutput: true,
        format: 'json',
      }, createMockContext());

      expect(launch.exitCode).toBe(ExitCode.SUCCESS);
      const result = launch.result as {
        schema: string;
        status: string;
        mode: string;
        mutation_performed: boolean;
        windows_terminal_invoked: boolean;
        hidden_runtime_invoked: boolean;
        wt_exit_code: number;
        wt_args?: string[];
        operator_terminal_handoff: { authority: string; wt_args: string[] };
      };
      expect(result).toMatchObject({
        schema: 'narada.workspace_launch.launch_result.v1',
        status: 'launched',
        mode: 'launch',
        mutation_performed: true,
        windows_terminal_invoked: true,
        hidden_runtime_invoked: false,
        wt_exit_code: 0,
      });
      expect(result.wt_args).toBeUndefined();
      expect(result.operator_terminal_handoff.authority).toBe('narada-cli.workspace-launch-executor');
      expect(result.operator_terminal_handoff.wt_args[0]).toBe('new-tab');
      const writtenResult = JSON.parse(await readFile(resultPath, 'utf8')) as typeof result;
      expect(writtenResult).toEqual(result);
      const terminalLogText = await readFile(terminalLog, 'utf8');
      expect(terminalLogText).toContain('new-tab');
    } finally {
      if (previousTerminalLog === undefined) delete process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
      else process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG = previousTerminalLog;
    }
  });

  it('plans agent-cli and agent-web-ui as sibling projections onto one NARS session', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-cli,agent-web-ui',
      runtime: 'narada-agent-runtime-server',
      cloudflareApiBaseUrl: 'https://projection.example.test',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ launch_operator_surfaces: string[]; launch_runtime_host: string; launch_runtime_hosts: string[]; runtime_start_execution_mode: string; hidden_runtime_start_command: string[]; wt_args: string[]; smoke_command: string[]; operator_projection_launch_binding: { path: string; exact_attach_required: boolean }; operator_projection_open_requests: Array<Record<string, unknown>> }>; wt_args: string[] };
    const agent = result.selected_agents[0];
    expect(agent.launch_operator_surfaces).toEqual(['agent-cli', 'agent-web-ui']);
    expect(agent.launch_runtime_host).toBe('narada-agent-runtime-server');
    expect(agent.launch_runtime_hosts).toEqual(['narada-agent-runtime-server']);
    expect(agent.runtime_start_execution_mode).toBe('hidden_detached');
    expect(agent.launch_operator_surfaces).toEqual(['agent-cli', 'agent-web-ui']);
    expect(agent.operator_projection_open_requests).toHaveLength(1);
    expect(agent.operator_projection_open_requests[0]).toMatchObject({
      schema: 'narada.operator_projection_open_request.v1',
      status: 'planned',
      projection_kind: 'browser_url',
      purpose: 'agent_web_ui_attach',
      caller: { command: 'workspace launch' },
      mutation_performed: false,
    });
    expect(agent.wt_args.filter((arg) => arg === ';')).toHaveLength(0);
    const commandText = agent.wt_args.join(' ');
    const webUiCommandText = agent.wt_args[agent.wt_args.lastIndexOf('-Command') + 1];
    expect(commandText).toContain('agent-web-ui: waiting for sonar.resident launch binding, then starting browser projection');
    expect(commandText).toContain("'agent-web-ui' 'attach'");
    expect(commandText).toContain("'--launch-binding'");
    expect(webUiCommandText).not.toContain("'--agent' 'sonar.resident'");
    expect(commandText).toContain("'--wait-for-session-ms' '60000'");
    expect(commandText).toContain("'--open'");
    expect(commandText).toContain("'--cloudflare-api-base-url' 'https://projection.example.test'");
    expect(commandText).toContain("'--launch-binding'");
    expect(agent.smoke_command).toContain('--launch-binding');
    expect(agent.operator_projection_launch_binding.exact_attach_required).toBe(true);
    expect(agent.operator_projection_launch_binding.path).toContain('operator-projection-launch-bindings');
    expect(agent.launch_session_id).toMatch(/^launch_/);
    expect(agent.process_ownership).toMatchObject({
      schema: 'narada.launch_process_ownership.v1',
      launch_session_id: agent.launch_session_id,
      ownership: 'session_owned',
      process_role: 'workspace_launch_plan',
      cleanup_policy: 'terminate_with_launch_session',
      transfer_policy: 'explicit_only',
      evidence_status: 'complete',
      validation_errors: [],
    });
    expect(webUiCommandText).not.toContain(';');
    expect(webUiCommandText).toContain('\n& ');
    expect(agent.hidden_runtime_start_command).toEqual(expect.arrayContaining([
      'operator-surface',
      'runtime',
      'start',
      'agent-cli',
      '--runtime',
      'narada-agent-runtime-server',
      '--launch-binding',
    ]));
    expect(result.wt_args.filter((arg) => arg === ';')).toHaveLength(0);
  });

  it('renders canonical identity in agent-web-ui launcher prose for site-local agents', async () => {
    const dir = join(process.cwd(), '.ai', 'tmp-tests', `launcher-local-agent-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    const registryPath = join(dir, 'agents.json');
    await writeFile(registryPath, JSON.stringify({
      Site: 'sonar',
      McpScope: 'all',
      NaradaRoot: 'D:/code/narada.sonar',
      SiteRoot: 'D:/code/narada.sonar',
      WorkspaceRoot: 'D:/code/narada.sonar',
      Agents: [
        {
          Agent: 'resident',
          Role: 'resident',
          Title: 'Sonar Resident',
          LauncherPath: 'D:/code/narada.sonar/narada-sonar.ps1',
          OperatorSurface: 'agent-cli',
          Runtime: 'narada-agent-runtime-server',
        },
      ],
    }), 'utf8');

    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-cli,agent-web-ui',
      runtime: 'narada-agent-runtime-server',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ agent: string; agent_identity_ref: { canonical_agent_id: string }; wt_args: string[] }> };
    const agent = result.selected_agents[0];
    expect(agent.agent).toBe('resident');
    expect(agent.agent_identity_ref.canonical_agent_id).toBe('sonar.resident');
    const commandText = agent.wt_args.join(' ');
    const webUiCommandText = agent.wt_args[agent.wt_args.lastIndexOf('-Command') + 1];
    expect(titleValues(agent.wt_args)).toEqual(['sonar.resident web ui']);
    expect(commandText).toContain('agent-web-ui: waiting for sonar.resident launch binding, then starting browser projection');
    expect(commandText).toContain("'--launch-binding'");
    expect(webUiCommandText).not.toContain("'--agent' 'resident'");
    expect(commandText).not.toContain('waiting for resident launch binding');
  });

  it('uses canonical identity in runtime and web-ui titles for prefixed agents', async () => {
    const dir = join(process.cwd(), '.ai', 'tmp-tests', `launcher-prefixed-agent-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    const registryPath = join(dir, 'agents.json');
    await writeFile(registryPath, JSON.stringify({
      NaradaRoot: 'D:/code/narada',
      McpScope: 'all',
      Agents: [{
        Agent: 'smart-scheduling.resident',
        Role: 'resident',
        Title: 'Smart Scheduling Resident',
        NaradaRoot: 'D:/code/smart-scheduling',
        SiteRoot: 'D:/code/smart-scheduling/.narada',
        WorkspaceRoot: 'D:/code/smart-scheduling',
        LauncherPath: 'D:/code/smart-scheduling/narada-smart-scheduling.ps1',
        OperatorSurface: 'agent-cli',
        Runtime: 'narada-agent-runtime-server',
      }],
    }), 'utf8');

    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['smart-scheduling'],
      role: ['resident'],
      operatorSurface: 'agent-cli,agent-web-ui',
      runtime: 'narada-agent-runtime-server',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ agent: string; agent_identity_ref: { canonical_agent_id: string }; wt_args: string[] }> };
    const agent = result.selected_agents[0];
    expect(agent.agent).toBe('smart-scheduling.resident');
    expect(agent.agent_identity_ref.canonical_agent_id).toBe('smart-scheduling.resident');
    expect(titleValues(agent.wt_args)).toEqual(['smart-scheduling.resident web ui']);
  });

  it('accepts operator surface as the explicit replacement for carrier', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ operator_surface_kind: string; runtime_host_kind: string; launch_operator_surface: string }> };
    expect(result.selected_agents[0].operator_surface_kind).toBe('agent-cli');
    expect(result.selected_agents[0].runtime_host_kind).toBe('narada-agent-runtime-server');
    expect(result.selected_agents[0].launch_operator_surface).toBe('agent-cli');
  });

  it('uses explicit operator surface input', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-web-ui',
      runtime: 'narada-agent-runtime-server',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ operator_surface_kind: string; launch_operator_surface: string }> };
    expect(result.selected_agents[0].operator_surface_kind).toBe('agent-web-ui');
    expect(result.selected_agents[0].launch_operator_surface).toBe('agent-web-ui');
  });

  it('requires an explicit selection unless a selector or config path is supplied', async () => {
    const registryPath = await tempRegistry();
    await expect(workspaceLaunchPlanCommand({
      registryPath,
      format: 'json',
    }, createMockContext())).rejects.toThrow(/launch_selection_required/);
  });

  it('does not treat empty selector arrays or whitespace as selection intent', async () => {
    expect(hasWorkspaceLaunchSelectionIntent({
      agent: ['', '  '],
      role: [],
      site: [''],
      configPath: ['  '],
    })).toBe(false);

    const registryPath = await tempRegistry();
    await expect(workspaceLaunchPlanCommand({
      registryPath,
      agent: ['', '  '],
      role: [],
      site: [''],
      configPath: [],
      format: 'json',
    }, createMockContext())).rejects.toThrow(/launch_selection_required/);
  });

  it('can hand off a workspace plan through a result file without stdout output', async () => {
    const registryPath = await tempRegistry();
    const resultPath = join(tempDirs[0], 'workspace-plan-result.json');
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-cli',
      runtime: 'nars',
      dryRun: true,
      format: 'json',
      resultPath,
      suppressResultOutput: true,
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { suppress_result_output: boolean; result_path: string; selected_agents: Array<{ agent: string }> };
    expect(result.suppress_result_output).toBe(true);
    expect(result.result_path).toBe(resultPath);
    const written = JSON.parse(await readFile(resultPath, 'utf8')) as typeof result;
    expect(written.selected_agents.map((agent) => agent.agent)).toEqual(['sonar.resident']);
    expect(written.suppress_result_output).toBe(true);
  });

  it('treats site and role filters as bounded selectors', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ agent: string }> };
    expect(result.selected_agents.map((agent) => agent.agent)).toEqual(['sonar.resident']);
  });

  it('admits agent-web-ui as a projection over the NARS runtime host', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-web-ui',
      runtime: 'narada-agent-runtime-server',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { wt_args: string[]; selected_agents: Array<{ operator_surface: string; launch_operator_surface: string; launch_operator_surfaces: string[]; launch_runtime_host: string; launch_runtime_hosts: string[]; runtime_start_execution_mode: string; terminal_tabs: unknown[]; operator_projection_start_command?: string[] }> };
    const agent = result.selected_agents[0];
    expect(agent.operator_surface).toBe('agent-web-ui');
    expect(agent.launch_operator_surface).toBe('agent-web-ui');
    expect(agent.launch_operator_surfaces).toEqual(['agent-web-ui']);
    expect(agent.launch_runtime_host).toBe('narada-agent-runtime-server');
    expect(agent.launch_runtime_hosts).toEqual(['narada-agent-runtime-server']);
    expect(result.wt_args).toEqual([]);
    expect(agent.runtime_start_execution_mode).toBe('hidden_detached');
    expect(agent.terminal_tabs).toEqual([]);
    expect(agent.operator_projection_start_command).toEqual(expect.arrayContaining([
      'agent-web-ui',
      'attach',
      '--launch-binding',
      '--ready-file',
    ]));
  });

  it('plans Web UI-only launches as a hidden shared runtime plus structured projection', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-web-ui',
      runtime: 'narada-agent-runtime-server',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as {
      wt_args: string[];
      selected_agents: Array<{
        runtime_start_execution_mode: string;
        terminal_tabs: unknown[];
        operator_projection_start_command?: string[];
        launch_operator_surfaces: string[];
      }>;
    };
    expect(result.wt_args).toEqual([]);
    expect(result.selected_agents).toHaveLength(1);
    expect(result.selected_agents[0].runtime_start_execution_mode).toBe('hidden_detached');
    expect(result.selected_agents[0].terminal_tabs).toEqual([]);
    expect(result.selected_agents[0].launch_operator_surfaces).toEqual(['agent-web-ui']);
    expect(result.selected_agents[0].operator_projection_start_command).toEqual(expect.arrayContaining([
      'pnpm',
      'exec',
      'narada',
      'agent-web-ui',
      'attach',
      '--launch-binding',
      '--ready-file',
    ]));
  });

  it('propagates User Site onboarding mode only to the browser projection', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-web-ui',
      runtime: 'narada-agent-runtime-server',
      onboarding: true,
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ onboarding_mode: string | null; operator_projection_start_command?: string[] }> };
    const agent = result.selected_agents[0];
    expect(agent.onboarding_mode).toBe('user-site');
    expect(agent.operator_projection_start_command).toContain('--onboarding');
  });

  it('refuses direct CLI multi-surface selections that cross runtime families', async () => {
    const registryPath = await tempRegistry();
    await expect(workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'codex,agent-web-ui',
      runtime: 'codex',
      dryRun: true,
      format: 'json',
    }, createMockContext())).rejects.toThrow('workspace_launch_operator_surface_runtime_mismatch');
  });

  it('materializes per-Site catalog authority without selecting offerings in launcher plans', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      site: ['sonar', 'smart-scheduling'],
      role: ['resident'],
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ agent: string; launch_operator_surface: string; launch_runtime: string; launch_runtime_host: string; intelligence_selection_authority: Record<string, unknown>; selection_resolution: { intelligence: unknown }; hidden_runtime_start_command: string[]; wt_args: string[]; smoke_command: string[] }> };
    const sonar = result.selected_agents.find((agent) => agent.agent === 'sonar.resident');
    const smartScheduling = result.selected_agents.find((agent) => agent.agent === 'smart-scheduling.resident');
    expect(sonar?.launch_operator_surface).toBe('agent-cli');
    expect(sonar?.launch_runtime).toBe('narada-agent-runtime-server');
    expect(sonar?.launch_runtime_host).toBe('narada-agent-runtime-server');
    expect(sonar?.intelligence_selection_authority).toEqual(
      expectedIntelligenceSelectionAuthority('sonar', 'D:/code/narada.sonar'),
    );
    expect(sonar?.selection_resolution.intelligence).toEqual(sonar?.intelligence_selection_authority);
    expect(sonar?.hidden_runtime_start_command).not.toContain('--intelligence-provider');
    expect(sonar?.smoke_command).not.toContain('--intelligence-provider');
    expect(smartScheduling?.launch_operator_surface).toBe('codex');
    expect(smartScheduling?.launch_runtime).toBe('codex');
    expect(smartScheduling?.launch_runtime_host).toBe('codex');
    expect(smartScheduling?.intelligence_selection_authority).toEqual(
      expectedIntelligenceSelectionAuthority('smart-scheduling', 'D:/code/smart-scheduling/.narada'),
    );
    expect(smartScheduling?.selection_resolution.intelligence).toEqual(smartScheduling?.intelligence_selection_authority);
    expect(smartScheduling?.wt_args.join(' ')).not.toContain('--intelligence-provider');
    expect(smartScheduling?.smoke_command).not.toContain('--intelligence-provider');
  });

  it('keeps catalog authority stable across NARS operator surfaces without offering projection', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      agent: ['sonar.resident'],
      operatorSurface: 'agent-web-ui',
      runtime: 'narada-agent-runtime-server',
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ intelligence_selection_authority: Record<string, unknown>; selection_resolution: { intelligence: unknown }; runtime_start_command: string[]; smoke_command: string[] }> };
    const selected = result.selected_agents[0];
    expect(selected.intelligence_selection_authority).toEqual(
      expectedIntelligenceSelectionAuthority('sonar', 'D:/code/narada.sonar'),
    );
    expect(selected.selection_resolution.intelligence).toEqual(selected.intelligence_selection_authority);
    expect(selected).not.toHaveProperty('intelligence_provider');
    expect(selected.intelligence_selection_authority).not.toHaveProperty('inference_provider');
    expect(selected.intelligence_selection_authority).not.toHaveProperty('model');
    expect(selected.runtime_start_command).not.toContain('--intelligence-provider');
    expect(selected.smoke_command).not.toContain('--intelligence-provider');
  });

  it('does not require a legacy provider registry to plan launches', () => {
    const record = {
      ...launchSelectionFixtureRecords()[0],
      agent_identity_ref: { canonical_agent_id: 'sonar.resident' },
    } as unknown as WorkspaceLaunchRecord;
    const context = {
      admission: createWorkspaceLaunchAdmissionPolicy(),
    };

    const plan = buildAgentPlan(record, {
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
    }, context);
    expect(plan.intelligence_selection_authority).toEqual(
      expectedIntelligenceSelectionAuthority('sonar', 'D:/code/narada.sonar'),
    );
  });

  it('refuses launch planning when canonical identity is absent', () => {
    const record = {
      ...launchSelectionFixtureRecords()[0],
      agent_identity_ref: undefined,
    } as unknown as WorkspaceLaunchRecord;
    const context = {
      admission: createWorkspaceLaunchAdmissionPolicy(),
    };

    expect(() => buildAgentPlan(record, {
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
    }, context)).toThrow('workspace_launch_agent_identity_missing: sonar.resident');
  });

  it('fences nars as a compatibility alias for narada-agent-runtime-server', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-cli',
      runtime: 'nars',
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ launch_runtime: string; hidden_runtime_start_command: string[]; wt_args: string[]; smoke_command: string[] }> };
    expect(result.selected_agents[0].launch_runtime).toBe('narada-agent-runtime-server');
    const commandText = result.selected_agents[0].hidden_runtime_start_command.join(' ');
    expect(commandText).toContain('--runtime narada-agent-runtime-server');
    expect(commandText).not.toContain(' nars ');
    expect(result.selected_agents[0].smoke_command).toContain('narada-agent-runtime-server');
    expect(result.selected_agents[0].smoke_command).not.toContain('nars');
  });

  it('selects any listed site and any listed role while intersecting dimensions', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      site: ['sonar', 'smart-scheduling'],
      role: ['resident', 'builder'],
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ agent: string }> };
    expect(result.selected_agents.map((agent) => agent.agent)).toEqual([
      'sonar.resident',
      'smart-scheduling.resident',
    ]);
  });

  it('preserves selected agent order and wait-gate override', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      agent: ['narada.architect', 'sonar.resident'],
      noWaitForEnterBeforeExec: true,
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ agent: string; wt_args: string[] }>; wt_args: string[] };
    expect(result.selected_agents.map((agent) => agent.agent)).toEqual(['narada.architect', 'sonar.resident']);
    const commandText = result.selected_agents[0].wt_args[result.selected_agents[0].wt_args.indexOf('-Command') + 1];
    expect(commandText).not.toContain("'--wait'");
    expect(result.wt_args).toContain(';');
  });

  it('aggregates workspace smoke through operator-surface runtime dry-run without opening terminals', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      agent: ['sonar.resident'],
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      smoke: true,
      format: 'json',
    }, createMockContext());

    expect([ExitCode.SUCCESS, ExitCode.GENERAL_ERROR]).toContain(plan.exitCode);
    const result = plan.result as {
      schema: string;
      mutation_performed: boolean;
      windows_terminal_invoked: boolean;
      agents: Array<{
        agent: string;
        operator_surface_runtime_start: { schema: string; mutation_performed: boolean; mode: string; operator_surface_kind: string; runtime_host_kind: string; target_site_id: string };
        operator_surface_start: { schema: string; mutation_performed: boolean; mode: string; operator_surface_kind: string; runtime_host_kind: string; target_site_id: string };
      }>;
      ownership: { smoke_aggregator: string };
    };
    expect(result.schema).toBe('narada.workspace_launch.smoke.v1');
    expect(result.mutation_performed).toBe(false);
    expect(result.windows_terminal_invoked).toBe(false);
    expect(result.ownership.smoke_aggregator).toBe('narada-cli');
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].agent).toBe('sonar.resident');
    expect(result.agents[0].operator_surface_runtime_start.schema).toBe('narada.operator_surface.runtime_start_result.v1');
    expect(result.agents[0].operator_surface_runtime_start.mutation_performed).toBe(false);
    expect(result.agents[0].operator_surface_runtime_start.mode).toBe('dry_run');
    expect(result.agents[0].operator_surface_runtime_start.operator_surface_kind).toBe('agent-cli');
    expect(result.agents[0].operator_surface_runtime_start.runtime_host_kind).toBe('narada-agent-runtime-server');
    expect(result.agents[0].operator_surface_runtime_start.target_site_id).toBe('sonar');
    expect(result.agents[0].operator_surface_start).toBe(result.agents[0].operator_surface_runtime_start);
  });

  it('refuses agent-cli as a runtime override', async () => {
    const registryPath = await tempRegistry();
    await expect(workspaceLaunchPlanCommand({
      registryPath,
      agent: ['sonar.resident'],
      runtime: 'agent-cli',
      format: 'json',
    }, createMockContext())).rejects.toThrow(/runtime_carrier_conflation_refused/);
  });

  it('plans agent-tui as an attach-only projection terminal over hidden NARS', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      agent: ['sonar.resident'],
      operatorSurface: 'agent-tui',
      runtime: 'narada-agent-runtime-server',
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as {
      wt_args: string[];
      selected_agents: Array<{
        runtime_start_execution_mode: string;
        terminal_tabs: Array<{ title: string; command_argv: string[]; command_authority: string }>;
        operator_projection_launch_binding: { path: string; exact_attach_required: boolean };
      }>;
    };
    const agent = result.selected_agents[0];
    expect(agent.runtime_start_execution_mode).toBe('hidden_detached');
    expect(agent.terminal_tabs).toHaveLength(1);
    expect(agent.terminal_tabs[0]).toMatchObject({
      title: 'sonar.resident agent-tui',
      command_authority: 'projection_only',
    });
    expect(agent.terminal_tabs[0].command_argv).toEqual(expect.arrayContaining([
      'cargo',
      'run',
      '--bin',
      'narada-agent-tui',
      '--launch-binding',
      '--identity',
      'sonar.resident',
    ]));
    expect(agent.terminal_tabs[0].command_argv.some((arg) => /agent-tui[\\/]Cargo\.toml$/.test(arg))).toBe(true);
    expect(agent.operator_projection_launch_binding.exact_attach_required).toBe(true);
    expect(result.wt_args.join('\n')).toContain(agent.operator_projection_launch_binding.path);
  });

  it('explains runtime MCP fabric as authoritative over capability projections', async () => {
    const siteRoot = await tempSiteWithDivergentMcpAuthority();
    const explanation = await explainMcpCommand({
      siteRoot,
      server: 'narada-test-local-filesystem',
      format: 'json',
    }, createMockContext());

    expect(explanation.exitCode).toBe(ExitCode.SUCCESS);
    const result = explanation.result as {
      status: string;
      authority_boundary: {
        runtime_authoritative_fabric: string;
        projection_runtime_authoritative: boolean;
      };
      runtime_fabric: { servers: Record<string, { allowed_roots: string[] }> };
      projection_registration: { servers: Record<string, { allowed_roots: string[] }> };
      comparison: {
        security_sensitive_mismatch_count: number;
        server_comparisons: Array<{ server_name: string; security_sensitive_drift: boolean }>;
      };
    };
    expect(result.status).toBe('projection_drift');
    expect(result.authority_boundary.runtime_authoritative_fabric).toBe(join(siteRoot, '.ai', 'mcp'));
    expect(result.authority_boundary.projection_runtime_authoritative).toBe(false);
    expect(result.runtime_fabric.servers['narada-test-local-filesystem'].allowed_roots).toEqual([join(siteRoot, 'runtime-root')]);
    expect(result.projection_registration.servers['narada-test-local-filesystem'].allowed_roots).toEqual([join(siteRoot, 'projection-only-root')]);
    expect(result.comparison.security_sensitive_mismatch_count).toBe(1);
    expect(result.comparison.server_comparisons[0]).toMatchObject({
      server_name: 'narada-test-local-filesystem',
      security_sensitive_drift: true,
    });
  });
});
