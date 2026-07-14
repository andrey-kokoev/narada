import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  getOperatorSurfaceRuntimeControlPath,
  getOperatorSurfaceRuntimeStatus,
} from '../lib/launcher-runtime.js';
import { defaultRuntimeForCarrier as defaultRuntimeForOperatorSurface } from '@narada2/carrier-runtime-contract/carrier-runtime-selection';
import {
  formatOperatorSurfaceRuntimeStatus,
  requireAgent,
  requireSiteRoot,
} from './carrier-support.js';
import type { OperatorSurfaceRuntimeStartOptions } from './operator-surface-runtime-start.js';

export type OperatorSurfaceRuntimeLifecycleOptions = OperatorSurfaceRuntimeStartOptions;

export async function operatorSurfaceRuntimeStatusCommand(
  options: OperatorSurfaceRuntimeLifecycleOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = getOperatorSurfaceRuntimeStatus({
    siteRoot: requireSiteRoot(options),
    agent: options.agent,
    carrier: options.carrier,
    runtime: options.runtime,
  });

  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(status, formatOperatorSurfaceRuntimeStatus(status), options.format ?? 'auto'),
  };
}

export async function operatorSurfaceRuntimeControlPathCommand(
  options: OperatorSurfaceRuntimeLifecycleOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = getOperatorSurfaceRuntimeControlPath({
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

export async function operatorSurfaceRuntimeReadinessCommand(
  options: OperatorSurfaceRuntimeLifecycleOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = getOperatorSurfaceRuntimeStatus({
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

export async function operatorSurfaceRuntimeRestartCommand(
  options: OperatorSurfaceRuntimeLifecycleOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireSiteRoot(options);
  const carrier = options.carrier ?? 'agent-cli';
  const runtime = defaultRuntimeForOperatorSurface(carrier);
  const agent = requireAgent(options);
  const result = unsupportedOperatorSurfaceRuntimeLifecycle('restart', siteRoot, agent, carrier, runtime);
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: formattedResult(result, result.reason, options.format ?? 'auto'),
  };
}

export async function operatorSurfaceRuntimeDrainCommand(
  options: OperatorSurfaceRuntimeLifecycleOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireSiteRoot(options);
  const carrier = options.carrier ?? 'agent-cli';
  const runtime = defaultRuntimeForOperatorSurface(carrier);
  const agent = requireAgent(options);
  const result = unsupportedOperatorSurfaceRuntimeLifecycle('drain', siteRoot, agent, carrier, runtime);
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: formattedResult(result, result.reason, options.format ?? 'auto'),
  };
}

export async function operatorSurfaceRuntimeReloadCommand(
  options: OperatorSurfaceRuntimeLifecycleOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireSiteRoot(options);
  const carrier = options.carrier ?? 'agent-cli';
  const runtime = defaultRuntimeForOperatorSurface(carrier);
  const agent = requireAgent(options);
  if (carrier === 'agent-cli') {
    const restart = await operatorSurfaceRuntimeRestartCommand(options, context);
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
  const result = unsupportedOperatorSurfaceRuntimeLifecycle('reload', siteRoot, agent, carrier, runtime);
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: formattedResult(result, result.reason, options.format ?? 'auto'),
  };
}

function unsupportedOperatorSurfaceRuntimeLifecycle(
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
