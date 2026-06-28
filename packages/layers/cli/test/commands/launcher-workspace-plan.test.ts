import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { explainMcpCommand, roleChoicesForSelectedSites, workspaceLaunchPlanCommand, type WorkspaceLaunchRecord } from '../../src/commands/launcher.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

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
        Carrier: 'agent-cli',
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

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('launcher workspace planning', () => {
  it('moves registry selection and Windows Terminal planning into Narada CLI', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      all: true,
      site: ['sonar'],
      role: ['resident'],
      carrier: 'agent-cli',
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
        launch_carrier: string;
        launch_runtime: string;
        intelligence_provider: string;
        wt_args: string[];
        smoke_command: string[];
      }>;
      wt_args: string[];
      ownership: { planner: string; executor: string };
    };
    expect(result.schema).toBe('narada.workspace_launch.plan.v1');
    expect(result.mutation_performed).toBe(false);
    expect(result.ownership.planner).toBe('narada-cli');
    expect(result.ownership.executor).toBe('operator_surface_windows_terminal');
    expect(result.selected_agents).toHaveLength(1);
    expect(result.selected_agents[0].agent).toBe('sonar.resident');
    expect(result.selected_agents[0].operator_surface_kind).toBe('agent-cli');
    expect(result.selected_agents[0].runtime_host_kind).toBe('narada-agent-runtime-server');
    expect(result.selected_agents[0].launch_carrier).toBe('agent-cli');
    expect(result.selected_agents[0].launch_runtime).toBe('narada-agent-runtime-server');
    expect(result.selected_agents[0].intelligence_provider).toBe('codex-subscription');
    expect(result.selected_agents[0].wt_args).toEqual(expect.arrayContaining([
      'pwsh',
      '-NoExit',
      '-Command',
    ]));
    const commandText = result.selected_agents[0].wt_args[result.selected_agents[0].wt_args.indexOf('-Command') + 1];
    expect(commandText).toContain("& 'pnpm' '--dir' 'D:\\code\\narada' 'exec' 'narada' 'carrier' 'start'");
    expect(commandText).toContain("'agent-cli'");
    expect(commandText).toContain("'--runtime' 'narada-agent-runtime-server'");
    expect(commandText).toContain("'--workspace-root' 'D:/code/narada.sonar'");
    expect(commandText).toContain("'--exec'");
    expect(commandText).toContain("'--wait'");
    expect(commandText).toContain("'--intelligence-provider' 'codex-subscription'");
    expect(result.selected_agents[0].smoke_command).toEqual(expect.arrayContaining([
      'narada',
      'carrier',
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
    const result = plan.result as { selected_agents: Array<{ operator_surface_kind: string; runtime_host_kind: string; launch_carrier: string }> };
    expect(result.selected_agents[0].operator_surface_kind).toBe('agent-cli');
    expect(result.selected_agents[0].runtime_host_kind).toBe('narada-agent-runtime-server');
    expect(result.selected_agents[0].launch_carrier).toBe('agent-cli');
  });

  it('refuses conflicting carrier and operator surface inputs', async () => {
    const registryPath = await tempRegistry();
    await expect(workspaceLaunchPlanCommand({
      registryPath,
      site: ['sonar'],
      role: ['resident'],
      carrier: 'codex',
      operatorSurface: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      dryRun: true,
      format: 'json',
    }, createMockContext())).rejects.toThrow(/carrier_operator_surface_conflict/);
  });

  it('requires an explicit selection unless a selector or config path is supplied', async () => {
    const registryPath = await tempRegistry();
    await expect(workspaceLaunchPlanCommand({
      registryPath,
      format: 'json',
    }, createMockContext())).rejects.toThrow(/launch_selection_required/);
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
      carrier: 'agent-cli',
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
      carrier: 'agent-cli',
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

  it('accepts nars as an input alias for narada-agent-runtime-server', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      site: ['sonar'],
      role: ['resident'],
      carrier: 'agent-cli',
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

  it('aggregates workspace smoke through carrier dry-run without opening terminals', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      agent: ['sonar.resident'],
      carrier: 'agent-cli',
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
      agents: Array<{ agent: string; carrier_start: { mutation_performed: boolean; mode: string } }>;
      ownership: { smoke_aggregator: string };
    };
    expect(result.schema).toBe('narada.workspace_launch.smoke.v1');
    expect(result.mutation_performed).toBe(false);
    expect(result.windows_terminal_invoked).toBe(false);
    expect(result.ownership.smoke_aggregator).toBe('narada-cli');
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].agent).toBe('sonar.resident');
    expect(result.agents[0].carrier_start.mutation_performed).toBe(false);
    expect(result.agents[0].carrier_start.mode).toBe('dry_run');
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
