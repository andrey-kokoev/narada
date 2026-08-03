type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;
const processEnv: AnyRecord = process.env;

import { spawnHiddenPostureProcess } from '@narada-core/process-launch-posture';
const spawnHiddenPostureProcessAny: AnyFunction = spawnHiddenPostureProcess as AnyFunction;
import { loadSiteMcpFabric, projectServerEnvironment } from '@narada-core/mcp-fabric';
const loadSiteMcpFabricAny: AnyFunction = loadSiteMcpFabric as AnyFunction;
const projectServerEnvironmentAny: AnyFunction = projectServerEnvironment as AnyFunction;
import { buildLaunchProcessOwnershipEvidence, normalizeOptionalString } from '@narada-core/launch-process-ownership';
const buildLaunchProcessOwnershipEvidenceAny: AnyFunction = buildLaunchProcessOwnershipEvidence as AnyFunction;
const normalizeOptionalStringAny: AnyFunction = normalizeOptionalString as AnyFunction;

const CHILD_PROCESS_ENV_ALLOWLIST = Object.freeze([
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'USERNAME',
  'USERDOMAIN',
  'APPDATA',
  'LOCALAPPDATA',
  'HOME',
  'PROGRAMFILES',
  'ProgramFiles',
  'PROGRAMFILES(X86)',
  'ProgramFiles(x86)',
  'ProgramW6432',
  'PROCESSOR_ARCHITECTURE',
  'CODEX_HOME',
  'CODEX_CONFIG_DIR',
  'NARADA_AGENT_ID',
  'NARADA_AGENT_START_EVENT_ID',
  'NARADA_NARS_SESSION_ID',
  'NARADA_RUNTIME_SESSION_ID',
  'NARADA_CARRIER_SESSION_ID',
  'NARADA_SITE_ROOT',
  'NARADA_WORKSPACE_ROOT',
  'NARADA_AGENT_CONTEXT_DB',
  'NARADA_MCP_SCOPE',
  'NARADA_PC_SITE_ROOT',
  'NARADA_PROPER_ROOT',
  'NARADA_CODEX_SUBSCRIPTION_TRANSPORT',
  'OPENAI_API_KEY',
  'KIMI_API_KEY',
  'ANTHROPIC_API_KEY',
  'KIMI_CODE_API_KEY',
  'DEEPSEEK_API_KEY',
  'NARADA_WORKER_MCP_CONFIG',
  'NARADA_LAUNCH_SESSION_ID',
  'NARADA_PROCESS_OWNERSHIP',
  'NARADA_PROCESS_ROLE',
  'NARADA_CREATED_BY_PID',
]);
const MCP_STARTUP_FAILURES_KEY = '__mcp_startup_failures';
const MCP_RUNTIME_DIAGNOSTICS_KEY = '__mcp_runtime_diagnostics';
const MCP_TOOL_NAME_ALIASES: Record<string, string> = Object.freeze({
  agent_context_output_show: 'mcp_output_show',
});

const WORKER_MCP_STARTUP_TOOL_NAMES = Object.freeze([
  'agent_context_startup_sequence',
  'agent_context_whoami',
  'agent_context_show_bootstrap',
  'agent_context_doctrinal_grounding',
]);

const WORKER_MCP_OUTPUT_READBACK_TOOL_NAMES = Object.freeze([
  'fs_read_file',
  'fs_read_file_range',
  'fs_grep_search',
  'mcp_output_show',
]);

function buildChildProcessEnv(extra: AnyRecord = {}, baseEnv: AnyRecord = processEnv): AnyRecord {
  const env: AnyRecord = {};
  for (const key of CHILD_PROCESS_ENV_ALLOWLIST) {
    if (baseEnv[key] !== undefined) env[key] = baseEnv[key];
  }
  const projected: AnyRecord = { ...env, ...extra, FORCE_COLOR: '0', NO_COLOR: '1' };
  delete projected.NARADA_INTELLIGENCE_PROVIDER;
  delete projected.NARADA_AI_MODEL;
  delete projected.NARADA_AI_BASE_URL;
  delete projected.NARADA_AI_THINKING;
  delete projected.NARADA_THINKING_LEVEL;
  delete projected.OPENAI_BASE_URL;
  delete projected.OPENAI_MODEL;
  delete projected.KIMI_API_BASE_URL;
  delete projected.KIMI_MODEL;
  delete projected.KIMI_CODE_API_BASE_URL;
  delete projected.KIMI_CODE_MODEL;
  delete projected.ANTHROPIC_BASE_URL;
  delete projected.ANTHROPIC_MODEL;
  delete projected.CODEX_MODEL;
  delete projected.NARADA_CODEX_MODEL;
  delete projected.DEEPSEEK_API_BASE_URL;
  delete projected.DEEPSEEK_MODEL;
  delete projected.GLM_MODEL;
  delete projected.GLM_API_BASE_URL;
  delete projected.OPENROUTER_MODEL;
  delete projected.OPENROUTER_BASE_URL;
  delete projected.OPENROUTER_API_BASE_URL;
  delete projected.CLOUDFLARE_CARRIER_AI_MODEL;
  return projected;
}

