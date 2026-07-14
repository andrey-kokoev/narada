import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NARADA_AGENT_RUNTIME_SERVER_KIND } from '@narada2/carrier-runtime-contract/carrier-runtime-selection';
import { buildLaunchProcessOwnership, launchSessionIdFromToken, type LaunchProcessOwnership } from '@narada2/launch-process-ownership';
import type {
  AgentStartCommandResult,
  AgentStartOptions,
  LaunchResultRecord,
} from './launcher-contracts.js';
import {
  runProcess,
  runProcessDetachedUntilJson,
  runProcessInherited,
  truncateText,
} from './launcher-runtime-process.js';
import { readJsonFile, stringValue } from './launcher-runtime-results.js';
import {
  classifyAgentStartLaunchBindingStatus,
  getOperatorSurfaceRuntimeControlPath,
  getOperatorSurfaceRuntimeStatus,
  writeOperatorProjectionLaunchBinding,
} from './launcher-runtime-projection.js';
import {
  checkWorkspaceDependencyPreflight,
  formatWorkspaceDependencyPreflightFailure,
} from './workspace-dependency-preflight.js';
export {
  classifyAgentStartLaunchBindingStatus,
  getOperatorSurfaceRuntimeControlPath,
  getOperatorSurfaceRuntimeStatus,
  writeOperatorProjectionLaunchBinding,
} from './launcher-runtime-projection.js';

const requireFromLauncherRuntime = createRequire(import.meta.url);

function tsxImportPath(): string {
  return pathToFileURL(requireFromLauncherRuntime.resolve('tsx')).href;
}


export function shouldDetachAgentStartProcess(options: Pick<AgentStartOptions, 'exec' | 'wait' | 'carrier' | 'runtime'>): boolean {
  if (options.exec !== true || options.wait === true) return false;
  return options.runtime === NARADA_AGENT_RUNTIME_SERVER_KIND;
}

