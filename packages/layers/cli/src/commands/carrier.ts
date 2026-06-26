import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  getCarrierControlPath,
  getCarrierStatus,
  runAgentStartCommand,
} from '../lib/launcher-runtime.js';
import { defaultRuntimeForCarrier } from '@narada2/carrier-runtime-contract/carrier-runtime-selection';

export interface CarrierCommandOptions {
  siteRoot?: string;
  site?: string;
  workspaceRoot?: string;
  agent?: string;
  carrier?: string;
  runtime?: string;
  intelligenceProvider?: string;
  timeout?: number;
  dryRun?: boolean;
  materializeOnly?: boolean;
  exec?: boolean;
  wait?: boolean;
  enableNativeShell?: boolean;
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
      status.latest?.control_path ?? `No carrier control path found for ${status.site_root}`,
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
        : `not ready: no live carrier evidence for ${status.site_root}`,
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
  if (existing.latest?.control_path_exists && existing.latest.parent_process_alive !== false) {
    const result = {
      schema: 'narada.carrier.start_result.v0',
      status: 'already_running',
      mutation_performed: false,
      site_root: siteRoot,
      agent,
      carrier,
      runtime,
      carrier_status: existing,
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, 'carrier already running', options.format ?? 'auto'),
    };
  }
  const start = runAgentStartCommand({
    siteRoot,
    workspaceRoot: options.workspaceRoot,
    agent,
    carrier,
    runtime,
    intelligenceProvider: options.intelligenceProvider,
    dryRun: options.dryRun ?? (!options.materializeOnly && !options.exec),
    exec: options.exec,
    wait: options.wait,
    enableNativeShell: options.enableNativeShell,
    launchSource: 'narada carrier start',
  });
  const result = {
    schema: 'narada.carrier.start_result.v0',
    status: start.status,
    mutation_performed: start.mutation_performed,
    site_root: siteRoot,
    workspace_root: options.workspaceRoot ?? null,
    agent,
    carrier,
    runtime,
    intelligence_provider: options.intelligenceProvider ?? null,
    mode: options.exec ? 'exec' : options.materializeOnly ? 'materialize_only' : 'dry_run',
    agent_start: start,
  };
  return {
    exitCode: start.status === 'success' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult(result, `carrier start ${start.status}`, options.format ?? 'auto'),
  };
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
      result: formattedResult(result, `carrier reload ${result.status}`, options.format ?? 'auto'),
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
    reason: `Carrier ${action} is not wired for carrier ${carrier}.`,
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
    return `No carrier launch result found for ${status.site_root}`;
  }
  return [
    `carrier: ${status.latest.carrier_session_id ?? 'unknown'}`,
    `identity: ${status.latest.identity ?? 'unknown'}`,
    `carrier: ${status.latest.carrier_kind ?? 'unknown'}`,
    `runtime: ${status.latest.runtime_substrate_kind ?? status.latest.runtime ?? 'unknown'}`,
    `control: ${status.latest.control_path ?? 'missing'}${status.latest.control_path_exists ? ' (exists)' : ''}`,
    `parent_alive: ${String(status.latest.parent_process_alive)}`,
  ].join('\n');
}
