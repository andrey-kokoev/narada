import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NARADA_AGENT_RUNTIME_SERVER_KIND } from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import { buildLaunchProcessOwnership, launchSessionIdFromToken, type LaunchProcessOwnership } from '@narada2/launch-process-ownership';
import type {
  AgentStartCommandResult,
  AgentStartExecutionResult,
  AgentStartOptions,
} from './launcher-contracts.js';
import type { AgentStartResultV0 } from '@narada2/agent-start/launch-result-v0-contract';
import {
  runProcess,
  runProcessDetachedUntilJson,
  runProcessInherited,
  truncateText,
} from './launcher-runtime-process.js';
import { readJsonFile, stringValue } from './launcher-runtime-results.js';
import { tryParseAgentStartResultArtifact } from './agent-start-result-reader.js';
import { resolveAgentStartSessionProjection } from '@narada2/agent-start/launch-result-v0-contract';
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

export function isAgentStartAcceptedStatus(status: AgentStartCommandResult['status']): boolean {
  return status === 'success' || status === 'starting';
}

export function classifyAgentStartLaunchBindingResult(
  executionStatus: AgentStartExecutionResult['status'],
  parsedRecord: AgentStartResultV0 | null,
  parseErrorReason: string | null,
) {
  if (parsedRecord) return classifyAgentStartLaunchBindingStatus(executionStatus, parsedRecord);
  if (executionStatus === 'starting') return classifyAgentStartLaunchBindingStatus(executionStatus, null);
  return { status: 'failed' as const, reason: parseErrorReason ?? 'agent_start_failed' };
}

function failAgentStartBeforeExecution(args: {
  options: AgentStartOptions;
  siteRoot: string;
  workspaceRoot: string;
  command: string[];
  resultPath: string;
  launchSessionId: string | null;
  processOwnership: LaunchProcessOwnership | null;
  reasonCode: string;
  reason: string;
  diagnostics?: Record<string, unknown>;
  status?: 'failed' | 'not_available';
}): AgentStartCommandResult {
  const failure = {
    schema: 'narada.agent_start.preflight_failure.v1',
    status: 'failed',
    mutation_performed: false,
    reason_code: args.reasonCode,
    reason: args.reason,
    required_next_step: 'Fix the agent-start launch preflight failure before retrying the launch.',
    ...(args.diagnostics ? { diagnostics: args.diagnostics } : {}),
  };
  writeFileSync(args.resultPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  writeOperatorProjectionLaunchBinding(args.options.launchBindingPath, {
    status: 'failed',
    siteRoot: args.siteRoot,
    workspaceRoot: args.workspaceRoot,
    agent: args.options.agent,
    operatorSurfaceKind: args.options.carrier ?? args.options.runtime,
    runtimeHostKind: args.options.runtime,
    authority: args.options.authority ?? null,
    intelligenceProvider: args.options.intelligenceProvider ?? null,
    agentStartResultFile: args.resultPath,
    launchSessionId: args.launchSessionId,
    processOwnership: args.processOwnership,
    reason: args.reasonCode,
  });
  return {
    schema: 'narada.agent_start.command_result.v0',
    status: args.status ?? 'failed',
    mutation_performed: false,
    site_root: args.siteRoot,
    agent: args.options.agent,
    carrier: args.options.carrier,
    runtime: args.options.runtime,
    command: args.command,
    result_handoff: 'json_output_file',
    result_file: args.resultPath,
    parsed_result: failure,
    error: args.reason,
  };
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
  if (options.preflightOnly) args.push('--preflight-only');
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
  if (!existsSync(agentStart)) {
    return failAgentStartBeforeExecution({
      options,
      siteRoot,
      workspaceRoot,
      command: [process.execPath, ...args],
      resultPath,
      launchSessionId,
      processOwnership,
      reasonCode: 'agent_start_entrypoint_missing',
      reason: `agent-start entrypoint not found: ${agentStart}`,
      status: 'not_available',
    });
  }

  if (options.dryRun !== true && shouldDetachAgentStartProcess(options)) {
    const syntaxCheckArgs = ['--import', tsxImportPath(), '--check', agentStart];
    const syntaxCheck = runProcess(process.execPath, syntaxCheckArgs, workspaceRoot);
    if (syntaxCheck.status !== 'success') {
      const detail = truncateText(
        syntaxCheck.stderr || syntaxCheck.stdout || syntaxCheck.error || 'agent-start syntax check failed',
        4000,
      );
      return failAgentStartBeforeExecution({
        options,
        siteRoot,
        workspaceRoot,
        command: [process.execPath, ...args],
        resultPath,
        launchSessionId,
        processOwnership,
        reasonCode: 'agent_start_syntax_preflight_failed',
        reason: `agent-start syntax preflight failed: ${detail}`,
        diagnostics: {
          command: [process.execPath, ...syntaxCheckArgs],
          status: syntaxCheck.status,
          exit_code: syntaxCheck.exit_code,
          stdout: syntaxCheck.stdout,
          stderr: syntaxCheck.stderr,
          error: syntaxCheck.error ?? null,
        },
      });
    }
  }

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
  const parsedAttempt = tryParseAgentStartResultArtifact(parsed, resultPath);
  const parsedRecord: AgentStartResultV0 | null = parsedAttempt.record;
  const sessionProjection = parsedRecord ? resolveAgentStartSessionProjection(parsedRecord) : null;
  const launchBindingStatus = classifyAgentStartLaunchBindingResult(
    execution.status,
    parsedRecord,
    parsedAttempt.error?.reason_code ?? null,
  );
  writeOperatorProjectionLaunchBinding(options.launchBindingPath, {
    status: launchBindingStatus.status,
    siteRoot,
    workspaceRoot,
    agent: options.agent,
    operatorSurfaceKind: options.carrier ?? options.runtime,
    runtimeHostKind: options.runtime,
    intelligenceProvider: options.intelligenceProvider ?? null,
    agentStartResultFile: resultPath,
    narsSessionId: sessionProjection?.nars_session_id ?? null,
    runtimeSessionId: sessionProjection?.runtime_session_id ?? null,
    carrierSessionId: sessionProjection?.carrier_session_id ?? null,
    sessionRef: sessionProjection?.session_ref ?? null,
    launchSessionId,
    processOwnership,
    reason: launchBindingStatus.reason,
  });
  return {
    schema: 'narada.agent_start.command_result.v0',
    status: execution.status,
    mutation_performed: isAgentStartAcceptedStatus(execution.status) && options.dryRun !== true,
    site_root: siteRoot,
    agent: options.agent,
    carrier: options.carrier,
    runtime: options.runtime,
    command: [process.execPath, ...args],
    result_handoff: 'json_output_file',
    result_file: resultPath,
    execution: {
      ...execution,
      stdout: parsedRecord ? '' : truncateText(execution.stdout, 1000),
      stderr: truncateText(execution.stderr, 1000),
    },
    parsed_result: parsedRecord ?? parsed,
    error: execution.status === 'failed' ? execution.stderr || execution.error : undefined,
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