function mcpChildOwnershipEnvironment(ownershipContext: AnyRecord = {}): AnyRecord {
  const launchSessionId = normalizeOptionalStringAny(ownershipContext.launch_session_id ?? ownershipContext.launchSessionId);
  if (!launchSessionId) return {};
  return {
    NARADA_LAUNCH_SESSION_ID: launchSessionId,
    NARADA_PROCESS_OWNERSHIP: 'session_owned',
    NARADA_PROCESS_ROLE: 'mcp_child',
    ...(ownershipContext.pid != null ? { NARADA_CREATED_BY_PID: String(ownershipContext.pid) } : {}),
  };
}

function buildMcpChildOwnershipEvidence({ siteRoot, serverName, ownershipContext = {}, pid = null }: AnyRecord = {}): AnyRecord | null {
  const launchSessionId = normalizeOptionalStringAny(ownershipContext.launch_session_id ?? ownershipContext.launchSessionId);
  if (!launchSessionId) return null;
  return buildLaunchProcessOwnershipEvidenceAny({
    launchSessionId,
    ownership: 'session_owned',
    processRole: 'mcp_child',
    ownerSiteRoot: siteRoot,
    workspaceRoot: ownershipContext.workspace_root ?? ownershipContext.workspaceRoot ?? null,
    createdByPid: ownershipContext.pid ?? ownershipContext.created_by_pid ?? ownershipContext.createdByPid,
    parentProcessRole: ownershipContext.process_role ?? ownershipContext.processRole ?? null,
    serverName,
    pid,
  });
}

