import { spawn } from 'node:child_process';
import { loadSiteMcpFabric, projectServerEnvironment } from '../../mcp-fabric/src/mcp-fabric.mjs';
import { buildNamePatternToolMetadata } from '../../carrier-action-admission/src/tool-metadata.mjs';

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
  'NARADA_CARRIER_SESSION_ID',
  'NARADA_SITE_ROOT',
  'NARADA_WORKSPACE_ROOT',
  'NARADA_AGENT_CONTEXT_DB',
  'NARADA_PC_SITE_ROOT',
  'NARADA_PROPER_ROOT',
  'NARADA_INTELLIGENCE_PROVIDER',
  'NARADA_AI_THINKING',
  'NARADA_THINKING_LEVEL',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'KIMI_API_BASE_URL',
  'KIMI_MODEL',
  'KIMI_CODE_API_BASE_URL',
  'KIMI_CODE_MODEL',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'CODEX_MODEL',
  'NARADA_CODEX_MODEL',
  'NARADA_CODEX_SUBSCRIPTION_TRANSPORT',
  'OPENAI_API_KEY',
  'KIMI_API_KEY',
  'ANTHROPIC_API_KEY',
  'KIMI_CODE_API_KEY',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_API_BASE_URL',
  'NARADA_WORKER_MCP_CONFIG',
]);
const MCP_STARTUP_FAILURES_KEY = '__mcp_startup_failures';
const MCP_RUNTIME_DIAGNOSTICS_KEY = '__mcp_runtime_diagnostics';

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
]);

function buildChildProcessEnv(extra = {}, baseEnv = process.env) {
  const env = {};
  for (const key of CHILD_PROCESS_ENV_ALLOWLIST) {
    if (baseEnv[key] !== undefined) env[key] = baseEnv[key];
  }
  return { ...env, ...extra, FORCE_COLOR: '0', NO_COLOR: '1' };
}

