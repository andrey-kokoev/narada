import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { carrierStartCommand } from './carrier.js';

export interface WorkspaceLaunchPlanOptions {
  agent?: string[];
  all?: boolean;
  role?: string[];
  site?: string[];
  configPath?: string[];
  registryPath?: string;
  runtime?: string;
  intelligenceProvider?: string;
  enableNativeShell?: boolean;
  noWaitForEnterBeforeExec?: boolean;
  smoke?: boolean;
  dryRun?: boolean;
  format?: CliFormat;
}

interface RawLaunchRegistry {
  NaradaRoot?: string;
  SiteRoot?: string;
  WorkspaceRoot?: string;
  Launcher?: string;
  LauncherPath?: string;
  Runtime?: string;
  Agents?: RawAgentRecord[] | RawAgentRecord;
}

interface RawAgentRecord {
  Agent?: string;
  Title?: string;
  Role?: string;
  Site?: string;
  NaradaRoot?: string;
  SiteRoot?: string;
  WorkspaceRoot?: string;
  Launcher?: string;
  LauncherPath?: string;
  Runtime?: string;
  EnableNativeShell?: boolean;
}

export interface WorkspaceLaunchRecord {
  agent: string;
  title: string;
  role: string;
  site: string;
  narada_root: string;
  site_root: string;
  workspace_root: string | null;
  launcher_path: string;
  runtime: string;
  enable_native_shell: boolean;
  config_path: string;
}

export interface WorkspaceLaunchAgentPlan extends WorkspaceLaunchRecord {
  launch_runtime: string;
  intelligence_provider: string | null;
  wait_for_enter_before_exec: boolean;
  wt_args: string[];
  smoke_command: string[];
}

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const registryPaths = resolveRegistryPaths(options);
  const records = (await Promise.all(registryPaths.map(readLaunchRegistry))).flat();
  const selected = selectLaunchRecords(records, options);
  const plans = selected.map((record) => buildAgentPlan(record, options));
  const wtArgs = plans.flatMap((plan, index) => [
    ...(index === 0 ? [] : [';']),
    ...plan.wt_args,
  ]);
  if (options.smoke) {
    const agents = [];
    for (const plan of plans) {
      const smoke = await carrierStartCommand({
        siteRoot: plan.site_root,
        workspaceRoot: plan.workspace_root ?? undefined,
        agent: plan.agent,
        runtime: plan.launch_runtime,
        intelligenceProvider: plan.intelligence_provider ?? undefined,
        dryRun: true,
        enableNativeShell: plan.enable_native_shell,
        format: 'json',
      }, context);
      agents.push({
        agent: plan.agent,
        site: plan.site,
        runtime: plan.launch_runtime,
        status: smoke.exitCode === ExitCode.SUCCESS ? 'passed' : 'failed',
        plan,
        carrier_start: smoke.result,
      });
    }
    const failed = agents.filter((agent) => agent.status !== 'passed');
    const smokeResult = {
      schema: 'narada.workspace_launch.smoke.v1',
      status: failed.length === 0 ? 'passed' : 'failed',
      mutation_performed: false,
      count: agents.length,
      windows_terminal_invoked: false,
      mcp_initialization: {
        status: 'not_executed_in_dry_run',
        reason: 'Smoke mode calls carrier start dry-run only; live MCP startup remains an execution probe.',
      },
      registry_paths: registryPaths,
      agents,
      ownership: {
        planner: 'narada-cli',
        smoke_aggregator: 'narada-cli',
        executor: 'none',
        migrated_from: 'Start-NaradaWorkspace.ps1 inline smoke aggregation',
      },
    };
    return {
      exitCode: failed.length === 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: formattedResult(smokeResult, `workspace smoke ${smokeResult.status}`, options.format ?? 'auto'),
    };
  }
  const mode = options.smoke ? 'smoke' : options.dryRun ? 'dry_run' : 'plan';
  const result = {
    schema: 'narada.workspace_launch.plan.v1',
    status: 'planned',
    mutation_performed: false,
    mode,
    count: plans.length,
    windows_terminal_invoked: false,
    registry_paths: registryPaths,
    selected_agents: plans,
    wt_args: wtArgs,
    ownership: {
      planner: 'narada-cli',
      executor: 'operator_surface_windows_terminal',
      migrated_from: 'Start-NaradaWorkspace.ps1 inline registry/filter/wt planning',
    },
  };

  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, `planned ${plans.length} workspace launch(es)`, options.format ?? 'auto'),
  };
}

