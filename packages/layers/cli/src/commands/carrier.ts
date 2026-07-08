import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  getCarrierControlPath,
  getCarrierStatus,
  runAgentStartCommand,
  writeOperatorProjectionLaunchBinding,
} from '../lib/launcher-runtime.js';
import { defaultRuntimeForCarrier } from '@narada2/carrier-runtime-contract/carrier-runtime-selection';
import { agentIdentityDisplay } from '@narada2/agent-identity';

export interface CarrierCommandOptions {
  siteRoot?: string;
  site?: string;
  targetSiteId?: string;
  workspaceRoot?: string;
  agent?: string;
  carrier?: string;
  runtime?: string;
  authority?: string;
  intelligenceProvider?: string;
  mcpScope?: string;
  timeout?: number;
  dryRun?: boolean;
  materializeOnly?: boolean;
  exec?: boolean;
  wait?: boolean;
  enableNativeShell?: boolean;
  reuseExistingSession?: boolean;
  launchBindingPath?: string;
  launchSessionId?: string;
  format?: CliFormat;
}

export async function carrierStatusCommand(
  options: CarrierCommandOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = getCarrierStatus({
    siteRoot: requireSiteRoot(options),
    agent: options.agent,
    carrier: options.carrier,
    runtime: options.runtime,
  });

  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(status, formatCarrierStatus(status), options.format ?? 'auto'),
  };
}

export async function carrierControlPathCommand(
  options: CarrierCommandOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = getCarrierControlPath({
    siteRoot: requireSiteRoot(options),
    agent: options.agent,
    carrier: options.carrier,
    runtime: options.runtime,
  });
  const result = {
    ...status,
    control_path: status.latest?.control_path ?? null,
  };

  return {
    exitCode: status.latest?.control_path ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: formattedResult(
      result,
      status.latest?.control_path ?? `No runtime control path found for ${status.site_root}`,
      options.format ?? 'auto',
    ),
  };
}

export async function carrierReadinessCommand(
  options: CarrierCommandOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = getCarrierStatus({
    siteRoot: requireSiteRoot(options),
    agent: options.agent,
    carrier: options.carrier,
    runtime: options.runtime,
  });
  const ready = Boolean(
    status.latest?.control_path_exists
      && status.latest.parent_process_alive !== false,
  );
  const result = {
    schema: 'narada.carrier.readiness.v0',
    status: ready ? 'ready' : 'not_ready',
    mutation_performed: false,
    timeout_seconds: options.timeout ?? 0,
    checks: {
      launch_result_found: Boolean(status.latest),
      control_path_recorded: Boolean(status.latest?.control_path),
      control_path_exists: Boolean(status.latest?.control_path_exists),
      parent_process_alive: status.latest?.parent_process_alive ?? null,
    },
    carrier: status,
  };

  return {
    exitCode: ready ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: formattedResult(
      result,
      ready
        ? `ready: ${status.latest?.carrier_session_id ?? status.latest?.agent_start_event ?? status.site_root}`
        : `not ready: no live runtime evidence for ${status.site_root}`,
      options.format ?? 'auto',
    ),
  };
}