export function runAgentStartCommand(options: AgentStartOptions): AgentStartCommandResult {
  const siteRoot = resolve(options.siteRoot);
  const workspaceRoot = options.workspaceRoot ? resolve(options.workspaceRoot) : naradaProperRoot();
  const launchSessionId = options.launchSessionId ?? launchSessionIdFromToken(options.launchBindingPath?.split(/[\\/]/).pop());
  const processOwnership = launchSessionId
    ? buildLaunchProcessOwnership({ launchSessionId, siteRoot, workspaceRoot, processRole: 'runtime_start', createdByPid: process.pid })
    : null;
  const resolvedAgentStart = resolveAgentStartEntrypoint(workspaceRoot);
  const siteRootAgentStart = join(siteRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
  const agentStart = existsSync(resolvedAgentStart) || !existsSync(siteRootAgentStart)
    ? resolvedAgentStart
    : siteRootAgentStart;
  const resultDir = join(workspaceRoot, '.ai', 'runtime', 'agent-start-command-results', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const resultPath = join(resultDir, 'result.json');
  const inheritedInteractiveExec = options.exec === true && options.dryRun !== true;
  const args = [
    '--import',
    tsxImportPath(),
    agentStart,
    options.agent,
    '--target-site-root',
    siteRoot,
    '--site-root',
    siteRoot,
    '--operator-surface',
    options.carrier ?? options.runtime,
    '--runtime',
    options.runtime,
    '--launch-source',
    options.launchSource ?? 'narada operator-surface start',
    '--json-output-file',
    resultPath,
  ];
  if (options.targetSiteId) args.push('--target-site-id', options.targetSiteId);
  if (!inheritedInteractiveExec) args.push('--json');
  if (options.authority) args.push('--authority', options.authority);
  if (options.intelligenceProvider) args.push('--intelligence-provider', options.intelligenceProvider);
  if (options.mcpScope) args.push('--mcp-scope', options.mcpScope);
  if (options.dryRun) args.push('--dry-run');
  if (options.exec) args.push('--exec');
  if (options.wait) args.push('--wait');
  if (options.enableNativeShell) args.push('--enable-native-shell');

  const dependencyPreflight = checkWorkspaceDependencyPreflight(workspaceRoot);
  if (dependencyPreflight.status !== 'ready') {
    return {
      schema: 'narada.agent_start.command_result.v0',
      status: 'not_available',
      mutation_performed: false,
      site_root: siteRoot,
      agent: options.agent,
      carrier: options.carrier,
      runtime: options.runtime,
      command: [process.execPath, ...args],
      error: formatWorkspaceDependencyPreflightFailure(dependencyPreflight),
    };
  }

  mkdirSync(resultDir, { recursive: true });
  writeOperatorProjectionLaunchBinding(options.launchBindingPath, {
    status: 'waiting_for_agent_start',
    siteRoot,
    workspaceRoot,
    agent: options.agent,
    operatorSurfaceKind: options.carrier ?? options.runtime,
    runtimeHostKind: options.runtime,
    authority: options.authority ?? null,
    intelligenceProvider: options.intelligenceProvider ?? null,
    agentStartResultFile: resultPath,
    launchSessionId,
    processOwnership,
  });

  if (!existsSync(agentStart)) {
    return {
      schema: 'narada.agent_start.command_result.v0',
      status: 'not_available',
      mutation_performed: false,
      site_root: siteRoot,
      agent: options.agent,
      carrier: options.carrier,
      runtime: options.runtime,
      command: [process.execPath, ...args],
      result_handoff: 'json_output_file',
      result_file: resultPath,
      error: `agent-start entrypoint not found: ${agentStart}`,
    };
  }

  const executionEnv = {
    NARADA_TARGET_SITE_ROOT: siteRoot,
    ...(options.targetSiteId ? { NARADA_TARGET_SITE_ID: options.targetSiteId } : {}),
    NARADA_LAUNCH_REGISTRY_SITE_ROOT: siteRoot,
    NARADA_LAUNCH_REGISTRY_WORKSPACE_ROOT: workspaceRoot,
    ...(launchSessionId ? { NARADA_LAUNCH_SESSION_ID: launchSessionId } : {}),
    ...(processOwnership ? {
      NARADA_PROCESS_OWNERSHIP: processOwnership.ownership,
      NARADA_PROCESS_ROLE: 'runtime_server',
      NARADA_CREATED_BY_PID: String(processOwnership.created_by_pid ?? process.pid),
    } : {}),
    NARADA_AGENT_ID: options.agent,
    ...(options.intelligenceProvider ? { NARADA_INTELLIGENCE_PROVIDER: options.intelligenceProvider } : {}),
  };
  const execution = shouldDetachAgentStartProcess(options)
    ? runProcessDetachedUntilJson(process.execPath, args, workspaceRoot, resultPath, executionEnv)
    : inheritedInteractiveExec
    ? runProcessInherited(process.execPath, args, workspaceRoot, executionEnv)
    : runProcess(process.execPath, args, workspaceRoot, executionEnv);
  const parsed = readJsonFile(resultPath);
  const parsedRecord = parsed as LaunchResultRecord | null;
  const launchBindingStatus = classifyAgentStartLaunchBindingStatus(execution.status, parsedRecord);
  writeOperatorProjectionLaunchBinding(options.launchBindingPath, {
    status: launchBindingStatus.status,
    siteRoot,
    workspaceRoot,
    agent: options.agent,
    operatorSurfaceKind: options.carrier ?? options.runtime,
    runtimeHostKind: options.runtime,
    intelligenceProvider: options.intelligenceProvider ?? null,
    agentStartResultFile: resultPath,
    narsSessionId: stringValue(parsedRecord?.nars_launch?.nars_session_id ?? parsedRecord?.nars_launch?.session_id ?? parsedRecord?.required_environment?.NARADA_NARS_SESSION_ID),
    runtimeSessionId: stringValue(parsedRecord?.nars_launch?.runtime_session_id ?? parsedRecord?.nars_launch?.session_id ?? parsedRecord?.required_environment?.NARADA_RUNTIME_SESSION_ID),
    carrierSessionId: stringValue(parsedRecord?.carrier_session?.carrier_session_id ?? parsedRecord?.required_environment?.NARADA_CARRIER_SESSION_ID),
    launchSessionId,
    processOwnership,
    reason: launchBindingStatus.reason,
  });
  return {
    schema: 'narada.agent_start.command_result.v0',
    status: execution.status,
    mutation_performed: execution.status === 'success' && options.dryRun !== true,
    site_root: siteRoot,
    agent: options.agent,
    carrier: options.carrier,
    runtime: options.runtime,
    command: [process.execPath, ...args],
    result_handoff: 'json_output_file',
    result_file: resultPath,
    execution: {
      ...execution,
      stdout: parsed ? '' : truncateText(execution.stdout, 1000),
      stderr: truncateText(execution.stderr, 1000),
    },
    parsed_result: parsed,
    error: execution.status === 'success' ? undefined : execution.stderr || execution.error,
  };
}


function naradaProperRoot(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const packageLayoutRoot = resolve(moduleDir, '..', '..', '..', '..', '..');
  return explicitNaradaProperRoot(packageLayoutRoot)
    ?? findNaradaProperRoot(moduleDir)
    ?? findNaradaProperRoot(process.cwd())
    ?? resolve(process.cwd());
}

function resolveAgentStartEntrypoint(workspaceRoot: string): string {
  const naradaRoot = explicitNaradaProperRoot(process.env.NARADA_PROPER_ROOT ?? '')
    ?? explicitNaradaProperRoot(workspaceRoot)
    ?? findNaradaProperRoot(workspaceRoot)
    ?? naradaProperRoot();
  const workspaceEntrypoint = join(naradaRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
  if (existsSync(workspaceEntrypoint)) return workspaceEntrypoint;
  try {
    return requireFromLauncherRuntime.resolve('@narada2/agent-start/narada-agent-start');
  } catch {
    return workspaceEntrypoint;
  }
}

function explicitNaradaProperRoot(candidate: string): string | null {
  const resolved = resolve(candidate);
  return existsSync(join(resolved, 'packages', 'agent-start', 'src', 'narada-agent-start.ts'))
    ? resolved
    : null;
}

function findNaradaProperRoot(start: string): string | null {
  let current = resolve(start);
  const root = parse(current).root;
  while (current && current !== root) {
    if (explicitNaradaProperRoot(current)) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