function resolveRegistryPaths(options: WorkspaceLaunchPlanOptions): string[] {
  const paths = options.configPath && options.configPath.length > 0
    ? options.configPath
    : [options.registryPath ?? join(process.cwd(), 'config', 'launch', 'agents.psd1')];
  return paths.map((path) => resolve(path));
}

async function readLaunchRegistry(path: string): Promise<WorkspaceLaunchRecord[]> {
  if (!existsSync(path)) throw new Error(`launch_registry_missing: ${path}`);
  const raw = path.toLowerCase().endsWith('.json')
    ? JSON.parse(await readFile(path, 'utf8')) as RawLaunchRegistry
    : readPowerShellDataFile(path);
  const agents = Array.isArray(raw.Agents) ? raw.Agents : raw.Agents ? [raw.Agents] : [];
  return agents.map((agent) => normalizeAgentRecord(raw, agent, path));
}

function readPowerShellDataFile(path: string): RawLaunchRegistry {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$path = $env:NARADA_LAUNCH_REGISTRY_PATH',
    '$data = Import-PowerShellDataFile -Path $path',
    '$data | ConvertTo-Json -Depth 20 -Compress',
  ].join('; ');
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
    env: {
      ...process.env,
      NARADA_LAUNCH_REGISTRY_PATH: path,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(`launch_registry_read_failed: ${path}: ${detail}`);
  }
  return JSON.parse(String(result.stdout || '{}')) as RawLaunchRegistry;
}

function normalizeAgentRecord(registry: RawLaunchRegistry, agent: RawAgentRecord, configPath: string): WorkspaceLaunchRecord {
  const agentId = nonEmpty(agent.Agent);
  if (!agentId) throw new Error(`agent_id_missing_in_launch_registry: ${configPath}`);
  const naradaRoot = nonEmpty(agent.NaradaRoot) ?? nonEmpty(registry.NaradaRoot);
  if (!naradaRoot) throw new Error(`agent_narada_root_missing: ${agentId} in ${configPath}`);
  const siteRoot = nonEmpty(agent.SiteRoot) ?? nonEmpty(registry.SiteRoot) ?? naradaRoot;
  const workspaceRoot = nonEmpty(agent.WorkspaceRoot) ?? nonEmpty(registry.WorkspaceRoot) ?? null;
  const launcher = nonEmpty(agent.Launcher) ?? nonEmpty(registry.Launcher);
  const launcherPath = nonEmpty(agent.LauncherPath) ?? nonEmpty(registry.LauncherPath)
    ?? (launcher ? join(naradaRoot, launcher) : join(naradaRoot, 'narada-andrey.ps1'));
  const runtime = nonEmpty(agent.Runtime) ?? nonEmpty(registry.Runtime) ?? 'codex';
  return {
    agent: agentId,
    title: nonEmpty(agent.Title) ?? agentId.split('.').at(-1) ?? agentId,
    role: nonEmpty(agent.Role) ?? (agentId.split('.').at(-1) ?? agentId).replace(/\d+$/, ''),
    site: nonEmpty(agent.Site) ?? agentId.split('.')[0] ?? agentId,
    narada_root: naradaRoot,
    site_root: siteRoot,
    workspace_root: workspaceRoot,
    launcher_path: launcherPath,
    runtime,
    enable_native_shell: agent.EnableNativeShell === true,
    config_path: configPath,
  };
}