function attachMcpStartupFailures(mcpServers: AnyRecord, failures: any[] = []): AnyRecord {
  Object.defineProperty(mcpServers, MCP_STARTUP_FAILURES_KEY, {
    value: Array.isArray(failures) ? failures.slice() : [],
    enumerable: false,
    configurable: true,
  });
  if (!Object.prototype.hasOwnProperty.call(mcpServers, MCP_RUNTIME_DIAGNOSTICS_KEY)) {
    Object.defineProperty(mcpServers, MCP_RUNTIME_DIAGNOSTICS_KEY, {
      value: [],
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  return mcpServers;
}

function getMcpStartupFailures(mcpServers: AnyRecord | null): any[] {
  const failures = mcpServers?.[MCP_STARTUP_FAILURES_KEY];
  return Array.isArray(failures) ? failures : [];
}

function formatMcpStartupFailureSummary(failures: any[]): string {
  const normalized = Array.isArray(failures) ? failures : [];
  if (normalized.length === 0) return '0';
  const details = normalized
    .slice(0, 3)
    .map((failure: any) => `${failure.server_name ?? 'unknown'}:${failure.code ?? 'error'}`)
    .join(', ');
  return normalized.length > 3 ? `${normalized.length} (${details}, ...)` : `${normalized.length} (${details})`;
}

function getMcpRuntimeDiagnostics(mcpServers: AnyRecord | null): any[] {
  const diagnostics = mcpServers?.[MCP_RUNTIME_DIAGNOSTICS_KEY];
  return Array.isArray(diagnostics) ? diagnostics : [];
}

function rememberMcpRuntimeDiagnostic(mcpServers: AnyRecord | null, diagnostic: AnyRecord): any[] {
  if (!mcpServers) return [];
  if (!Object.prototype.hasOwnProperty.call(mcpServers, MCP_RUNTIME_DIAGNOSTICS_KEY)) {
    Object.defineProperty(mcpServers, MCP_RUNTIME_DIAGNOSTICS_KEY, {
      value: [],
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  const diagnostics: any[] = mcpServers[MCP_RUNTIME_DIAGNOSTICS_KEY];
  diagnostics.push(diagnostic);
  if (diagnostics.length > 10) diagnostics.splice(0, diagnostics.length - 10);
  return diagnostics;
}

function formatMcpRuntimeDiagnosticSummary(diagnostics: any[]): string {
  const normalized = Array.isArray(diagnostics) ? diagnostics : [];
  if (normalized.length === 0) return '0';
  const details = normalized
    .slice(-3)
    .map((diagnostic: any) => `${diagnostic.server_name ?? 'unknown'}:${diagnostic.tool_name ?? '<missing>'}`)
    .join(', ');
  return normalized.length > 3 ? `${normalized.length} (${details}, ...)` : `${normalized.length} (${details})`;
}

function mcpOperationalState(mcpServers: AnyRecord | null): string {
  const startupFailures = getMcpStartupFailures(mcpServers);
  return startupFailures.length === 0 ? 'healthy' : 'startup_degraded';
}

function createMcpStatusSnapshot(mcpServers: AnyRecord | null): AnyRecord {
  const startupFailures = getMcpStartupFailures(mcpServers);
  const runtimeDiagnostics = getMcpRuntimeDiagnostics(mcpServers);
  return {
    mcp_operational_state: mcpOperationalState(mcpServers),
    mcp_startup_failure_count: startupFailures.length,
    mcp_startup_failures: startupFailures,
    mcp_startup_failure_summary: formatMcpStartupFailureSummary(startupFailures),
    mcp_runtime_fault_count: runtimeDiagnostics.length,
    mcp_runtime_faults: runtimeDiagnostics,
    mcp_runtime_fault_summary: formatMcpRuntimeDiagnosticSummary(runtimeDiagnostics),
  };
}

function mcpToolEffectAdmissionEvidence({ serverMode, admissionClassification, status, category }: AnyRecord): AnyRecord {
  if (category === 'block') {
    return {
      admission_action: 'deny',
      admission_reason: 'unsupported_tool_effect',
    };
  }
  if (!serverMode || !admissionClassification) return {};
  if (admissionClassification.decision === 'read_only_admitted') {
    return {
      admission_action: 'admit',
      admission_reason: 'read_only_tool_effect_admitted',
      authority_ref: admissionClassification.authority_owner ?? undefined,
    };
  }
  if (admissionClassification.decision === 'mcp_surface_tool_admitted') {
    return {
      admission_action: 'admit',
      admission_reason: 'surface_registry_declared_tool_effect_admitted',
      authority_ref: admissionClassification.authority_owner ?? undefined,
    };
  }
  if (admissionClassification.decision === 'routed') {
    return {
      admission_action: 'deny',
      admission_reason: 'tool_effect_admission_required',
      authority_ref: admissionClassification.authority_owner ?? undefined,
    };
  }
  if (status === 'denied') {
    return {
      admission_action: 'deny',
      admission_reason: 'unsupported_tool_effect',
      authority_ref: admissionClassification.authority_owner ?? undefined,
    };
  }
  return {};
}

function toolFailureRecovery(message: any): string | null {
  const text = String(message ?? '');
  if (!text.includes('inline_payload_too_long')) return null;
  return 'Recovery: call mcp_payload_create with {"payload":{...}}, then retry the original tool with {"payload_ref":"mcp_payload:<id>@v1"}. Do not print JSON as prose.';
}

function classifyTool(name: string, args: AnyRecord): string {
  return 'prompt';
}

// ---------------------------------------------------------------------------
// MCP Server Discovery & Management
// ---------------------------------------------------------------------------
async function discoverAndStartMcpServers(siteRoot: string, ownershipContext: AnyRecord = {}): Promise<AnyRecord> {
  if (isMcpScopeDisabled()) return {};
  const fabricRequired = isMcpFabricRequired();
  let fabric;
  try {
    fabric = loadSiteMcpFabricAny(siteRoot, {
      required: fabricRequired,
      validateRegistry: fabricRequired,
    });
  } catch (error) {
    if (isMcpStartupDiagnosticError(error)) throw error;
    throw createMcpStartupError('mcp_fabric_load_failed', `MCP fabric load failed: ${error instanceof Error ? error.message : String(error)}`, {
      phase: 'fabric_load',
      site_root: siteRoot,
      cause_code: (error as AnyRecord).code ?? null,
      details: (error as AnyRecord).details ?? {},
    });
  }
  if (fabricRequired && Object.keys(fabric.servers).length === 0) {
    throw createMcpStartupError('mcp_fabric_empty', `No MCP servers found in ${fabric.mcp_dir}`, {
      phase: 'fabric_load',
      site_root: siteRoot,
      mcp_dir: fabric.mcp_dir,
      files: fabric.files ?? [],
      registry_validation: fabric.registry_validation ?? null,
    });
  }

  const workerProjection = workerMcpProjectionFromEnv();
  const fabricServers = projectWorkerMcpFabricServers(fabric.servers, workerProjection);
  const servers: AnyRecord = {};
  const failures: any[] = [];
  for (const [serverName, serverConfig] of Object.entries(fabricServers as AnyRecord) as [string, AnyRecord][]) {
    try {
      servers[serverName] = await createRuntimeMcpServer({ siteRoot, serverName, serverConfig, ownershipContext });
    } catch (err) {
      const failure = mcpStartupDiagnostic(err, {
        code: 'mcp_server_spawn_failed',
        phase: 'spawn',
        server_name: serverName,
        command: serverConfig.command,
        args: serverConfig.args,
      });
      failures.push(failure);
      console.error(`[carrier-runtime] Failed to start MCP server ${serverName}: ${failure.message}`);
    }
  }

  if (fabricRequired && failures.length > 0) {
    throw createMcpStartupError('mcp_startup_failed', 'One or more required MCP servers failed startup', {
      phase: 'startup',
      site_root: siteRoot,
      failures,
    });
  }

  attachMcpStartupFailures(servers, failures);
  return servers;
}

async function createRuntimeMcpServer({ siteRoot, serverName, serverConfig, ownershipContext = {} }: AnyRecord): Promise<AnyRecord> {
  const runtime = {
    process: null,
    send: null,
    tools: [],
    config: serverConfig,
    registry_tools: serverConfig.registry_tools ?? {},
    registry_source: serverConfig.registry_source ?? null,
    registry_metadata_authoritative: serverConfig.registry_metadata_authoritative === true,
    restart_count: 0,
    ownership_context: ownershipContext,
    last_disconnect_error: null,
    last_restart_error: null,
    restarting: null,
    process_ownership: buildMcpChildOwnershipEvidence({ siteRoot, serverName, ownershipContext }),
  };

  await hydrateRuntimeMcpServer(runtime, { siteRoot, serverName, serverConfig, ownershipContext, reason: 'startup' });
  return runtime;
}

async function hydrateRuntimeMcpServer(runtime: AnyRecord, { siteRoot, serverName, serverConfig, ownershipContext = {}, reason }: AnyRecord): Promise<AnyRecord> {
  const args = [...serverConfig.args];
  const proc: any = spawnHiddenPostureProcessAny(serverConfig.command, args, {
    posture: 'mcp_server',
    cwd: siteRoot,
    env: buildChildProcessEnv({
      ...projectServerEnvironmentAny(serverConfig),
      ...mcpChildOwnershipEnvironment(ownershipContext),
    }),
  });
  runtime.process_ownership = buildMcpChildOwnershipEvidence({ siteRoot, serverName, ownershipContext });

  let buffer = '';
  const stdoutPollution: string[] = [];
  const stderrDiagnostics: string[] = [];
  let disconnectedError: Error | null = null;
  const pending = new Map<number, AnyRecord>();
  const startupTimeoutMs = Math.max(1, Number(serverConfig.startup_timeout_sec ?? 10) * 1000);
  const requestTimeoutMs = Math.max(1, Number(serverConfig.request_timeout_ms ?? ownershipContext.request_timeout_ms ?? 15000));

  const rejectPending = (error: any) => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    pending.clear();
  };
  const markDisconnected = (error: any) => {
    const normalizedError = error instanceof Error
      ? error
      : new Error(String(error ?? `MCP server ${serverName} disconnected`));
    if (!disconnectedError) disconnectedError = normalizedError;
    runtime.last_disconnect_error = {
      message: normalizedError.message,
      occurred_at: new Date().toISOString(),
      reason,
    };
    rejectPending(normalizedError);
  };

  proc.stdout.setEncoding('utf-8');
  proc.stderr.setEncoding('utf-8');
  proc.stderr.on('data', (d: any) => {
    const msg = d.toString().trim();
    if (shouldSuppressMcpStderr(msg)) return;
    if (msg) stderrDiagnostics.push(msg.slice(0, 1000));
    if (msg) process.stderr.write(`[${serverName}] ${msg}\n`);
  });

  proc.on('error', (error: any) => markDisconnected(error));
  proc.on('exit', (code: any, signal: any) => {
    markDisconnected(new Error(`MCP server ${serverName} exited${code === null ? '' : ` with code ${code}`}${signal ? ` signal ${signal}` : ''}`));
  });
  proc.stdin.on('error', (error: any) => markDisconnected(error));
  proc.stdout.on('error', (error: any) => markDisconnected(error));
  proc.stderr.on('error', (error: any) => markDisconnected(error));

  proc.stdout.on('data', (chunk: any) => {
    buffer += chunk;
    const drained = drainMcpStdoutMessages(buffer);
    buffer = drained.rest;
    for (const pollution of drained.stdoutPollution) stdoutPollution.push(pollution.slice(0, 1000));
    for (const msg of drained.messages) {
      if (msg.id != null && pending.has(msg.id)) {
        const request = pending.get(msg.id)!;
        clearTimeout(request.timeout);
        request.resolve(msg);
        pending.delete(msg.id);
      }
    }
  });

  const sendDirect = (req: AnyRecord, timeoutMs = requestTimeoutMs, timeoutCode = 'mcp_request_timeout', abortSignal: any = null): Promise<any> => new Promise<any>((resolve, reject) => {
    if (disconnectedError) {
      reject(disconnectedError);
      return;
    }
    if (abortSignal?.aborted) {
      reject(new Error('agent_cli_interrupt_requested'));
      return;
    }
    let settled = false;
    const settle = (fn: any, value: any) => {
      if (settled) return;
      settled = true;
      abortSignal?.removeEventListener?.('abort', onAbort);
      fn(value);
    };
    const resolveWrapped = (value: any) => settle(resolve, value);
    const rejectWrapped = (value: any) => settle(reject, value);
    const onAbort = () => {
      if (pending.has(req.id)) {
        clearTimeout(timeout);
        pending.delete(req.id);
      }
      rejectWrapped(new Error('agent_cli_interrupt_requested'));
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => {
      if (pending.has(req.id)) {
        pending.delete(req.id);
        rejectWrapped(createMcpStartupError(timeoutCode, `MCP request timeout after ${timeoutMs}ms`, {
          phase: req.method,
          server_name: serverName,
          timeout_ms: timeoutMs,
          stdout_pollution: stdoutPollution,
          stderr: stderrDiagnostics,
        }));
      }
    }, timeoutMs);
    pending.set(req.id, { resolve: resolveWrapped, reject: rejectWrapped, timeout });
    try {
      proc.stdin.write(`${JSON.stringify(req)}\n`, (error: any) => {
        if (!error || !pending.has(req.id)) return;
        const request = pending.get(req.id)!;
        clearTimeout(request.timeout);
        pending.delete(req.id);
        markDisconnected(error);
        request.reject(error);
      });
    } catch (error) {
      if (pending.has(req.id)) {
        const request = pending.get(req.id)!;
        clearTimeout(request.timeout);
        pending.delete(req.id);
        request.reject(error);
      }
      markDisconnected(error);
    }
  });

  let toolsResult: any;
  try {
    await sendDirect(
      { jsonrpc: '2.0', id: randomId(), method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      startupTimeoutMs,
      'mcp_startup_timeout',
    );
    toolsResult = await sendDirect(
      { jsonrpc: '2.0', id: randomId(), method: 'tools/list', params: {} },
      startupTimeoutMs,
      'mcp_tool_hydration_timeout',
    );
  } catch (err) {
    const failure = mcpStartupDiagnostic(err, {
      code: 'mcp_server_startup_failed',
      phase: 'initialize_or_tools_list',
      server_name: serverName,
      command: serverConfig.command,
      args: serverConfig.args,
      stdout_pollution: stdoutPollution,
      stderr: stderrDiagnostics,
      restart_count: runtime.restart_count,
      restart_reason: reason,
    });
    await stopMcpStartupProcess(proc);
    const error = createMcpStartupError(failure.code, failure.message, failure);
    error.diagnostic = failure;
    throw error;
  }

  if (stdoutPollution.length > 0) {
    const failure = {
      schema: 'narada.agent_cli.mcp_startup_diagnostic.v0',
      code: 'mcp_stdout_pollution',
      message: `MCP server ${serverName} emitted non-JSON stdout during startup`,
      phase: 'initialize_or_tools_list',
      server_name: serverName,
      stdout_pollution: stdoutPollution,
      stderr: stderrDiagnostics,
      restart_count: runtime.restart_count,
      restart_reason: reason,
    };
    await stopMcpStartupProcess(proc);
    const error = createMcpStartupError(failure.code, failure.message, failure);
    error.diagnostic = failure;
    throw error;
  }

  runtime.process = proc;
  runtime.process_ownership = buildMcpChildOwnershipEvidence({
    siteRoot,
    serverName,
    ownershipContext,
    pid: runtime.process?.child?.pid ?? runtime.process?.pid ?? null,
  });
  runtime.tools = normalizeRuntimeMcpTools(toolsResult.result?.tools ?? []);
  runtime.send = async (req: AnyRecord, timeoutMs = requestTimeoutMs, timeoutCode = 'mcp_request_timeout', abortSignal: any = null) => {
    if (!disconnectedError) return sendDirect(req, timeoutMs, timeoutCode, abortSignal);
    await restartRuntimeMcpServer(runtime, { siteRoot, serverName, serverConfig, ownershipContext: runtime.ownership_context, reason: `disconnected_before_request:${disconnectedError.message}` });
    return runtime.send(req, timeoutMs, timeoutCode, abortSignal);
  };
  runtime.last_restart_error = null;
  return runtime;
}

async function restartRuntimeMcpServer(runtime: AnyRecord, { siteRoot, serverName, serverConfig, ownershipContext = {}, reason }: AnyRecord): Promise<any> {
  if (runtime.restarting) return runtime.restarting;
  runtime.restarting = (async () => {
    const previousProcess = runtime.process;
    if (previousProcess && previousProcess.exitCode === null && previousProcess.signalCode === null) {
      await stopMcpStartupProcess(previousProcess);
    }
    runtime.restart_count += 1;
    try {
      await hydrateRuntimeMcpServer(runtime, { siteRoot, serverName, serverConfig, ownershipContext, reason });
    } catch (error) {
      runtime.last_restart_error = {
        message: error instanceof Error ? error.message : String(error),
        occurred_at: new Date().toISOString(),
        reason,
        restart_count: runtime.restart_count,
      };
      throw error;
    } finally {
      runtime.restarting = null;
    }
  })();
  return runtime.restarting;
}

function stopMcpStartupProcess(proc: any): Promise<void> {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((resolveStop: any) => {
    const timeout = setTimeout(resolveStop, 1000);
    proc.once('exit', () => {
      clearTimeout(timeout);
      resolveStop();
    });
    proc.kill();
  });
}

export function drainMcpStdoutMessages(input: any): AnyRecord {
  let rest = String(input ?? '');
  const messages: any[] = [];
  const stdoutPollution = [];
  while (rest.length > 0) {
    const trimmedStart = rest.replace(/^\s+/, '');
    if (trimmedStart.length !== rest.length) rest = trimmedStart;
    if (rest.length === 0) break;

    if (/^Content-Length:/i.test(rest)) {
      const crlfHeaderEnd = rest.indexOf('\r\n\r\n');
      const lfHeaderEnd = rest.indexOf('\n\n');
      const headerEnd = crlfHeaderEnd !== -1 ? crlfHeaderEnd : lfHeaderEnd;
      if (headerEnd === -1) break;
      const separatorLength = crlfHeaderEnd !== -1 ? 4 : 2;
      const header = rest.slice(0, headerEnd);
      const match = /^Content-Length:\s*(\d+)\s*$/im.exec(header);
      if (!match) {
        stdoutPollution.push(header.slice(0, 1000));
        rest = rest.slice(headerEnd + separatorLength);
        continue;
      }
      const bodyLength = Number(match[1]);
      const bodyStart = headerEnd + separatorLength;
      const bodyEnd = bodyStart + bodyLength;
      if (rest.length < bodyEnd) break;
      const body = rest.slice(bodyStart, bodyEnd);
      rest = rest.slice(bodyEnd);
      try {
        messages.push(JSON.parse(body));
      } catch {
        stdoutPollution.push(body.slice(0, 1000));
      }
      continue;
    }

    const lineEnd = rest.indexOf('\n');
    if (lineEnd === -1) break;
    const line = rest.slice(0, lineEnd).trim();
    rest = rest.slice(lineEnd + 1);
    if (!line) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      stdoutPollution.push(line.slice(0, 1000));
    }
  }
  return { messages, rest, stdoutPollution };
}

function isMcpFabricRequired(): boolean {
  if (processEnv.NARADA_AGENT_CLI_REQUIRE_MCP_FABRIC === '0') return false;
  if (processEnv.NARADA_AGENT_CLI_REQUIRE_MCP_FABRIC === '1') return true;
  if (isMcpScopeDisabled()) return false;
  return processEnv.NARADA_SITE_ROOT !== undefined
    && processEnv.NARADA_AGENT_ID !== undefined
    && (processEnv.NARADA_AGENT_START_EVENT_ID !== undefined
      || processEnv.NARADA_NARS_SESSION_ID !== undefined
      || processEnv.NARADA_RUNTIME_SESSION_ID !== undefined
      || processEnv.NARADA_CARRIER_SESSION_ID !== undefined);
}

function isMcpScopeDisabled(): boolean {
  return String(processEnv.NARADA_MCP_SCOPE ?? '').trim().toLowerCase() === 'none'
    && processEnv.NARADA_AGENT_CLI_REQUIRE_MCP_FABRIC !== '1';
}

function createMcpStartupError(code: string, message: string, details: AnyRecord = {}): AnyRecord {
  const error: AnyRecord = new Error(message);
  (error as AnyRecord).code = code;
  (error as AnyRecord).details = details;
  error.diagnostic = {
    schema: 'narada.agent_cli.mcp_startup_diagnostic.v0',
    ...details,
    code,
    message,
  };
  return error;
}

function isMcpStartupDiagnosticError(error: any): boolean {
  return Boolean(error?.diagnostic && typeof error.diagnostic === 'object');
}

function mcpStartupDiagnostic(error: any, defaultFields: AnyRecord = {}): AnyRecord {
  if (error?.diagnostic) return error.diagnostic;
  const message = error instanceof Error ? error.message : String(error);
  return {
    schema: 'narada.agent_cli.mcp_startup_diagnostic.v0',
    ...defaultFields,
    message,
  };
}

function shouldSuppressMcpStderr(message: any): boolean {
  if (!message) return true;
  return (
    message.includes('ExperimentalWarning: SQLite is an experimental feature') ||
    message.includes('Use `node --trace-warnings ...` to show where the warning was created')
  );
}

function aggregateTools(mcpServers: AnyRecord): AnyRecord[] {
  return aggregateToolBindings(mcpServers).map(({ providerToolName, tool }: AnyRecord) => ({
    type: 'function',
    function: {
      name: providerToolName,
      description: tool.description ?? '',
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}

function workerMcpProjectionFromEnv(env: AnyRecord = processEnv): AnyRecord | null {
  return parseWorkerMcpProjectionConfig(env.NARADA_WORKER_MCP_CONFIG);
}

function parseWorkerMcpProjectionConfig(value: any): AnyRecord | null {
  if (value === undefined || value === null || value === '') return null;
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch (error) {
    throw createMcpStartupError('worker_mcp_config_invalid_json', `Invalid NARADA_WORKER_MCP_CONFIG JSON: ${error instanceof Error ? error.message : String(error)}`, {
      phase: 'worker_mcp_projection',
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createMcpStartupError('worker_mcp_config_invalid', 'NARADA_WORKER_MCP_CONFIG must be a JSON object', {
      phase: 'worker_mcp_projection',
    });
  }
  const mode = String(parsed.native_mcp_mode ?? parsed.mode ?? 'scoped').trim().toLowerCase();
  if (!['minimal', 'scoped', 'full'].includes(mode)) {
    throw createMcpStartupError('worker_mcp_mode_invalid', `Unsupported worker MCP mode: ${mode}`, {
      phase: 'worker_mcp_projection',
      native_mcp_mode: mode,
    });
  }
  return {
    schema: parsed.schema ?? 'narada.worker.mcp_projection.v1',
    native_mcp_mode: mode,
    mcp_tool_allowlist: normalizeWorkerMcpToolList(parsed.mcp_tool_allowlist ?? parsed.required_mcp_tools ?? []),
    include_startup_tools: parsed.include_startup_tools !== false,
    include_output_readback_tools: parsed.include_output_readback_tools === true,
  };
}

function normalizeWorkerMcpToolList(value: any): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set();
  for (const item of value) {
    const text = String(item ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function workerMcpAllowedToolNames(config: AnyRecord): Set<string> {
  const allowed = new Set<string>();
  if (config.include_startup_tools !== false) {
    for (const name of WORKER_MCP_STARTUP_TOOL_NAMES) allowed.add(name);
  }
  if (config.native_mcp_mode === 'scoped') {
    for (const name of config.mcp_tool_allowlist ?? []) allowed.add(name);
  }
  if (config.include_output_readback_tools === true) {
    for (const name of WORKER_MCP_OUTPUT_READBACK_TOOL_NAMES) allowed.add(name);
  }
  return allowed;
}

function workerMcpDeclaredTools(server: AnyRecord): AnyRecord[] {
  const declared: AnyRecord[] = [];
  const append = (value: any) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) {
        declared.push({ name: item });
      } else if (item && typeof item === 'object' && item.name) {
        declared.push(item);
      }
    }
  };

  append(server.tools);
  append(server.allowed_tools);
  append(server.tool_names);
  append(server.surface_projection?.surface_descriptor?.tools);
  if (declared.length > 0) return declared;

  for (const [name, item] of Object.entries(server.registry_tools ?? {}) as [string, AnyRecord][]) {
    if (!item || item.refused === true) continue;
    declared.push({ ...item, name: item.name ?? name });
  }
  return declared;
}

function projectWorkerMcpFabricServers(mcpServers: AnyRecord, config: AnyRecord | null): AnyRecord {
  if (!config || config.native_mcp_mode === 'full') return mcpServers;
  const allowed = workerMcpAllowedToolNames(config);
  const projected: AnyRecord = {};
  for (const [serverName, server] of Object.entries(mcpServers ?? {}) as [string, AnyRecord][]) {
    const seenProviderNames = new Set();
    const tools = workerMcpDeclaredTools(server).filter((tool: AnyRecord) => workerMcpToolAllowed({
      serverName,
      tool,
      allowed,
      seenProviderNames,
    }));
    if (tools.length > 0) projected[serverName] = server;
  }
  return projected;
}

function applyWorkerMcpProjection(mcpServers: AnyRecord, config: AnyRecord | null = workerMcpProjectionFromEnv()): AnyRecord {
  if (!config || config.native_mcp_mode === 'full') return mcpServers;
  const allowed = workerMcpAllowedToolNames(config);

  const projected: AnyRecord = {};
  for (const [serverName, server] of Object.entries(mcpServers ?? {}) as [string, AnyRecord][]) {
    const seenProviderNames = new Set();
    const tools = (server.tools ?? []).filter((tool: any) => workerMcpToolAllowed({ serverName, tool, allowed, seenProviderNames }));
    if (tools.length > 0) projected[serverName] = { ...server, tools };
  }
  attachMcpStartupFailures(projected, getMcpStartupFailures(mcpServers));
  Object.defineProperty(projected, '__mcp_worker_projection', {
    value: {
      schema: 'narada.worker.mcp_projection.applied.v1',
      native_mcp_mode: config.native_mcp_mode,
      requested_tool_count: config.mcp_tool_allowlist?.length ?? 0,
      exposed_server_count: Object.keys(projected).length,
      exposed_tool_server_count: Object.values(projected).filter((server: any) => (server.tools ?? []).length > 0).length,
      exposed_tool_count: aggregateToolBindings(projected).length,
    },
    enumerable: false,
    configurable: true,
  });
  return projected;
}

function workerMcpToolAllowed({ serverName, tool, allowed, seenProviderNames }: AnyRecord): boolean {
  if (!tool?.name) return false;
  const providerName = providerSafeToolName(tool.name, seenProviderNames);
  seenProviderNames.add(providerName);
  const candidates = [
    tool.name,
    providerName,
    `${serverName}.${tool.name}`,
    `${serverName}.${providerName}`,
    `mcp__${serverName.replace(/-/g, '_')}__${tool.name}`,
    `mcp__${serverName.replace(/-/g, '_')}__${providerName}`,
  ];
  return candidates.some((candidate: any) => allowed.has(candidate));
}

function aggregateToolBindings(mcpServers: AnyRecord): AnyRecord[] {
  const candidates: AnyRecord[] = [];
  const originalNameCounts = new Map();
  for (const [serverName, server] of Object.entries(mcpServers ?? {})) {
    for (const tool of server.tools ?? []) {
      if (!tool?.name) continue;
      candidates.push({ serverName, server, tool });
      originalNameCounts.set(tool.name, (originalNameCounts.get(tool.name) ?? 0) + 1);
    }
  }

  const seenProviderNames = new Set();
  return candidates.map(({ serverName, server, tool }: AnyRecord) => {
    const providerIdentity = originalNameCounts.get(tool.name) > 1
      ? `mcp__${serverName}__${tool.name}`
      : tool.name;
    const providerToolName = providerSafeToolName(providerIdentity, seenProviderNames);
    seenProviderNames.add(providerToolName);
    return { serverName, server, tool, providerToolName };
  });
}

function canonicalMcpToolName(name: any): string {
  return MCP_TOOL_NAME_ALIASES[String(name ?? '')] ?? String(name ?? '');
}

function normalizeRuntimeMcpTools(tools: any[]): AnyRecord[] {
  const byCanonicalName = new Map();
  for (const tool of tools ?? []) {
    if (!tool?.name) continue;
    const canonicalName = canonicalMcpToolName(tool.name);
    const existing = byCanonicalName.get(canonicalName);
    if (existing && tool.name !== canonicalName) continue;
    byCanonicalName.set(canonicalName, tool.name === canonicalName
      ? tool
      : { ...tool, name: canonicalName, runtime_tool_name: tool.name });
  }
  return [...byCanonicalName.values()];
}

function providerSafeToolName(toolName: any, seenProviderNames: Set<any> = new Set()): string {
  const raw = String(toolName ?? '');
  let name = raw.replace(/[^A-Za-z0-9_-]/g, '_');
  if (!/^[A-Za-z]/.test(name)) name = `tool_${name}`;
  if (!name) name = 'tool';
  if (!seenProviderNames.has(name)) return name;
  const hash = shortStableHash(raw);
  const withHash = `${name}_${hash}`;
  if (!seenProviderNames.has(withHash)) return withHash;
  let index = 2;
  while (seenProviderNames.has(`${withHash}_${index}`)) index += 1;
  return `${withHash}_${index}`;
}

function shortStableHash(value: any): string {
  let hash = 2166136261;
  for (const char of String(value ?? '')) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).slice(0, 6);
}

function providerToolNameForOriginal(toolName: any, mcpServers: AnyRecord): string | null {
  const bindings = aggregateToolBindings(mcpServers).filter(({ tool }: AnyRecord) => tool.name === toolName);
  if (bindings.length > 1) return null;
  return bindings[0]?.providerToolName ?? providerSafeToolName(toolName);
}

function originalToolNameForProvider(providerToolName: any, mcpServers: AnyRecord): string {
  const binding = aggregateToolBindings(mcpServers).find(({ providerToolName: candidate }: AnyRecord) => candidate === providerToolName);
  return binding?.tool?.name ?? providerToolName;
}

function findToolServer(name: any, mcpServers: AnyRecord): AnyRecord | null {
  return findToolBinding(name, mcpServers)?.server ?? null;
}

function findToolBinding(name: any, mcpServers: AnyRecord): AnyRecord | null {
  const bindings = aggregateToolBindings(mcpServers);
  const providerBinding = bindings.find(({ providerToolName }: AnyRecord) => providerToolName === name);
  if (providerBinding) {
    return {
      server: { ...providerBinding.server, name: providerBinding.serverName },
      tool: providerBinding.tool,
    };
  }

  const originalBindings = bindings.filter(({ tool }: AnyRecord) => tool.name === name);
  if (originalBindings.length !== 1) return null;
  const [binding] = originalBindings;
  return { server: { ...binding.server, name: binding.serverName }, tool: binding.tool };
}
async function sendMcpRequest(server: AnyRecord, request: AnyRecord, abortSignal: any = null): Promise<any> {
  if (abortSignal?.aborted) {
    throw new Error('agent_cli_interrupt_requested');
  }
  let response;
  try {
    response = await server.send(request, undefined, undefined, abortSignal);
  } catch (error) {
    if (abortSignal?.aborted) throw error;
    response = await server.send(request, undefined, undefined, abortSignal);
  }
  if (response.error) throw new Error(response.error instanceof Error ? response.error.message : String(response.error));
  return normalizeMcpOutputReader(response.result);
}

function normalizeMcpOutputReader(value: any, key: string | null = null): any {
  if (Array.isArray(value)) return value.map((item: any) => normalizeMcpOutputReader(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]: any) => [
      entryKey,
      normalizeMcpOutputReader(entryValue, entryKey),
    ]));
  }
  if (typeof value !== 'string') return value;
  if (key === 'reader_tool' || key === 'readerTool') return canonicalMcpToolName(value);
  if (key === 'read_command' || key === 'remediation') {
    return value.replaceAll('agent_context_output_show', 'mcp_output_show');
  }
  if (key === 'text') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(normalizeMcpOutputReader(parsed));
    } catch {
      return value;
    }
  }
  return value;
}

function randomId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export {
  buildChildProcessEnv,
  attachMcpStartupFailures,
  getMcpStartupFailures,
  formatMcpStartupFailureSummary,
  getMcpRuntimeDiagnostics,
  rememberMcpRuntimeDiagnostic,
  formatMcpRuntimeDiagnosticSummary,
  mcpOperationalState,
  createMcpStatusSnapshot,
  mcpToolEffectAdmissionEvidence,
  toolFailureRecovery,
  classifyTool,
  discoverAndStartMcpServers,
  stopMcpStartupProcess,
  isMcpFabricRequired,
  createMcpStartupError,
  mcpStartupDiagnostic,
  shouldSuppressMcpStderr,
  aggregateTools,
  aggregateToolBindings,
  canonicalMcpToolName,
  normalizeRuntimeMcpTools,
  normalizeMcpOutputReader,
  workerMcpProjectionFromEnv,
  parseWorkerMcpProjectionConfig,
  projectWorkerMcpFabricServers,
  applyWorkerMcpProjection,
  providerSafeToolName,
  providerToolNameForOriginal,
  originalToolNameForProvider,
  findToolServer,
  findToolBinding,
  sendMcpRequest,
};