function attachMcpStartupFailures(mcpServers, failures = []) {
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

function getMcpStartupFailures(mcpServers) {
  const failures = mcpServers?.[MCP_STARTUP_FAILURES_KEY];
  return Array.isArray(failures) ? failures : [];
}

function formatMcpStartupFailureSummary(failures) {
  const normalized = Array.isArray(failures) ? failures : [];
  if (normalized.length === 0) return '0';
  const details = normalized
    .slice(0, 3)
    .map((failure) => `${failure.server_name ?? 'unknown'}:${failure.code ?? 'error'}`)
    .join(', ');
  return normalized.length > 3 ? `${normalized.length} (${details}, ...)` : `${normalized.length} (${details})`;
}

function getMcpRuntimeDiagnostics(mcpServers) {
  const diagnostics = mcpServers?.[MCP_RUNTIME_DIAGNOSTICS_KEY];
  return Array.isArray(diagnostics) ? diagnostics : [];
}

function rememberMcpRuntimeDiagnostic(mcpServers, diagnostic) {
  if (!mcpServers) return [];
  if (!Object.prototype.hasOwnProperty.call(mcpServers, MCP_RUNTIME_DIAGNOSTICS_KEY)) {
    Object.defineProperty(mcpServers, MCP_RUNTIME_DIAGNOSTICS_KEY, {
      value: [],
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  const diagnostics = mcpServers[MCP_RUNTIME_DIAGNOSTICS_KEY];
  diagnostics.push(diagnostic);
  if (diagnostics.length > 10) diagnostics.splice(0, diagnostics.length - 10);
  return diagnostics;
}

function formatMcpRuntimeDiagnosticSummary(diagnostics) {
  const normalized = Array.isArray(diagnostics) ? diagnostics : [];
  if (normalized.length === 0) return '0';
  const details = normalized
    .slice(-3)
    .map((diagnostic) => `${diagnostic.server_name ?? 'unknown'}:${diagnostic.tool_name ?? '<missing>'}`)
    .join(', ');
  return normalized.length > 3 ? `${normalized.length} (${details}, ...)` : `${normalized.length} (${details})`;
}

function mcpOperationalState(mcpServers) {
  const startupFailures = getMcpStartupFailures(mcpServers);
  const runtimeDiagnostics = getMcpRuntimeDiagnostics(mcpServers);
  if (startupFailures.length === 0 && runtimeDiagnostics.length === 0) return 'healthy';
  if (runtimeDiagnostics.length > 0) return 'runtime_faulted';
  return 'startup_degraded';
}

function createMcpStatusSnapshot(mcpServers) {
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

function mcpToolEffectAdmissionEvidence({ serverMode, admissionClassification, status, category }) {
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

function toolFailureRecovery(message) {
  const text = String(message ?? '');
  if (!text.includes('inline_payload_too_long')) return null;
  return 'Recovery: call mcp_payload_create with {"payload":{...}}, then retry the original tool with {"payload_ref":"mcp_payload:<id>@v1"}. Do not print JSON as prose.';
}

function classifyTool(name, args) {
  const metadata = buildNamePatternToolMetadata(name);
  if (metadata?.read_only === true) return 'auto';
  return 'prompt';
}

// ---------------------------------------------------------------------------
// MCP Server Discovery & Management
// ---------------------------------------------------------------------------
async function discoverAndStartMcpServers(siteRoot) {
  const fabricRequired = isMcpFabricRequired();
  let fabric;
  try {
    fabric = loadSiteMcpFabric(siteRoot, { required: fabricRequired });
  } catch (error) {
    if (isMcpStartupDiagnosticError(error)) throw error;
    throw createMcpStartupError('mcp_fabric_load_failed', `MCP fabric load failed: ${error.message}`, {
      phase: 'fabric_load',
      site_root: siteRoot,
      cause_code: error.code ?? null,
      details: error.details ?? {},
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

  const servers = {};
  const failures = [];
  for (const [serverName, serverConfig] of Object.entries(fabric.servers)) {
    try {
      const args = [...serverConfig.args];

      const proc = spawn(serverConfig.command, args, {
        cwd: siteRoot,
        windowsHide: true,
        env: buildChildProcessEnv(projectServerEnvironment(serverConfig)),
      });

      let buffer = '';
      const stdoutPollution = [];
      const stderrDiagnostics = [];
      let disconnectedError = null;
      const pending = new Map();
      const rejectPending = (error) => {
        for (const request of pending.values()) {
          clearTimeout(request.timeout);
          request.reject(error);
        }
        pending.clear();
      };
      const markDisconnected = (error) => {
        const normalizedError = error instanceof Error
          ? error
          : new Error(String(error ?? `MCP server ${serverName} disconnected`));
        if (!disconnectedError) disconnectedError = normalizedError;
        rejectPending(normalizedError);
      };
      proc.stdout.setEncoding('utf-8');
      proc.stderr.setEncoding('utf-8');
      proc.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (shouldSuppressMcpStderr(msg)) return;
        if (msg) stderrDiagnostics.push(msg.slice(0, 1000));
        if (msg) process.stderr.write(`[${serverName}] ${msg}\n`);
      });

      proc.on('error', (error) => markDisconnected(error));
      proc.on('exit', (code, signal) => {
        markDisconnected(new Error(`MCP server ${serverName} exited${code === null ? '' : ` with code ${code}`}${signal ? ` signal ${signal}` : ''}`));
      });
      proc.stdin.on('error', (error) => markDisconnected(error));
      proc.stdout.on('error', (error) => markDisconnected(error));
      proc.stderr.on('error', (error) => markDisconnected(error));

      proc.stdout.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id != null && pending.has(msg.id)) {
              const request = pending.get(msg.id);
              clearTimeout(request.timeout);
              request.resolve(msg);
              pending.delete(msg.id);
            }
          } catch {
            stdoutPollution.push(line.slice(0, 1000));
          }
        }
      });

      const startupTimeoutMs = Math.max(1, Number(serverConfig.startup_timeout_sec ?? 10) * 1000);
      const requestTimeoutMs = Math.max(1, Number(serverConfig.request_timeout_ms ?? 15000));
      const send = (req, timeoutMs = requestTimeoutMs, timeoutCode = 'mcp_request_timeout', abortSignal = null) => new Promise((resolve, reject) => {
        if (disconnectedError) {
          reject(disconnectedError);
          return;
        }
        if (abortSignal?.aborted) {
          reject(new Error('agent_cli_interrupt_requested'));
          return;
        }
        let settled = false;
        const settle = (fn, value) => {
          if (settled) return;
          settled = true;
          abortSignal?.removeEventListener?.('abort', onAbort);
          fn(value);
        };
        const resolveWrapped = (value) => settle(resolve, value);
        const rejectWrapped = (value) => settle(reject, value);
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
          proc.stdin.write(`${JSON.stringify(req)}\n`, (error) => {
            if (!error || !pending.has(req.id)) return;
            const request = pending.get(req.id);
            clearTimeout(request.timeout);
            pending.delete(req.id);
            markDisconnected(error);
            request.reject(error);
          });
        } catch (error) {
          if (pending.has(req.id)) {
            const request = pending.get(req.id);
            clearTimeout(request.timeout);
            pending.delete(req.id);
            request.reject(error);
          }
          markDisconnected(error);
        }
      });

      // Initialize with timeout
      let initResult, toolsResult;
      try {
        initResult = await send(
          { jsonrpc: '2.0', id: randomId(), method: 'initialize', params: { protocolVersion: '2024-11-05' } },
          startupTimeoutMs,
          'mcp_startup_timeout',
        );
        toolsResult = await send(
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
        });
        failures.push(failure);
        console.error(`[carrier-runtime] Failed to initialize MCP server ${serverName}: ${failure.message}`);
        await stopMcpStartupProcess(proc);
        continue;
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
        };
        failures.push(failure);
        console.error(`[carrier-runtime] ${failure.message}`);
        await stopMcpStartupProcess(proc);
        continue;
      }

      servers[serverName] = {
        process: proc,
        send,
        tools: toolsResult.result?.tools ?? [],
        config: serverConfig,
        registry_tools: serverConfig.registry_tools ?? {},
        registry_source: serverConfig.registry_source ?? null,
        registry_metadata_authoritative: serverConfig.registry_metadata_authoritative === true,
      };
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

function stopMcpStartupProcess(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((resolveStop) => {
    const timeout = setTimeout(resolveStop, 1000);
    proc.once('exit', () => {
      clearTimeout(timeout);
      resolveStop();
    });
    proc.kill();
  });
}

function isMcpFabricRequired() {
  if (process.env.NARADA_AGENT_CLI_REQUIRE_MCP_FABRIC === '0') return false;
  if (process.env.NARADA_AGENT_CLI_REQUIRE_MCP_FABRIC === '1') return true;
  return process.env.NARADA_SITE_ROOT !== undefined
    && process.env.NARADA_AGENT_ID !== undefined
    && (process.env.NARADA_AGENT_START_EVENT_ID !== undefined || process.env.NARADA_CARRIER_SESSION_ID !== undefined);
}

function createMcpStartupError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.diagnostic = {
    schema: 'narada.agent_cli.mcp_startup_diagnostic.v0',
    ...details,
    code,
    message,
  };
  return error;
}

function isMcpStartupDiagnosticError(error) {
  return Boolean(error?.diagnostic && typeof error.diagnostic === 'object');
}

function mcpStartupDiagnostic(error, defaultFields = {}) {
  if (error?.diagnostic) return error.diagnostic;
  const message = error instanceof Error ? error.message : String(error);
  return {
    schema: 'narada.agent_cli.mcp_startup_diagnostic.v0',
    ...defaultFields,
    message,
  };
}

function shouldSuppressMcpStderr(message) {
  if (!message) return true;
  return (
    message.includes('ExperimentalWarning: SQLite is an experimental feature') ||
    message.includes('Use `node --trace-warnings ...` to show where the warning was created')
  );
}

function aggregateTools(mcpServers) {
  return aggregateToolBindings(mcpServers).map(({ providerToolName, tool }) => ({
    type: 'function',
    function: {
      name: providerToolName,
      description: tool.description ?? '',
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}

function workerMcpProjectionFromEnv(env = process.env) {
  return parseWorkerMcpProjectionConfig(env.NARADA_WORKER_MCP_CONFIG);
}

function parseWorkerMcpProjectionConfig(value) {
  if (value === undefined || value === null || value === '') return null;
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch (error) {
    throw createMcpStartupError('worker_mcp_config_invalid_json', `Invalid NARADA_WORKER_MCP_CONFIG JSON: ${error.message}`, {
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

function normalizeWorkerMcpToolList(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const item of value) {
    const text = String(item ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function applyWorkerMcpProjection(mcpServers, config = workerMcpProjectionFromEnv()) {
  if (!config || config.native_mcp_mode === 'full') return mcpServers;
  const allowed = new Set();
  if (config.include_startup_tools !== false) for (const name of WORKER_MCP_STARTUP_TOOL_NAMES) allowed.add(name);
  if (config.native_mcp_mode === 'scoped') for (const name of config.mcp_tool_allowlist ?? []) allowed.add(name);
  if (config.include_output_readback_tools === true) for (const name of WORKER_MCP_OUTPUT_READBACK_TOOL_NAMES) allowed.add(name);

  const projected = {};
  for (const [serverName, server] of Object.entries(mcpServers ?? {})) {
    const seenProviderNames = new Set();
    const tools = (server.tools ?? []).filter((tool) => workerMcpToolAllowed({ serverName, tool, allowed, seenProviderNames }));
    projected[serverName] = { ...server, tools };
  }
  attachMcpStartupFailures(projected, getMcpStartupFailures(mcpServers));
  Object.defineProperty(projected, '__mcp_worker_projection', {
    value: {
      schema: 'narada.worker.mcp_projection.applied.v1',
      native_mcp_mode: config.native_mcp_mode,
      requested_tool_count: config.mcp_tool_allowlist?.length ?? 0,
      exposed_server_count: Object.keys(projected).length,
      exposed_tool_server_count: Object.values(projected).filter((server) => (server.tools ?? []).length > 0).length,
      exposed_tool_count: aggregateToolBindings(projected).length,
    },
    enumerable: false,
    configurable: true,
  });
  return projected;
}

function workerMcpToolAllowed({ serverName, tool, allowed, seenProviderNames }) {
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
  return candidates.some((candidate) => allowed.has(candidate));
}

function aggregateToolBindings(mcpServers) {
  const all = [];
  const seenProviderNames = new Set();
  const seenOriginalNames = new Set();
  for (const [serverName, server] of Object.entries(mcpServers)) {
    for (const tool of server.tools) {
      if (seenOriginalNames.has(tool.name)) continue;
      seenOriginalNames.add(tool.name);
      const providerToolName = providerSafeToolName(tool.name, seenProviderNames);
      seenProviderNames.add(providerToolName);
      all.push({ serverName, server, tool, providerToolName });
    }
  }
  return all;
}

function providerSafeToolName(toolName, seenProviderNames = new Set()) {
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

function shortStableHash(value) {
  let hash = 2166136261;
  for (const char of String(value ?? '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).slice(0, 6);
}

function providerToolNameForOriginal(toolName, mcpServers) {
  const binding = aggregateToolBindings(mcpServers).find(({ tool }) => tool.name === toolName);
  return binding?.providerToolName ?? providerSafeToolName(toolName);
}

function originalToolNameForProvider(providerToolName, mcpServers) {
  const binding = aggregateToolBindings(mcpServers).find(({ providerToolName: candidate }) => candidate === providerToolName);
  return binding?.tool?.name ?? providerToolName;
}

function findToolServer(name, mcpServers) {
  return findToolBinding(name, mcpServers)?.server ?? null;
}

function findToolBinding(name, mcpServers) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const tool = server.tools.find((t) => t.name === name);
    if (tool) return { server: { ...server, name: serverName }, tool };
  }
  const originalName = originalToolNameForProvider(name, mcpServers);
  if (originalName !== name) return findToolBinding(originalName, mcpServers);
  return null;
}
async function sendMcpRequest(server, request, abortSignal = null) {
  if (abortSignal?.aborted) {
    throw new Error('agent_cli_interrupt_requested');
  }
  const response = await server.send(request, undefined, undefined, abortSignal);
  if (response.error) throw new Error(response.error.message);
  return response.result;
}

function randomId() {
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
  workerMcpProjectionFromEnv,
  parseWorkerMcpProjectionConfig,
  applyWorkerMcpProjection,
  providerSafeToolName,
  providerToolNameForOriginal,
  originalToolNameForProvider,
  findToolServer,
  findToolBinding,
  sendMcpRequest,
};
