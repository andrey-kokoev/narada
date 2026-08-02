import { access, copyFile, mkdir, readFile, rename, rm, writeFile, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  defaultHostFleetMachinePaths,
  readHostFleetRuntimeConfig,
  type HostFleetRuntimeConfig,
} from '@narada-core/host-fleet-runtime/config';
import {
  createHostFleetRuntimeClient,
  hostFleetRuntimeBaseUrl,
} from '@narada-core/host-fleet-runtime/client';
import { createHostFleetPublisher } from '@narada-core/host-fleet-runtime/publisher';
import {
  hostFleetLinuxPathHiddenByProtectHome,
  planHostFleetService,
  type HostFleetServiceCommand,
  type HostFleetServicePlan,
} from '@narada-core/host-fleet-runtime/service-plan';
import type { RunningHostFleetRuntime } from '@narada-core/host-fleet-runtime/runtime';
import { runGovernedCommandSync } from '@narada-core/process-launch-posture';

export interface HostFleetServiceCommandOptions {
  config?: string;
  state?: string;
  windows_service_wrapper?: string;
}

export interface HostFleetCommandResult {
  exitCode: number;
  result: Record<string, unknown>;
}

export interface HostFleetCommandDependencies {
  service_plan?: HostFleetServicePlan;
}

type CommandExecutor = (command: HostFleetServiceCommand) => { status: number; stdout: string; stderr: string };

function defaultCliEntrypoint(): string {
  return fileURLToPath(new URL('../main.js', import.meta.url));
}

function execute(command: HostFleetServiceCommand): { status: number; stdout: string; stderr: string } {
  const result = runGovernedCommandSync(command.command, command.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    stdout: typeof result.stdout === 'string' ? result.stdout : result.stdout?.toString('utf8') ?? '',
    stderr: typeof result.stderr === 'string' ? result.stderr : result.stderr?.toString('utf8') ?? '',
  };
}

async function readNormalizedConfig(path: string): Promise<HostFleetRuntimeConfig> {
  return readHostFleetRuntimeConfig(resolve(path));
}

async function atomicWrite(path: string, content: string, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, 'utf8');
    if (mode !== undefined) await chmod(temporary, mode);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function servicePlan(
  options: HostFleetServiceCommandOptions,
  dependencies: HostFleetCommandDependencies = {},
): HostFleetServicePlan {
  if (dependencies.service_plan) return dependencies.service_plan;
  const paths = defaultHostFleetMachinePaths();
  return planHostFleetService({
    node_path: process.execPath,
    cli_entrypoint: defaultCliEntrypoint(),
    config_path: paths.config_path,
    windows_service_wrapper_path: options.windows_service_wrapper ?? process.env.NARADA_WINSW_PATH,
  });
}

async function secureMachineFiles(config: HostFleetRuntimeConfig, plan: HostFleetServicePlan, executor: CommandExecutor): Promise<void> {
  const stateExists = await access(plan.state_path).then(() => true).catch(() => false);
  const protectedFiles = [
    plan.config_path,
    config.credentials.active.file,
    config.credentials.previous?.file,
    ...(stateExists ? [plan.state_path] : []),
  ].filter((value): value is string => Boolean(value));
  const protectedDirectories = [...new Set([dirname(plan.config_path), dirname(plan.state_path)])];
  if (plan.platform === 'windows') {
    for (const path of [...protectedDirectories, ...protectedFiles]) {
      const outcome = executor({
        command: 'icacls.exe',
        args: [path, '/inheritance:r', '/grant:r', '*S-1-5-18:F', '*S-1-5-32-544:F'],
      });
      if (outcome.status !== 0) throw new Error('host_fleet_machine_file_acl_failed');
    }
    return;
  }
  if (protectedFiles.some(hostFleetLinuxPathHiddenByProtectHome)) {
    throw new Error('host_fleet_service_credential_hidden_by_protect_home');
  }
  for (const path of protectedDirectories) await chmod(path, 0o700);
  for (const path of protectedFiles) await chmod(path, 0o600);
}

async function materializeServicePlan(plan: HostFleetServicePlan): Promise<void> {
  for (const file of plan.files) await atomicWrite(file.path, file.content, file.mode ?? undefined);
  for (const binary of plan.binary_copies) {
    await mkdir(dirname(binary.to), { recursive: true });
    await copyFile(binary.from, binary.to);
  }
}

function runAll(commands: readonly HostFleetServiceCommand[], executor: CommandExecutor): void {
  for (const command of commands) {
    const outcome = executor(command);
    if (outcome.status !== 0) throw new Error('host_fleet_service_command_failed');
  }
}