export async function carrierStartCommand(
  options: CarrierCommandOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireSiteRoot(options);
  const carrier = options.carrier ?? 'agent-cli';
  const runtime = options.runtime ?? defaultRuntimeForCarrier(carrier);
  const agent = requireAgent(options);
  const existing = getCarrierStatus({
    siteRoot,
    agent,
    carrier,
    runtime,
  });
  if (options.reuseExistingSession === true && existing.latest?.control_path_exists && existing.latest.parent_process_alive !== false) {
    writeOperatorProjectionLaunchBinding(options.launchBindingPath, {
      status: 'ready',
      siteRoot,
      workspaceRoot: options.workspaceRoot ?? siteRoot,
      agent,
      operatorSurfaceKind: carrier,
      runtimeHostKind: runtime,
      authority: options.authority ?? null,
      intelligenceProvider: options.intelligenceProvider ?? null,
      narsSessionId: existing.latest.nars_session_id ?? existing.latest.runtime_session_id ?? existing.latest.carrier_session_id ?? null,
      runtimeSessionId: existing.latest.runtime_session_id ?? null,
      carrierSessionId: existing.latest.carrier_session_id ?? null,
      reason: 'already_running',
    });
    const result = {
      schema: 'narada.operator_surface.runtime_start_result.v1',
      status: 'already_running',
      mutation_performed: false,
      site_root: siteRoot,
      agent,
      operator_surface_kind: carrier,
      runtime_host_kind: runtime,
      operator_surface: carrier,
      carrier,
      runtime,
      operator_surface_status: existing,
      carrier_status: existing,
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, 'operator-surface already running', options.format ?? 'auto'),
    };
  }
  const start = runAgentStartCommand({
    siteRoot,
    targetSiteId: options.targetSiteId,
    workspaceRoot: options.workspaceRoot,
    agent,
    carrier,
    runtime,
    authority: options.authority,
    intelligenceProvider: options.intelligenceProvider,
    mcpScope: options.mcpScope,
    dryRun: options.dryRun ?? (!options.materializeOnly && !options.exec),
    exec: options.exec,
    wait: options.wait,
    enableNativeShell: options.enableNativeShell,
    launchSource: 'narada operator-surface start',
    launchBindingPath: options.launchBindingPath,
    launchSessionId: options.launchSessionId,
  });
  const parsedAgentStart = start.parsed_result as {
    target_site_id?: unknown;
    launcher_contracts?: {
      launch_result_artifact?: unknown;
      operator_projection_open_request?: unknown;
    };
  } | null | undefined;
  const result = {
    schema: 'narada.operator_surface.runtime_start_result.v1',
    status: start.status,
    mutation_performed: start.mutation_performed,
    site_root: siteRoot,
    workspace_root: options.workspaceRoot ?? null,
    agent,
    operator_surface_kind: carrier,
    runtime_host_kind: runtime,
    target_site_id: typeof parsedAgentStart?.target_site_id === 'string' ? parsedAgentStart.target_site_id : options.targetSiteId ?? null,
    operator_surface: carrier,
    carrier,
    runtime,
    authority: options.authority ?? null,
    intelligence_provider: options.intelligenceProvider ?? null,
    mcp_scope: options.mcpScope ?? 'all',
    mode: options.exec ? 'exec' : options.materializeOnly ? 'materialize_only' : 'dry_run',
    agent_start: start,
    launcher_contracts: parsedAgentStart?.launcher_contracts ?? null,
    launch_result_artifact: parsedAgentStart?.launcher_contracts?.launch_result_artifact ?? null,
    operator_projection_open_request: parsedAgentStart?.launcher_contracts?.operator_projection_open_request ?? null,
  };
  return {
    exitCode: start.status === 'success' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult(result, formatOperatorSurfaceRuntimeStartResult(result), options.format ?? 'auto'),
  };
}

function formatOperatorSurfaceRuntimeStartResult(result: {
  status: unknown;
  operator_surface_kind: unknown;
  runtime_host_kind: unknown;
  launch_result_artifact: unknown;
  agent_start: unknown;
}): string {
  const status = typeof result.status === 'string' ? result.status : 'unknown';
  const operatorSurface = typeof result.operator_surface_kind === 'string'
    ? result.operator_surface_kind
    : 'operator-surface';
  const runtimeHost = typeof result.runtime_host_kind === 'string'
    ? result.runtime_host_kind
    : 'runtime';
  const resultPath = extractLaunchResultPath(result);
  const prefix = `Narada operator surface start ${status}: ${operatorSurface} / ${runtimeHost}`;
  return resultPath ? `${prefix}. Result: ${resultPath}` : prefix;
}

function extractLaunchResultPath(result: { launch_result_artifact: unknown; agent_start: unknown }): string | null {
  const artifact = result.launch_result_artifact;
  if (artifact && typeof artifact === 'object') {
    const artifactPath = (artifact as { artifact_path?: unknown }).artifact_path;
    if (typeof artifactPath === 'string' && artifactPath.length > 0) return artifactPath;
  }
  const agentStart = result.agent_start;
  if (agentStart && typeof agentStart === 'object') {
    const resultFile = (agentStart as { result_file?: unknown }).result_file;
    if (typeof resultFile === 'string' && resultFile.length > 0) return resultFile;
  }
  return null;
}

