import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceLaunchPlanCommand } from '../../src/commands/launcher.js';
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
        Runtime: 'agent-cli',
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
      runtime: 'agent-cli',
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
    expect(result.selected_agents[0].launch_runtime).toBe('agent-cli');
    expect(result.selected_agents[0].intelligence_provider).toBe('codex-subscription');
    expect(result.selected_agents[0].wt_args).toContain('-WorkspaceRoot');
    expect(result.selected_agents[0].wt_args).toContain('D:/code/narada.sonar');
    expect(result.selected_agents[0].wt_args).toContain('-WaitForEnterBeforeExec');
    expect(result.selected_agents[0].smoke_command).toEqual(expect.arrayContaining([
      'narada',
      'carrier',
      'start',
      'agent-cli',
      '--site-root',
      'D:/code/narada.sonar',
      '--agent',
      'sonar.resident',
      '--dry-run',
    ]));
    expect(result.wt_args[0]).toBe('new-tab');
  });

  it('requires an explicit selection unless a config path is supplied', async () => {
    const registryPath = await tempRegistry();
    await expect(workspaceLaunchPlanCommand({
      registryPath,
      format: 'json',
    }, createMockContext())).rejects.toThrow(/launch_selection_required/);
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
    expect(result.selected_agents[0].wt_args).not.toContain('-WaitForEnterBeforeExec');
    expect(result.wt_args).toContain(';');
  });

  it('aggregates workspace smoke through carrier dry-run without opening terminals', async () => {
    const registryPath = await tempRegistry();
    const plan = await workspaceLaunchPlanCommand({
      registryPath,
      agent: ['sonar.resident'],
      runtime: 'agent-cli',
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
});