function selectLaunchRecords(records: WorkspaceLaunchRecord[], options: WorkspaceLaunchPlanOptions): WorkspaceLaunchRecord[] {
  let selected: WorkspaceLaunchRecord[];
  if (options.agent && options.agent.length > 0) {
    selected = [];
    for (const agent of options.agent) {
      const matches = records.filter((record) => record.agent === agent);
      if (matches.length === 0) throw new Error(`agent_not_found_in_launch_registry: ${agent}`);
      if (matches.length > 1) throw new Error(`agent_duplicate_in_launch_registry: ${agent}`);
      selected.push(matches[0]);
    }
  } else if (options.all || (options.configPath && options.configPath.length > 0)) {
    selected = records;
  } else {
    throw new Error('launch_selection_required: specify --agent, --all, or --config-path');
  }

  if (options.role && options.role.length > 0) {
    const roles = new Set(options.role.map((role) => role.toLowerCase()));
    selected = selected.filter((record) => roles.has(record.role.toLowerCase()));
    if (selected.length === 0) throw new Error(`no_agents_match_role_filter: ${options.role.join(', ')}`);
  }

  if (options.site && options.site.length > 0) {
    const sites = new Set(options.site.map((site) => site.toLowerCase()));
    selected = selected.filter((record) => {
      const aliases = [
        record.site,
        record.site.replace(/^narada-/, ''),
        record.agent.split('.')[0],
      ].filter(Boolean).map((value) => value.toLowerCase());
      return aliases.some((alias) => sites.has(alias));
    });
    if (selected.length === 0) throw new Error(`no_agents_match_site_filter: ${options.site.join(', ')}`);
  }

  return selected;
}

function buildAgentPlan(record: WorkspaceLaunchRecord, options: WorkspaceLaunchPlanOptions): WorkspaceLaunchAgentPlan {
  const launchRuntime = options.runtime ?? record.runtime;
  const enableNativeShell = options.enableNativeShell === true || record.enable_native_shell;
  const waitForEnter = options.noWaitForEnterBeforeExec !== true;
  const base = [
    'new-tab',
    '--title', record.title,
    '-d', record.narada_root,
    'pwsh',
    '-NoExit',
    '-File', join(defaultUserSiteRoot(), 'Start-NaradaAgent.ps1'),
    '-NaradaRoot', record.narada_root,
    '-SiteRoot', record.site_root,
    '-Agent', record.agent,
    '-Runtime', launchRuntime,
    '-LauncherPath', record.launcher_path,
  ];
  if (record.workspace_root) base.push('-WorkspaceRoot', record.workspace_root);
  if (enableNativeShell) base.push('-EnableNativeShell');
  if (options.intelligenceProvider) base.push('-IntelligenceProvider', options.intelligenceProvider);
  if (waitForEnter) base.push('-WaitForEnterBeforeExec');

  const smokeCommand = [
    'narada', 'carrier', 'start', launchRuntime,
    '--site-root', record.site_root,
    '--agent', record.agent,
    '--dry-run',
    '--format', 'json',
  ];
  if (record.workspace_root) smokeCommand.push('--workspace-root', record.workspace_root);
  if (options.intelligenceProvider) smokeCommand.push('--intelligence-provider', options.intelligenceProvider);
  if (enableNativeShell) smokeCommand.push('--enable-native-shell');

  return {
    ...record,
    launch_runtime: launchRuntime,
    intelligence_provider: options.intelligenceProvider ?? null,
    wait_for_enter_before_exec: waitForEnter,
    enable_native_shell: enableNativeShell,
    wt_args: base,
    smoke_command: smokeCommand,
  };
}

function defaultUserSiteRoot(): string {
  return process.env.NARADA_USER_SITE_ROOT ?? 'C:/Users/Andrey/Narada';
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