function serviceIsInstalled(plan: HostFleetServicePlan, executor: CommandExecutor): boolean {
  try { return executor(plan.registration_status_commands[0]!).status === 0; }
  catch { return false; }
}

function serviceIsRunning(plan: HostFleetServicePlan, outcome: ReturnType<CommandExecutor>): boolean {
  if (outcome.status !== 0) return false;
  if (plan.platform === 'linux') return true;
  return /\bSTATE\s*:\s*4\s+RUNNING\b/i.test(outcome.stdout);
}

export async function hostFleetPlanCommand(
  options: HostFleetServiceCommandOptions = {},
  dependencies: HostFleetCommandDependencies = {},
): Promise<HostFleetCommandResult> {
  const sourceConfig = resolve(options.config ?? defaultHostFleetMachinePaths().config_path);
  const config = await readNormalizedConfig(sourceConfig);
  const plan = servicePlan(options, dependencies);
  return {
    exitCode: 0,
    result: {
      schema: 'narada.host_fleet.plan_result.v1',
      status: 'planned',
      mutation_performed: false,
      source_config_path: sourceConfig,
      mode: config.mode,
      host_id: config.host_id,
      authority_host_id: config.authority_host_id,
      service: plan,
      _formatted: [
        `Host Fleet plan: ${config.mode} ${config.host_id}`,
        `Authority: ${config.authority_host_id}`,
        `Service: ${plan.platform}; elevation required`,
        `Machine config: ${plan.config_path}`,
      ].join('\n'),
    },
  };
}

export async function hostFleetInstallCommand(
  options: HostFleetServiceCommandOptions = {},
  executor: CommandExecutor = execute,
  dependencies: HostFleetCommandDependencies = {},
): Promise<HostFleetCommandResult> {
  const sourceConfig = resolve(options.config ?? defaultHostFleetMachinePaths().config_path);
  const config = await readNormalizedConfig(sourceConfig);
  const plan = servicePlan(options, dependencies);
  const installed = serviceIsInstalled(plan, executor);
  const prior = installed ? await readFile(plan.config_path, 'utf8').catch(() => null) : null;
  try {
    await mkdir(dirname(plan.state_path), { recursive: true });
    await atomicWrite(plan.config_path, `${JSON.stringify(config, null, 2)}\n`, 0o600);
    await materializeServicePlan(plan);
    if (plan.platform === 'windows') {
      await access(plan.install_commands[0]!.command).catch(() => { throw new Error('host_fleet_windows_service_wrapper_required'); });
    }
    await secureMachineFiles(config, plan, executor);
    runAll(installed ? plan.restart_commands : plan.install_commands, executor);
  } catch {
    if (installed && prior !== null) {
      await atomicWrite(plan.config_path, prior, 0o600);
      try { runAll(plan.restart_commands, executor); } catch { /* preserve the primary refusal */ }
      throw new Error('host_fleet_install_failed_config_restored');
    }
    throw new Error('host_fleet_install_failed');
  }
  return {
    exitCode: 0,
    result: {
      schema: 'narada.host_fleet.install_result.v1',
      status: 'installed',
      mutation_performed: true,
      mode: config.mode,
      host_id: config.host_id,
      config_path: plan.config_path,
      state_path: plan.state_path,
      service_previously_installed: installed,
      _formatted: [
        `Host Fleet ${config.mode} installed for ${config.host_id}.`,
        `Config: ${plan.config_path}`,
        `State: ${plan.state_path}`,
      ].join('\n'),
    },
  };
}

export async function hostFleetReloadCommand(
  options: HostFleetServiceCommandOptions = {},
  executor: CommandExecutor = execute,
  dependencies: HostFleetCommandDependencies = {},
): Promise<HostFleetCommandResult> {
  const paths = defaultHostFleetMachinePaths();
  const sourceConfig = resolve(options.config ?? paths.config_path);
  const config = await readNormalizedConfig(sourceConfig);
  const plan = servicePlan(options, dependencies);
  const prior = await readFile(plan.config_path, 'utf8').catch(() => null);
  await mkdir(dirname(plan.state_path), { recursive: true });
  await atomicWrite(plan.config_path, `${JSON.stringify(config, null, 2)}\n`, 0o600);
  try {
    await secureMachineFiles(config, plan, executor);
    runAll(plan.restart_commands, executor);
  } catch {
    if (prior !== null) {
      await atomicWrite(plan.config_path, prior, 0o600);
      try { runAll(plan.restart_commands, executor); } catch { /* preserve the primary refusal */ }
    }
    throw new Error('host_fleet_reload_failed_config_restored');
  }
  return {
    exitCode: 0,
    result: {
      schema: 'narada.host_fleet.reload_result.v1',
      status: 'reloaded',
      mutation_performed: true,
      config_path: plan.config_path,
      host_id: config.host_id,
      _formatted: `Host Fleet configuration reloaded for ${config.host_id}.\nConfig: ${plan.config_path}`,
    },
  };
}

