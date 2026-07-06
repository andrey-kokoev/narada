import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { explainMcpCommand, hasWorkspaceLaunchSelectionIntent, initialOperatorSurfaceValues, initialRoleValuesForInteractiveSelection, intelligenceProviderChoices, intelligenceProviderChoicesForLaunchSelection, normalizeInteractiveOperatorSurfaceValues, registryDefaultIntelligenceProviderLabel, registryDefaultOperatorSurfaceLabel, registryDefaultRuntimeLabel, roleChoicesForSelectedSites, workspaceLaunchCommand, workspaceLaunchPlanCommand, workspaceLaunchRuntimeObservations, workspaceLaunchSelectorModel, type WorkspaceLaunchBrowserSelection, type WorkspaceLaunchRecord } from '../../src/commands/launcher.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

const discoverNarsSessionsMock = vi.hoisted(() => vi.fn());

vi.mock('@narada2/carrier-runtime/nars-session-index', () => ({
  discoverNarsSessions: discoverNarsSessionsMock,
}));

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

async function tempRegistry(): Promise<string> {
  const dir = join(process.cwd(), '.ai', 'tmp-tests', `launcher-plan-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  const registry = join(dir, 'agents.json');
  await writeFile(registry, JSON.stringify({
    NaradaRoot: 'C:/Users/Andrey/Narada',
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
      },
      {
        Agent: 'narada.architect',
        Role: 'architect',
        Site: 'narada',
        NaradaRoot: 'D:/code/narada',
        SiteRoot: 'D:/code/narada',
        WorkspaceRoot: 'D:/code/narada',
      },
    ],
  }), 'utf8');
  return registry;
}

function expectLegacyCarrierCompatibility(value: unknown): void {
  expect(value).toMatchObject({
    schema: 'narada.workspace_launch.legacy_carrier_compatibility.v1',
    status: 'compatibility_fields_present',
    canonical_terms: {
      operator_surface: 'operator_surface',
      runtime_host: 'runtime_host',
    },
    compatibility_paths: {
      command_aliases: ['--carrier', 'carrier start'],
      runtime_aliases: ['nars'],
      status: 'fenced_compatibility',
    },
    compatibility_note: expect.stringContaining('fenced compatibility paths'),
    deprecated_fields: expect.arrayContaining(['carrier', 'launch_carrier', 'launch_carriers', 'launch_runtime']),
    replacement_fields: expect.objectContaining({
      carrier: 'operator_surface',
      launch_carrier: 'launch_operator_surface',
      launch_carriers: 'launch_operator_surfaces',
      launch_runtime: 'launch_runtime_host',
    }),
    removal_policy: 'remove_after_consumers_migrate',
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  discoverNarsSessionsMock.mockReset();
});

async function withObservationPollBudget<T>(budgetMs: number, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_MS;
  process.env.NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_MS = String(budgetMs);
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_MS;
    else process.env.NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_MS = previous;
  }
}

describe('launcher workspace planning', () => {
  it('moves registry selection and Windows Terminal planning into Narada CLI', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      intelligenceProvider: 'codex-subscription',
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
        launch_carrier: string;
        launch_runtime: string;
        launch_carriers: string[];
        legacy_carrier_compatibility: {
          schema: string;
          status: string;
          deprecated_fields: string[];
          replacement_fields: Record<string, string>;
        };
        intelligence_provider: string;
        wt_args: string[];
        smoke_command: string[];
      }>;
      wt_args: string[];
      compatibility: {
        schema: string;
        deprecated_fields: string[];
        replacement_fields: Record<string, string>;
      };
      ownership: { planner: string; executor: string };
    };
    expect(result.schema).toBe('narada.workspace_launch.plan.v1');
    expect(result.mutation_performed).toBe(false);
    expect(result.ownership.planner).toBe('narada-cli');
    expect(result.ownership.executor).toBe('narada-cli.workspace-launch');
    expectLegacyCarrierCompatibility(result.compatibility);
    expect(result.selected_agents).toHaveLength(1);
    expect(result.selected_agents[0].agent).toBe('sonar.resident');
    expect(result.selected_agents[0].operator_surface_kind).toBe('agent-cli');
    expect(result.selected_agents[0].operator_surface).toBe('agent-cli');
    expect(result.selected_agents[0].runtime_host_kind).toBe('narada-agent-runtime-server');
    expect(result.selected_agents[0].launch_operator_surface).toBe('agent-cli');
    expect(result.selected_agents[0].launch_operator_surfaces).toEqual(['agent-cli']);
    expect(result.selected_agents[0].launch_carrier).toBe('agent-cli');
    expect(result.selected_agents[0].launch_carriers).toEqual(['agent-cli']);
    expectLegacyCarrierCompatibility(result.selected_agents[0].legacy_carrier_compatibility);
    expect(result.selected_agents[0].launch_runtime).toBe('narada-agent-runtime-server');
    expect(result.selected_agents[0].intelligence_provider).toBe('codex-subscription');
    expect(result.selected_agents[0].wt_args).toEqual(expect.arrayContaining([
      'pwsh',
      '-NoExit',
      '-Command',
    ]));
    const commandText = result.selected_agents[0].wt_args[result.selected_agents[0].wt_args.indexOf('-Command') + 1];
    expect(commandText).toContain("& 'pnpm' '--dir' 'D:\\code\\narada' 'exec' 'narada' 'operator-surface' 'runtime' 'start'");
    expect(commandText).toContain("'agent-cli'");
    expect(commandText).toContain("'--runtime' 'narada-agent-runtime-server'");
    expect(commandText).toContain("'--workspace-root' 'D:/code/narada.sonar'");
    expect(commandText).toContain("'--exec'");
    expect(commandText).toContain("'--wait'");
    expect(commandText).toContain("'--intelligence-provider' 'codex-subscription'");
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
      '--dry-run',
    ]));
    expect(result.wt_args[0]).toBe('new-tab');
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
      Agents: [{ Agent: 'narada.architect', Role: 'architect', Site: 'narada', OperatorSurface: 'codex', Runtime: 'codex' }],
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
    expect(result.wt_args[0]).toBe('new-tab');
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
    const result = plan.result as { selected_agents: Array<{ launch_operator_surfaces: string[]; launch_runtime_host: string; launch_runtime_hosts: string[]; launch_carriers: string[]; legacy_carrier_compatibility: unknown; wt_args: string[]; operator_projection_open_requests: Array<Record<string, unknown>> }>; wt_args: string[] };
    const agent = result.selected_agents[0];
    expect(agent.launch_operator_surfaces).toEqual(['agent-cli', 'agent-web-ui']);
    expect(agent.launch_runtime_host).toBe('narada-agent-runtime-server');
    expect(agent.launch_runtime_hosts).toEqual(['narada-agent-runtime-server']);
    expect(agent.launch_carriers).toEqual(['agent-cli', 'agent-web-ui']);
    expectLegacyCarrierCompatibility(agent.legacy_carrier_compatibility);
    expect(agent.operator_projection_open_requests).toHaveLength(1);
    expect(agent.operator_projection_open_requests[0]).toMatchObject({
      schema: 'narada.operator_projection_open_request.v1',
      status: 'planned',
      projection_kind: 'browser_url',
      purpose: 'agent_web_ui_attach',
      caller: { command: 'workspace launch' },
      mutation_performed: false,
    });
    expect(agent.wt_args.filter((arg) => arg === ';')).toHaveLength(1);
    const commandText = agent.wt_args.join(' ');
    const webUiCommandText = agent.wt_args[agent.wt_args.lastIndexOf('-Command') + 1];
    expect(commandText).toContain("'operator-surface' 'runtime' 'start' 'agent-cli'");
    expect(commandText).toContain("'--target-site-id' 'sonar'");
    expect(commandText).toContain("'--runtime' 'narada-agent-runtime-server'");
    expect(commandText).toContain('agent-web-ui: waiting for sonar.resident NARS session, then starting browser projection');
    expect(commandText).toContain("'agent-web-ui' 'attach'");
    expect(commandText).toContain("'--agent' 'sonar.resident'");
    expect(commandText).toContain("'--wait-for-session-ms' '60000'");
    expect(commandText).toContain("'--open'");
    expect(commandText).toContain("'--cloudflare-api-base-url' 'https://projection.example.test'");
    expect(webUiCommandText).not.toContain(';');
    expect(webUiCommandText).toContain('\n& ');
    expect(result.wt_args.filter((arg) => arg === ';')).toHaveLength(1);
  });

  it('renders canonical identity in agent-web-ui launcher prose for site-local agents', async () => {
    const dir = join(process.cwd(), '.ai', 'tmp-tests', `launcher-local-agent-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    const registryPath = join(dir, 'agents.json');
    await writeFile(registryPath, JSON.stringify({
      Site: 'sonar',
      NaradaRoot: 'D:/code/narada.sonar',
      SiteRoot: 'D:/code/narada.sonar',
      WorkspaceRoot: 'D:/code/narada.sonar',
      Agents: [
        {
          Agent: 'resident',
          Role: 'resident',
          Title: 'Sonar Resident',
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
    expect(commandText).toContain('agent-web-ui: waiting for sonar.resident NARS session, then starting browser projection');
    expect(commandText).toContain("'--agent' 'resident'");
    expect(commandText).not.toContain('waiting for resident NARS session');
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
    const result = plan.result as { selected_agents: Array<{ operator_surface_kind: string; runtime_host_kind: string; launch_operator_surface: string; launch_carrier: string }> };
    expect(result.selected_agents[0].operator_surface_kind).toBe('agent-cli');
    expect(result.selected_agents[0].runtime_host_kind).toBe('narada-agent-runtime-server');
    expect(result.selected_agents[0].launch_operator_surface).toBe('agent-cli');
    expect(result.selected_agents[0].launch_carrier).toBe('agent-cli');
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
    const result = plan.result as { selected_agents: Array<{ operator_surface_kind: string; launch_operator_surface: string; launch_carrier: string }> };
    expect(result.selected_agents[0].operator_surface_kind).toBe('agent-web-ui');
    expect(result.selected_agents[0].launch_operator_surface).toBe('agent-web-ui');
    expect(result.selected_agents[0].launch_carrier).toBe('agent-web-ui');
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

  it('defaults to interactive selection only when no selector intent is supplied', async () => {
    const registryPath = await tempRegistry();
    await expect(workspaceLaunchPlanCommand({
      registryPath,
      defaultInteractiveSelection: true,
      format: 'json',
    }, createMockContext())).rejects.toThrow(/interactive_selection_requires_tty/);

    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      defaultInteractiveSelection: true,
      site: ['sonar'],
      role: ['resident'],
      format: 'json',
    }, createMockContext());
    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { interactive_selection: boolean; selected_agents: Array<{ agent: string }> };
    expect(result.interactive_selection).toBe(false);
    expect(result.selected_agents.map((agent) => agent.agent)).toEqual(['sonar.resident']);
  });

  it('refuses interactive selection outside an interactive terminal', async () => {
    const registryPath = await tempRegistry();
    await expect(workspaceLaunchPlanCommand({
      registryPath,
      interactiveSelection: true,
      format: 'json',
    }, createMockContext())).rejects.toThrow(/interactive_selection_requires_tty/);
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

  it('narrows interactive role choices to roles admitted by the selected site aliases', () => {
    const records = [
      { agent: 'sonar.resident', role: 'resident', site: 'narada-sonar' },
      { agent: 'sonar.architect', role: 'architect', site: 'narada-sonar' },
      { agent: 'smart-scheduling.builder', role: 'builder', site: 'smart-scheduling' },
    ].map((record) => ({
      ...record,
      title: record.agent,
      narada_root: 'D:/code/narada',
      site_root: 'D:/code/narada',
      workspace_root: 'D:/code/narada',
      launcher_path: 'D:/code/narada/narada.ps1',
      carrier: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      enable_native_shell: false,
      config_path: 'registry.json',
    })) as WorkspaceLaunchRecord[];

    expect(roleChoicesForSelectedSites(records, ['sonar'])).toEqual(['resident', 'architect']);
    expect(roleChoicesForSelectedSites(records, ['smart-scheduling'])).toEqual(['builder']);
  });

  it('preselects resident in the interactive role selector when no explicit role is provided', () => {
    expect(initialRoleValuesForInteractiveSelection(['resident', 'architect'])).toEqual(['resident']);
    expect(initialRoleValuesForInteractiveSelection(['builder', 'architect'])).toEqual([]);
    expect(initialRoleValuesForInteractiveSelection(['resident', 'architect'], ['architect'])).toEqual(['architect']);
  });

  it('labels registry default operator surface with resolved selected-record surfaces', () => {
    const records = [
      { operator_surface: 'agent-cli' },
      { operator_surface: 'agent-web-ui' },
      { operator_surface: 'agent-cli' },
    ] as WorkspaceLaunchRecord[];

    expect(registryDefaultOperatorSurfaceLabel(records)).toBe('registry default (agent-cli, agent-web-ui)');
    expect(registryDefaultOperatorSurfaceLabel([])).toBe('registry default');
  });

  it('labels registry default runtime with resolved selected-record runtimes', () => {
    const records = [
      { runtime: 'narada-agent-runtime-server' },
      { runtime: 'codex' },
      { runtime: 'narada-agent-runtime-server' },
    ] as WorkspaceLaunchRecord[];

    expect(registryDefaultRuntimeLabel(records)).toBe('registry default (narada-agent-runtime-server, codex)');
    expect(registryDefaultRuntimeLabel([])).toBe('registry default');
  });

  it('labels registry default intelligence provider with the provider default', () => {
    expect(registryDefaultIntelligenceProviderLabel('kimi-code-api')).toBe('registry default (kimi-code-api)');
    expect(registryDefaultIntelligenceProviderLabel()).toBe('registry default');
  });

  it('builds a golden shared selector model for default-bearing launch selectors', () => {
    const records = [
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
        carrier: 'agent-cli',
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
        carrier: 'agent-web-ui',
        runtime: 'narada-agent-runtime-server',
        enable_native_shell: false,
        mcp_scope: 'all',
        config_path: 'registry.json',
      },
      {
        agent: 'sonar.legacy',
        title: 'Sonar Legacy',
        role: 'resident',
        site: 'sonar',
        narada_root: 'D:/code/narada.sonar',
        site_root: 'D:/code/narada.sonar',
        workspace_root: 'D:/code/narada.sonar',
        launcher_path: 'D:/code/narada.sonar/narada-sonar.ps1',
        operator_surface: 'codex',
        carrier: 'codex',
        runtime: 'codex',
        enable_native_shell: false,
        mcp_scope: 'all',
        config_path: 'registry.json',
      },
    ] as WorkspaceLaunchRecord[];

    const model = workspaceLaunchSelectorModel(records, { site: ['sonar'], role: ['resident'] });

    expect(model).toMatchObject({
      schema: 'narada.workspace_launch.selector_model.v1',
      selected: {
        site: ['sonar'],
        role: ['resident'],
        operatorSurface: ['registry default'],
        runtime: 'registry default',
        intelligenceProvider: 'registry default',
      },
    });
    expect(model.operatorSurfaceOptions.find((option) => option.value === 'registry default')).toEqual({
      value: 'registry default',
      label: 'registry default (agent-cli, codex)',
      hint: 'use each registry entry value',
    });
    expect(model.runtimeOptions.find((option) => option.value === 'registry default')).toEqual({
      value: 'registry default',
      label: 'registry default (narada-agent-runtime-server, codex)',
      hint: 'use each registry entry value',
    });
    expect(model.intelligenceProviderOptions[0]).toEqual({
      value: 'registry default',
      label: 'registry default (kimi-code-api)',
      hint: 'use default provider kimi-code-api',
    });
    expect(model.operatorSurfaceOptions.map((option) => option.value)).toEqual(expect.arrayContaining(['registry default', 'agent-cli', 'agent-web-ui', 'codex']));
    expect(model.runtimeOptions.map((option) => option.value)).toEqual(expect.arrayContaining(['registry default', 'narada-agent-runtime-server', 'codex']));
  });

  it('normalizes interactive operator surface multiselect values', () => {
    const choices = ['registry default', 'agent-cli', 'agent-web-ui', 'codex'];
    expect(initialOperatorSurfaceValues(choices, undefined)).toEqual(['registry default']);
    expect(initialOperatorSurfaceValues(choices, 'agent-cli,agent-web-ui')).toEqual(['agent-cli', 'agent-web-ui']);
    expect(initialOperatorSurfaceValues(choices, 'agent-web-ui')).toEqual(['agent-web-ui']);
    expect(normalizeInteractiveOperatorSurfaceValues(['agent-web-ui', 'agent-cli'])).toEqual(['agent-web-ui', 'agent-cli']);
    expect(normalizeInteractiveOperatorSurfaceValues(['registry default', 'agent-cli'])).toEqual(['agent-cli']);
    expect(normalizeInteractiveOperatorSurfaceValues(['registry default', 'agent-web-ui'])).toEqual(['agent-web-ui']);
    expect(normalizeInteractiveOperatorSurfaceValues(['registry default', 'agent-cli', 'agent-web-ui'])).toEqual(['agent-cli', 'agent-web-ui']);
  });

  it('admits agent-web-ui as a launch carrier over the NARS runtime host', async () => {
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
    const result = plan.result as { selected_agents: Array<{ operator_surface: string; carrier: string; launch_operator_surface: string; launch_operator_surfaces: string[]; launch_runtime_host: string; launch_runtime_hosts: string[]; launch_carrier: string; launch_carriers: string[]; wt_args: string[] }> };
    const agent = result.selected_agents[0];
    expect(agent.operator_surface).toBe('agent-web-ui');
    expect(agent.carrier).toBe('agent-web-ui');
    expect(agent.launch_operator_surface).toBe('agent-web-ui');
    expect(agent.launch_operator_surfaces).toEqual(['agent-web-ui']);
    expect(agent.launch_runtime_host).toBe('narada-agent-runtime-server');
    expect(agent.launch_runtime_hosts).toEqual(['narada-agent-runtime-server']);
    expect(agent.launch_carrier).toBe('agent-web-ui');
    expect(agent.launch_carriers).toEqual(['agent-web-ui']);
    const commandText = agent.wt_args.join(' ');
    expect(commandText).toContain('resident Runtime');
    expect(commandText).toContain("'operator-surface' 'runtime' 'start' 'agent-web-ui'");
    expect(commandText).toContain("'--target-site-id' 'sonar'");
    expect(commandText).toContain("'agent-web-ui' 'attach'");
    expect(commandText).not.toContain("'--wait'");
  });

  it('classifies runtime observations as waiting, healthy, stale, failed, unowned, or ambiguous', async () => {
    const records = [
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
        carrier: 'agent-cli',
        runtime: 'narada-agent-runtime-server',
        enable_native_shell: false,
        mcp_scope: 'all',
        config_path: 'registry.json',
      },
    ] as WorkspaceLaunchRecord[];
    const selection: WorkspaceLaunchBrowserSelection = {
      site: ['sonar'],
      role: ['resident'],
      operatorSurface: ['agent-cli'],
      runtime: 'narada-agent-runtime-server',
      intelligenceProvider: 'registry default',
    };

    await withObservationPollBudget(0, async () => {
      discoverNarsSessionsMock.mockImplementation(() => ({ sessions: [] }));
      let observations = await workspaceLaunchRuntimeObservations('wla_waiting', selection, records);
      expect(observations).toHaveLength(1);
      expect(observations[0]).toMatchObject({ health: 'waiting', ownership_posture: 'not_yet_observed' });

      discoverNarsSessionsMock.mockImplementation(() => ({ sessions: [{ session_id: 'carrier_sonar_active', agent_id: 'sonar.resident', site_id: 'sonar', site_root: 'D:/code/narada.sonar', display_state: 'active', terminal_state: 'running' }] }));
      observations = await workspaceLaunchRuntimeObservations('wla_healthy', selection, records);
      expect(observations[0]).toMatchObject({ health: 'healthy', ownership_posture: 'owned_by_runtime_authority', session_id: 'carrier_sonar_active' });

      discoverNarsSessionsMock.mockImplementation(() => ({ sessions: [{ session_id: 'carrier_sonar_stale', agent_id: 'sonar.resident', site_id: 'sonar', site_root: 'D:/code/narada.sonar', display_state: 'stale', terminal_state: 'running' }] }));
      observations = await workspaceLaunchRuntimeObservations('wla_stale', selection, records);
      expect(observations[0]).toMatchObject({ health: 'stale', session_id: 'carrier_sonar_stale' });

      discoverNarsSessionsMock.mockImplementation(() => ({ sessions: [{ session_id: 'carrier_sonar_failed', agent_id: 'sonar.resident', site_id: 'sonar', site_root: 'D:/code/narada.sonar', display_state: 'starting_or_degraded', terminal_state: 'running' }] }));
      observations = await workspaceLaunchRuntimeObservations('wla_failed', selection, records);
      expect(observations[0]).toMatchObject({ health: 'failed', session_id: 'carrier_sonar_failed' });

      discoverNarsSessionsMock.mockImplementation(() => ({ sessions: [{ session_id: 'carrier_sonar_unowned', agent_id: 'sonar.architect', site_id: 'sonar', site_root: 'D:/code/narada.sonar', display_state: 'active', terminal_state: 'running' }] }));
      observations = await workspaceLaunchRuntimeObservations('wla_unowned', selection, records);
      expect(observations[0]).toMatchObject({ health: 'unowned', ownership_posture: 'observed_unowned' });

      discoverNarsSessionsMock.mockImplementation(() => ({ sessions: [
        { session_id: 'carrier_sonar_1', agent_id: 'sonar.resident', site_id: 'sonar', site_root: 'D:/code/narada.sonar', display_state: 'active', terminal_state: 'running' },
        { session_id: 'carrier_sonar_2', agent_id: 'sonar.resident', site_id: 'sonar', site_root: 'D:/code/narada.sonar', display_state: 'active', terminal_state: 'running' },
      ] }));
      observations = await workspaceLaunchRuntimeObservations('wla_ambiguous', selection, records);
      expect(observations[0]).toMatchObject({ health: 'ambiguous', ownership_posture: 'not_yet_observed' });
    });
  });

  it('offers registry default plus verified intelligence providers for interactive selection', () => {
    const choices = intelligenceProviderChoices();
    expect(choices[0]).toMatchObject({ value: 'registry default', label: 'registry default (kimi-code-api)' });
    expect(choices.map((choice) => choice.value)).toEqual(expect.arrayContaining([
      'codex-subscription',
      'kimi-code-api',
      'openai-api',
      'deepseek-api',
    ]));
    expect(choices.every((choice) => choice.value && choice.label)).toBe(true);
  });

  it('constrains provider choices to selected NARS operator-surface runtime compatibility', () => {
    const records = [
      { agent: 'sonar.resident', role: 'resident', site: 'sonar', carrier: 'agent-cli', runtime: 'narada-agent-runtime-server' },
      { agent: 'direct.codex', role: 'resident', site: 'direct', carrier: 'codex', runtime: 'codex' },
    ].map((record) => ({
      ...record,
      title: record.agent,
      narada_root: 'D:/code/narada',
      site_root: 'D:/code/narada',
      workspace_root: 'D:/code/narada',
      launcher_path: 'D:/code/narada/narada.ps1',
      enable_native_shell: false,
      config_path: 'registry.json',
    })) as WorkspaceLaunchRecord[];

    const agentCliChoices = intelligenceProviderChoicesForLaunchSelection({
      records: [records[0]],
      operatorSurface: 'registry default',
      runtime: 'registry default',
    }).map((choice) => choice.value);
    expect(agentCliChoices).toEqual(expect.arrayContaining(['registry default', 'codex-subscription', 'kimi-code-api']));
    expect(agentCliChoices).not.toContain('nonexistent-provider');

    const webUiChoices = intelligenceProviderChoicesForLaunchSelection({
      records: [{ ...records[0], carrier: 'agent-web-ui' }],
      operatorSurface: 'registry default',
      runtime: 'registry default',
    }).map((choice) => choice.value);
    expect(webUiChoices).toEqual(expect.arrayContaining(['registry default', 'codex-subscription', 'kimi-code-api']));

    const directCodexChoices = intelligenceProviderChoicesForLaunchSelection({
      records: [records[1]],
      operatorSurface: 'registry default',
      runtime: 'registry default',
    });
    expect(directCodexChoices).toEqual([{ value: 'registry default', label: 'registry default', hint: 'no NARS operator-surface launches selected' }]);
  });

  it('applies selected intelligence providers only to NARS operator-surface launch plans', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      site: ['sonar', 'smart-scheduling'],
      role: ['resident'],
      intelligenceProvider: 'codex-subscription',
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ agent: string; launch_operator_surface: string; launch_carrier: string; launch_runtime: string; launch_runtime_host: string; legacy_carrier_compatibility: unknown; intelligence_provider: string | null; wt_args: string[]; smoke_command: string[] }> };
    const sonar = result.selected_agents.find((agent) => agent.agent === 'sonar.resident');
    const smartScheduling = result.selected_agents.find((agent) => agent.agent === 'smart-scheduling.resident');
    expect(sonar?.launch_operator_surface).toBe('agent-cli');
    expect(sonar?.launch_carrier).toBe('agent-cli');
    expect(sonar?.launch_runtime).toBe('narada-agent-runtime-server');
    expect(sonar?.launch_runtime_host).toBe('narada-agent-runtime-server');
    expectLegacyCarrierCompatibility(sonar?.legacy_carrier_compatibility);
    expect(sonar?.intelligence_provider).toBe('codex-subscription');
    expect(sonar?.wt_args.join(' ')).toContain('--intelligence-provider');
    expect(sonar?.smoke_command).toContain('--intelligence-provider');
    expect(smartScheduling?.launch_operator_surface).toBe('codex');
    expect(smartScheduling?.launch_carrier).toBe('codex');
    expect(smartScheduling?.launch_runtime).toBe('codex');
    expect(smartScheduling?.launch_runtime_host).toBe('codex');
    expectLegacyCarrierCompatibility(smartScheduling?.legacy_carrier_compatibility);
    expect(smartScheduling?.intelligence_provider).toBeNull();
    expect(smartScheduling?.wt_args.join(' ')).not.toContain('--intelligence-provider');
    expect(smartScheduling?.smoke_command).not.toContain('--intelligence-provider');
  });

  it('materializes registry default intelligence provider for NARS operator-surface launch plans', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      agent: ['sonar.resident'],
      operatorSurface: 'agent-web-ui',
      runtime: 'narada-agent-runtime-server',
      format: 'json',
    }, createMockContext());

    expect(plan.exitCode).toBe(ExitCode.SUCCESS);
    const result = plan.result as { selected_agents: Array<{ intelligence_provider: string | null; wt_args: string[]; smoke_command: string[] }> };
    const selected = result.selected_agents[0];
    expect(selected.intelligence_provider).toBe('kimi-code-api');
    expect(selected.wt_args.join(' ')).toContain('--intelligence-provider');
    expect(selected.wt_args.join(' ')).toContain('kimi-code-api');
    expect(selected.smoke_command).toContain('kimi-code-api');
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
    const result = plan.result as { selected_agents: Array<{ launch_runtime: string; wt_args: string[]; smoke_command: string[] }> };
    expect(result.selected_agents[0].launch_runtime).toBe('narada-agent-runtime-server');
    const commandText = result.selected_agents[0].wt_args[result.selected_agents[0].wt_args.indexOf('-Command') + 1];
    expect(commandText).toContain("'--runtime' 'narada-agent-runtime-server'");
    expect(commandText).not.toContain("'nars'");
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
      intelligenceProvider: 'codex-subscription',
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
        legacy_carrier_compatibility: unknown;
        plan: { legacy_carrier_compatibility: unknown };
        operator_surface_runtime_start: { schema: string; mutation_performed: boolean; mode: string; operator_surface_kind: string; runtime_host_kind: string; target_site_id: string };
        operator_surface_start: { schema: string; mutation_performed: boolean; mode: string; operator_surface_kind: string; runtime_host_kind: string; target_site_id: string };
      }>;
      compatibility: unknown;
      ownership: { smoke_aggregator: string };
    };
    expect(result.schema).toBe('narada.workspace_launch.smoke.v1');
    expect(result.mutation_performed).toBe(false);
    expect(result.windows_terminal_invoked).toBe(false);
    expect(result.ownership.smoke_aggregator).toBe('narada-cli');
    expectLegacyCarrierCompatibility(result.compatibility);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].agent).toBe('sonar.resident');
    expectLegacyCarrierCompatibility(result.agents[0].legacy_carrier_compatibility);
    expectLegacyCarrierCompatibility(result.agents[0].plan.legacy_carrier_compatibility);
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
