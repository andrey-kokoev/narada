import { resolve } from 'node:path';
import { operatorSurfaceRuntimeStartCommand as runOperatorSurfaceRuntimeStart } from './operator-surface-runtime-start.js';
import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import type { CommandContext } from '../lib/command-wrapper.js';
import { writeWorkspacePlanResult } from './workspace-launch-persistence.js';
import type {
  WorkspaceLaunchAgentPlan,
  WorkspaceLaunchCommandResult,
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchRuntimeStartResult,
  WorkspaceLaunchSmokeAgentResult,
  WorkspaceLaunchSmokeResult,
} from './workspace-launch-types.js';

export async function runWorkspaceLaunchSmoke(
  plans: WorkspaceLaunchAgentPlan[],
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
  registryPaths: string[],
): Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchSmokeResult>> {
  const agents: WorkspaceLaunchSmokeAgentResult[] = [];
  const naradaProperRoot = resolve(process.env.NARADA_PROPER_ROOT ?? process.cwd());
  for (const plan of plans) {
    const smoke = await runOperatorSurfaceRuntimeStart({
      siteRoot: plan.site_root,
      targetSiteId: plan.site,
      // `workspaceRoot` is the Narada proper package workspace consumed by
      // agent-start. The selected record's workspace_root is the target Site
      // workspace and may not contain Narada's package graph.
      workspaceRoot: naradaProperRoot,
      agent: plan.agent,
      carrier: plan.launch_operator_surface,
      runtime: plan.launch_runtime_host,
      authority: plan.authority ?? undefined,
      intelligenceProvider: plan.intelligence_provider ?? undefined,
      mcpScope: plan.mcp_scope,
      dryRun: true,
      enableNativeShell: plan.enable_native_shell,
      format: 'json',
    }, context);
    const operatorSurfaceRuntimeStart = asWorkspaceLaunchRuntimeStartResult(smoke.result);
    agents.push({
      agent: plan.agent,
      site: plan.site,
      operator_surface: plan.launch_operator_surface,
      runtime: plan.launch_runtime,
      status: smoke.exitCode === ExitCode.SUCCESS ? 'passed' : 'failed',
      plan,
      operator_surface_runtime_start: operatorSurfaceRuntimeStart,
      operator_surface_start: operatorSurfaceRuntimeStart,
    });
  }

  const failed = agents.filter((agent) => agent.status !== 'passed');
  const smokeResult: WorkspaceLaunchSmokeResult = {
    schema: 'narada.workspace_launch.smoke.v1',
    status: failed.length === 0 ? 'passed' : 'failed',
    mutation_performed: false,
    count: agents.length,
    windows_terminal_invoked: false,
    mcp_initialization: {
      status: 'not_executed_in_dry_run',
      reason: 'Smoke mode calls operator-surface runtime start dry-run only; live MCP startup remains an execution probe.',
    },
    registry_paths: registryPaths,
    agents,
    ownership: {
      planner: 'narada-cli',
      smoke_aggregator: 'narada-cli',
      executor: 'none',
      migrated_from: 'Start-NaradaWorkspace.ps1 inline smoke aggregation',
    },
    ...(options.resultPath ? { result_path: options.resultPath } : {}),
    ...(options.suppressResultOutput ? { suppress_result_output: true } : {}),
  };

  await writeWorkspacePlanResult(options.resultPath, smokeResult);
  return {
    exitCode: failed.length === 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult(smokeResult, `workspace smoke ${smokeResult.status}`, options.format ?? 'auto'),
  };
}

function asWorkspaceLaunchRuntimeStartResult(value: unknown): WorkspaceLaunchRuntimeStartResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('workspace_launch_smoke_runtime_start_result_invalid');
  }
  const candidate = value as Partial<WorkspaceLaunchRuntimeStartResult>;
  if (candidate.schema !== 'narada.operator_surface.runtime_start_result.v1'
    || typeof candidate.status !== 'string'
    || typeof candidate.mutation_performed !== 'boolean'
    || typeof candidate.mode !== 'string'
    || typeof candidate.operator_surface_kind !== 'string'
    || typeof candidate.runtime_host_kind !== 'string'
    || (candidate.target_site_id !== null && typeof candidate.target_site_id !== 'string')) {
    throw new Error('workspace_launch_smoke_runtime_start_result_invalid');
  }
  return value as WorkspaceLaunchRuntimeStartResult;
}