export async function hostFleetStatusCommand(
  options: HostFleetServiceCommandOptions = {},
  executor: CommandExecutor = execute,
  dependencies: HostFleetCommandDependencies = {},
): Promise<HostFleetCommandResult> {
  const plan = servicePlan(options, dependencies);
  const registered = serviceIsInstalled(plan, executor);
  const service = registered ? executor(plan.status_commands[0]!) : null;
  const running = service !== null && serviceIsRunning(plan, service);
  let config: HostFleetRuntimeConfig | null = null;
  let health: Awaited<ReturnType<ReturnType<typeof createHostFleetRuntimeClient>['health']>> | null = null;
  let hostCount: number | null = null;
  try {
    config = await readHostFleetRuntimeConfig(options.config ?? plan.config_path);
    const client = createHostFleetRuntimeClient({ base_url: hostFleetRuntimeBaseUrl(config) });
    health = await client.health();
    if (config.mode === 'authority') hostCount = (await client.read()).snapshot?.hosts.length ?? 0;
  } catch { /* status remains a bounded unavailable projection */ }
  const runtimeReady = health?.status === 'healthy';
  return {
    exitCode: runtimeReady && running ? 0 : 1,
    result: {
      schema: 'narada.host_fleet.status_result.v1',
      status: health?.status ?? 'unavailable',
      mutation_performed: false,
      service: !registered ? 'not_installed' : running ? 'running' : 'stopped',
      mode: config?.mode ?? null,
      runtime: health,
      host_count: hostCount,
      remediation: !registered
        ? 'Run narada host-fleet install from an elevated terminal.'
        : !running
          ? 'Start or restart the Host Fleet OS service.'
        : !runtimeReady
          ? 'Inspect the Host Fleet service logs and validated machine configuration.'
          : null,
      _formatted: [
        `Host Fleet status: ${health?.status ?? 'unavailable'}`,
        `Mode: ${config?.mode ?? 'unknown'}`,
        `Service: ${!registered ? 'not installed' : running ? 'running' : 'stopped'}`,
        `Authority: ${config?.authority_host_id ?? 'unknown'}`,
        ...(hostCount === null ? [] : [`Hosts: ${hostCount}`]),
      ].join('\n'),
    },
  };
}

export async function hostFleetUninstallCommand(
  options: HostFleetServiceCommandOptions = {},
  executor: CommandExecutor = execute,
  dependencies: HostFleetCommandDependencies = {},
): Promise<HostFleetCommandResult> {
  const plan = servicePlan(options, dependencies);
  if (serviceIsInstalled(plan, executor)) runAll(plan.uninstall_commands, executor);
  for (const file of plan.files) await rm(file.path, { force: true });
  for (const binary of plan.binary_copies) await rm(binary.to, { force: true });
  runAll(plan.uninstall_finalize_commands, executor);
  return {
    exitCode: 0,
    result: {
      schema: 'narada.host_fleet.uninstall_result.v1',
      status: 'uninstalled',
      mutation_performed: true,
      retained_config_path: plan.config_path,
      retained_state_path: plan.state_path,
      _formatted: [
        'Host Fleet service uninstalled.',
        `Retained config: ${plan.config_path}`,
        `Retained state: ${plan.state_path}`,
      ].join('\n'),
    },
  };
}

export async function runHostFleetService(options: HostFleetServiceCommandOptions = {}): Promise<{
  config: HostFleetRuntimeConfig;
  runtime: RunningHostFleetRuntime;
}> {
  const paths = defaultHostFleetMachinePaths();
  const config = await readHostFleetRuntimeConfig(options.config ?? paths.config_path);
  const { startHostFleetRuntime } = await import('@narada-core/host-fleet-runtime/runtime');
  const runtime = await startHostFleetRuntime({ config, state_path: options.state ?? paths.state_path });
  return { config, runtime };
}

export async function hostFleetPublishOnceCommand(options: HostFleetServiceCommandOptions = {}): Promise<HostFleetCommandResult> {
  const config = await readHostFleetRuntimeConfig(options.config ?? defaultHostFleetMachinePaths().config_path);
  const publisher = createHostFleetPublisher({ config });
  await publisher.publish();
  return {
    exitCode: 0,
    result: {
      schema: 'narada.host_fleet.publish_result.v1',
      status: 'published',
      mutation_performed: true,
      host_id: config.host_id,
      authority_host_id: config.authority_host_id,
      _formatted: `Host Fleet heartbeat published for ${config.host_id} to authority ${config.authority_host_id}.`,
    },
  };
}
