import { appendFile } from 'node:fs/promises';
import { startOperatorTerminal } from '@narada2/process-launch-posture';
import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import * as support from './workspace-launch-support.js';
import { finalizeWorkspaceLaunchResult } from './workspace-launch-result.js';
import type { WorkspaceLaunchPlanOptions } from './workspace-launch-types.js';

export async function executeWorkspaceLaunchPlan(
  options: WorkspaceLaunchPlanOptions,
  result: Record<string, unknown>,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const wtArgs = support.stringArray(result.wt_args);
  const selectedAgents = Array.isArray(result.selected_agents) ? result.selected_agents.filter(support.isRecord) : [];
  const hiddenRuntimeAgents = selectedAgents.filter((agent) => agent.runtime_start_execution_mode === 'hidden_detached');
  const operatorTerminalAgents = selectedAgents.filter((agent) => agent.runtime_start_execution_mode !== 'hidden_detached');
  const projectionBearingAgents = selectedAgents.filter((agent) => Array.isArray(agent.operator_projection_open_requests) && agent.operator_projection_open_requests.length > 0);
  const canUseHiddenRuntimeStart = selectedAgents.length > 0 && operatorTerminalAgents.length === 0 && projectionBearingAgents.length === 0;
  if (!canUseHiddenRuntimeStart && wtArgs.length === 0) {
    throw new Error('narada_workspace_plan_empty_wt_args');
  }

  if (options.dryRun) {
    const dryRunResult = {
      ...result,
      mode: 'dry_run',
      mutation_performed: false,
      windows_terminal_invoked: false,
      launcher_execution_owner: 'narada-cli',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(dryRunResult, `planned ${result.count ?? 0} workspace launch(es)`, options.format ?? 'auto'),
    };
  }

  if (canUseHiddenRuntimeStart) {
    const hiddenLaunches = [];
    for (const agent of hiddenRuntimeAgents) {
      const runtimeStartCommand = support.stringArray(agent.hidden_runtime_start_command ?? agent.runtime_start_command);
      const runtimeStartCwd = support.workspaceLaunchString(agent.runtime_start_cwd) ?? process.cwd();
      if (runtimeStartCommand.length === 0) throw new Error('narada_workspace_plan_empty_runtime_start_command');
      hiddenLaunches.push(await support.workspaceLaunchStartHiddenRuntimeHost(runtimeStartCommand, runtimeStartCwd));
    }
    const launchResult = finalizeWorkspaceLaunchResult({
      ...result,
      windows_terminal_invoked: false,
      hidden_runtime_invoked: true,
      launcher_execution_owner: 'narada-cli',
      hidden_runtime_launches: hiddenLaunches,
    });
    await support.writeWorkspacePlanResult(options.resultPath, launchResult);
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(launchResult, `launched ${result.count ?? 0} hidden runtime start(s)`, options.format ?? 'auto'),
    };
  }

  const effectiveWtArgs = process.env.WT_SESSION ? ['-w', '0', ...wtArgs] : wtArgs;
  const terminalCaptureLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
  const launch = terminalCaptureLog
    ? (await captureWorkspaceLaunchTerminalInvocation(terminalCaptureLog, effectiveWtArgs))
    : startOperatorTerminal('wt', effectiveWtArgs).result;
  if (launch.error) throw launch.error;
  if (launch.status !== 0) {
    throw new Error(`windows_terminal_launch_failed: wt exited ${launch.status ?? 'unknown'}`);
  }

  const launchResult = finalizeWorkspaceLaunchResult({
    ...result,
    windows_terminal_invoked: true,
    hidden_runtime_invoked: false,
    launcher_execution_owner: 'narada-cli',
    wt_exit_code: launch.status ?? 0,
  });
  await support.writeWorkspacePlanResult(options.resultPath, launchResult);
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(launchResult, `launched ${result.count ?? 0} workspace launch(es)`, options.format ?? 'auto'),
  };
}

export async function captureWorkspaceLaunchTerminalInvocation(path: string, args: string[]): Promise<{ status: number; error?: Error }> {
  await appendFile(path, `${JSON.stringify(args)}\n`, 'utf8');
  return { status: 0 };
}