export async function carrierRestartCommand(
  options: CarrierCommandOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireSiteRoot(options);
  const carrier = options.carrier ?? 'agent-cli';
  const runtime = defaultRuntimeForCarrier(carrier);
  const agent = requireAgent(options);
  const result = unsupportedCarrierLifecycle('restart', siteRoot, agent, carrier, runtime);
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: formattedResult(result, result.reason, options.format ?? 'auto'),
  };
}

export async function carrierDrainCommand(
  options: CarrierCommandOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireSiteRoot(options);
  const carrier = options.carrier ?? 'agent-cli';
  const runtime = defaultRuntimeForCarrier(carrier);
  const agent = requireAgent(options);
  const result = unsupportedCarrierLifecycle('drain', siteRoot, agent, carrier, runtime);
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: formattedResult(result, result.reason, options.format ?? 'auto'),
  };
}

export async function carrierReloadCommand(
  options: CarrierCommandOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireSiteRoot(options);
  const carrier = options.carrier ?? 'agent-cli';
  const runtime = defaultRuntimeForCarrier(carrier);
  const agent = requireAgent(options);
  if (carrier === 'agent-cli') {
    const restart = await carrierRestartCommand(options, _context);
    const restartResult = restart.result as { status?: string; mutation_performed?: boolean };
    const result = {
      schema: 'narada.carrier.reload_result.v0',
      status: restartResult.status ?? 'failed',
      mutation_performed: restartResult.mutation_performed === true,
      site_root: siteRoot,
      agent,
      carrier,
      runtime,
      strategy: 'restart',
      restart: restart.result,
    };
    return {
      exitCode: restart.exitCode,
      result: formattedResult(result, `runtime reload ${result.status}`, options.format ?? 'auto'),
    };
  }
  const result = unsupportedCarrierLifecycle('reload', siteRoot, agent, carrier, runtime);
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: formattedResult(result, result.reason, options.format ?? 'auto'),
  };
}

function unsupportedCarrierLifecycle(
  action: 'restart' | 'reload' | 'drain',
  siteRoot: string,
  agent: string | undefined,
  carrier: string,
  runtime: string,
) {
  return {
    schema: `narada.carrier.${action}_plan.v0`,
    status: 'carrier_operation_unavailable',
    mutation_performed: false,
    site_root: siteRoot,
    agent,
    carrier,
    runtime,
    reason: `Runtime ${action} is not wired for operator surface ${carrier}.`,
  };
}

function requireSiteRoot(options: CarrierCommandOptions): string {
  const siteRoot = options.siteRoot ?? options.site;
  if (!siteRoot) {
    throw new Error('site_root_required: pass --site-root <path> or --site <path>');
  }
  return siteRoot;
}

function requireAgent(options: CarrierCommandOptions): string {
  const agent = options.agent?.trim();
  if (!agent) {
    throw new Error('agent_required: pass --agent <id>');
  }
  return agent;
}

function formatCarrierStatus(status: ReturnType<typeof getCarrierStatus>): string {
  if (!status.latest) {
    return `No runtime launch result found for ${status.site_root}`;
  }
  const displayIdentity = agentIdentityDisplay(status.latest.agent_identity_ref, status.latest.identity) ?? 'unknown';
  return [
    `session: ${status.latest.nars_session_id ?? status.latest.runtime_session_id ?? status.latest.carrier_session_id ?? 'unknown'}`,
    `identity: ${displayIdentity}`,
    `operator_surface: ${status.latest.operator_surface_kind ?? status.latest.carrier_kind ?? 'unknown'}`,
    `runtime_host: ${status.latest.runtime_host_kind ?? status.latest.runtime_substrate_kind ?? status.latest.runtime ?? 'unknown'}`,
    `control: ${status.latest.control_path ?? 'missing'}${status.latest.control_path_exists ? ' (exists)' : ''}`,
    `parent_alive: ${String(status.latest.parent_process_alive)}`,
  ].join('\n');
}
