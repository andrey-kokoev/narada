import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  getOperatorSurfaceRuntimeStatus,
  isAgentStartAcceptedStatus,
  runAgentStartCommand,
  writeOperatorProjectionLaunchBinding,
} from '../lib/launcher-runtime.js';
import { defaultRuntimeForOperatorSurface } from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import { requireAgent, requireSiteRoot } from './operator-surface-runtime-support.js';
import { resolveWorkspaceLaunchSelection } from './workspace-launch-resolution.js';
import { normalizeExplicitWorkspaceLaunchMcpScope } from './workspace-launch-contracts.js';

/**
 * Canonical Operator Surface runtime-start boundary.
 * Workspace launch and Operator Surface registration call this directly; carrier exports preserve old names only.
 */
export interface OperatorSurfaceRuntimeStartOptions {
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

function buildDirectSelectionResolution(
  carrierSelection: { requested: string | null; value: string; source: string },
  runtimeSelection: { requested: string | null; value: string; source: string },
  intelligenceProvider: string | undefined,
) {
  return {
    schema: 'narada.operator_surface_runtime.selection_resolution.v1',
    operator_surface: {
      requested: carrierSelection.requested,
      resolved: carrierSelection.value,
      source: carrierSelection.source,
    },
    runtime: {
      requested: runtimeSelection.requested,
      resolved: runtimeSelection.value,
      source: runtimeSelection.source,
    },
    intelligence_provider: {
      requested: intelligenceProvider ?? null,
      resolved: intelligenceProvider ?? null,
      source: intelligenceProvider ? 'explicit_selection' : 'delegated_to_agent_start',
    },
  };
}

export async function operatorSurfaceRuntimeStartCommand(
  options: OperatorSurfaceRuntimeStartOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireSiteRoot(options);
  const carrierSelection = resolveWorkspaceLaunchSelection(options.carrier, 'agent-cli', 'operator_surface', 'command_default');
  const carrier = carrierSelection.value;
  const runtimeSelection = resolveWorkspaceLaunchSelection(
    options.runtime,
    defaultRuntimeForOperatorSurface(carrier),
    'runtime',
    'command_default',
  );
  const runtime = runtimeSelection.value;
  const mcpScope = normalizeExplicitWorkspaceLaunchMcpScope(options.mcpScope ?? 'none', 'operator-surface runtime start safe default');
  const agent = requireAgent(options);
  const existing = getOperatorSurfaceRuntimeStatus({
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
      selection_resolution: buildDirectSelectionResolution(carrierSelection, runtimeSelection, options.intelligenceProvider),
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
    mcpScope,
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
    mcp_scope: mcpScope,
    mode: options.exec ? 'exec' : options.materializeOnly ? 'materialize_only' : 'dry_run',
    agent_start: start,
    launcher_contracts: parsedAgentStart?.launcher_contracts ?? null,
    launch_result_artifact: parsedAgentStart?.launcher_contracts?.launch_result_artifact ?? null,
    operator_projection_open_request: parsedAgentStart?.launcher_contracts?.operator_projection_open_request ?? null,
    selection_resolution: buildDirectSelectionResolution(carrierSelection, runtimeSelection, options.intelligenceProvider),
  };
  return {
    exitCode: isAgentStartAcceptedStatus(start.status) ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
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
