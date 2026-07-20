#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildOutputRefToolContent } from '@narada2/site-common-tools/compat/mcp-payload-file.legacy-site';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';

const PROTOCOL_VERSION = '2024-11-05';
const RETIRED_REASON = 'EE-MCP is retired on this Site and is not admitted in .narada/capabilities/mcp-surfaces.json.';
const MISSING_CAPABILITY_REPORT = 'delegated CLI embodiment not loadable / missing EE-MCP capability';
let activeOutputToolName = null;

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write('Usage: node tools/typed-mcp/ee-mcp-server.mjs --site-root <path> [--wsl-distribution <name>]\n');
  process.exit(0);
}

runStdioServer(options).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function runStdioServer(serverOptions) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;
    const drained = drainJsonRpcFrames(buffer);
    buffer = drained.remaining;
    for (const request of drained.requests) {
      const response = handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response);
    }
  }
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    for (const request of parseJsonRpcInput(trailing)) {
      const response = handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response);
    }
  }
}

function writeMcpFrame(response) {
  const body = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function handleRequest(request, serverOptions) {
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  try {
    const site = resolveSiteContext(serverOptions);
    const result = dispatchRetiredMethod(request.method, request.params ?? {}, site);
    return { jsonrpc: '2.0', id: request.id ?? null, result };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: request?.id ?? null,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function dispatchRetiredMethod(method, params, site) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: retiredServerInfo(site),
      };
    case 'tools/list':
      return {
        tools: [],
        site,
        status: 'retired',
        admitted: false,
        surface_type: 'EE-MCP',
        missing_capability_report: MISSING_CAPABILITY_REPORT,
        reason: RETIRED_REASON,
      };
    case 'tools/call': {
      const record = asRecord(params);
      const name = stringField(record, 'name') ?? 'unknown';
      throw new Error(`ee_mcp_retired_not_admitted: ${name}: ${MISSING_CAPABILITY_REPORT}`);
    }
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function retiredServerInfo(site) {
  return {
    name: `narada-ee-mcp-retired:${site.site_id}`,
    version: '0.2.0',
    site,
    status: 'retired',
    admitted: false,
    authority_posture: 'retired_not_admitted',
    surface_type: 'EE-MCP',
    registry: '.narada/capabilities/mcp-surfaces.json',
    missing_capability_report: MISSING_CAPABILITY_REPORT,
    reason: RETIRED_REASON,
  };
}

function dispatchMethod(method, params, site, surface, serverOptions) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: `narada-ee-mcp:${site.site_id}`,
          version: '0.1.0',
          site,
          authority_posture: 'bounded_read_only_execution',
          surface_type: 'EE-MCP',
        },
      };
    case 'tools/list':
      return { tools: tools(), site, limits: surface.limits, surface_type: 'EE-MCP' };
    case 'tools/call':
      return callTool(params, site, surface, serverOptions);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function callTool(params, site, surface, serverOptions) {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');
  activeOutputToolName = name;
  switch (name) {
    case 'ee_mcp_doctor':
      return jsonToolResult({
        status: 'ok',
        surface_type: 'EE-MCP',
        authority_posture: 'bounded_read_only_execution',
        site,
        wsl_distribution: serverOptions.wslDistribution ?? surface.runtime_embodiment?.wsl_distribution ?? 'Ubuntu-24.04',
        allowed_command_ids: commandIds(),
        limits: surface.limits,
      });
    case 'ee_mcp_execute':
      return commandToolResult(executeCommand(args, site, surface, serverOptions));
    default:
      throw new Error(`ee_mcp_refused_unknown_tool: ${name}`);
  }
}

function executeCommand(args, site, surface, serverOptions) {
  const commandId = requiredString(args, 'command_id');
  if (!commandIds().includes(commandId)) {
    throw new Error(`ee_mcp_refused_unknown_command_id: ${commandId}`);
  }
  if (stringField(args, 'command')) {
    throw new Error('ee_mcp_refused_arbitrary_shell_command');
  }

  const limits = surface.limits ?? {};
  const timeoutSeconds = numberField(args, 'timeout_seconds') ?? 5;
  const outputLimitBytes = numberField(args, 'output_limit_bytes') ?? 4096;
  const maxTimeout = Number(limits.max_timeout_seconds ?? 10);
  const maxOutput = Number(limits.max_output_bytes ?? 8192);
  if (timeoutSeconds < 1 || timeoutSeconds > maxTimeout) throw new Error(`timeout_out_of_bounds: max ${maxTimeout} seconds`);
  if (outputLimitBytes < 16 || outputLimitBytes > maxOutput) throw new Error(`output_limit_out_of_bounds: max ${maxOutput} bytes`);

  const cwd = requiredString(args, 'cwd');
  const allowedPrefixes = Array.isArray(limits.allowed_cwd_prefixes) ? limits.allowed_cwd_prefixes : [];
  if (!allowedPrefixes.some((prefix) => isWslPathUnderPrefix(cwd, String(prefix)))) {
    throw new Error(`cwd_refused_by_ee_mcp_policy: ${cwd}`);
  }

  const dryRun = booleanField(args, 'dry_run') === true;
  const wslDistribution = serverOptions.wslDistribution ?? surface.runtime_embodiment?.wsl_distribution ?? 'Ubuntu-24.04';
  const bashCommand = `cd ${quoteBashSingle(cwd)} && ${buildCommand(commandId, args, site)}`;
  const evidencePath = writeRuntimeEvidence(site.site_root, {
    status: dryRun ? 'dry_run' : 'planned',
    command_id: commandId,
    task_number: numberField(args, 'task_number') ?? null,
    cwd,
    timeout_seconds: timeoutSeconds,
    output_limit_bytes: outputLimitBytes,
    mutation_posture: 'read_only',
    dry_run: dryRun,
  });
  const base = {
    status: dryRun ? 'dry_run' : 'planned',
    surface_type: 'EE-MCP',
    authority_posture: 'bounded_read_only_execution',
    mutation_posture: 'read_only',
    site,
    command_id: commandId,
    task_number: numberField(args, 'task_number') ?? null,
    cwd,
    timeout_seconds: timeoutSeconds,
    output_limit_bytes: outputLimitBytes,
    wsl_distribution: wslDistribution,
    command: `wsl -d ${wslDistribution} -- bash -lc <allowlisted:${commandId}>`,
    evidence_path: evidencePath,
    rule: 'EE-MCP executes only allowlisted read-only command ids; execution output is not canonical Site admission.',
  };
  if (dryRun) return base;

  const result = runGovernedCommandSync('wsl.exe', ['-d', wslDistribution, '--', 'bash', '-lc', bashCommand], {
    cwd: site.site_root,
    encoding: 'utf8',
    timeout: timeoutSeconds * 1000,
    maxBuffer: Math.max(outputLimitBytes * 4, 64 * 1024),
  });
  const stdout = truncateUtf8(result.stdout ?? '', outputLimitBytes);
  const stderr = truncateUtf8(result.stderr ?? '', outputLimitBytes);
  const completed = result.status === 0 && !result.error;
  const status = result.error?.code === 'ETIMEDOUT' ? 'timeout' : (completed ? 'completed' : 'failed');
  const payload = {
    ...base,
    status,
    exit_code: result.status,
    timed_out: status === 'timeout',
    stdout: stdout.text,
    stderr: stderr.text,
    stdout_truncated: stdout.truncated,
    stderr_truncated: stderr.truncated,
  };
  writeRuntimeEvidence(site.site_root, payload, evidencePath);
  return payload;
}

function commandIds() {
  return ['pwd', 'list', 'git_status', 'narada_inbox_doctor', 'narada_task_read'];
}

function buildCommand(commandId, args, site) {
  const simple = {
    pwd: 'pwd',
    list: 'ls -la',
    git_status: 'git status --short',
  };
  if (Object.prototype.hasOwnProperty.call(simple, commandId)) return simple[commandId];

  const config = readSiteConfig(site.site_root);
  const wslCliRoot = config?.narada_cli?.wsl?.authority_entrypoint;
  if (!wslCliRoot || typeof wslCliRoot !== 'string') {
    throw new Error('ee_mcp_missing_narada_wsl_cli: delegated CLI embodiment not loadable / missing EE-MCP capability');
  }
  const siteRootWsl = windowsPathToWslPath(site.site_root);
  const prefix = `cd ${quoteBashSingle(wslCliRoot)} && narada`;
  if (commandId === 'narada_inbox_doctor') {
    return `${prefix} inbox doctor --cwd ${quoteBashSingle(siteRootWsl)} --format json`;
  }
  if (commandId === 'narada_task_read') {
    const taskNumber = numberField(args, 'task_number');
    if (!Number.isInteger(taskNumber) || taskNumber < 1) throw new Error('task_number_required_for_narada_task_read');
    return `${prefix} task read ${taskNumber} --cwd ${quoteBashSingle(siteRootWsl)} --format json`;
  }
  throw new Error(`ee_mcp_refused_unknown_command_id: ${commandId}`);
}

function readEeSurface(siteRoot) {
  const path = join(siteRoot, 'operator-surfaces', 'typed-mcp-surfaces.json');
  if (!existsSync(path)) throw new Error(`typed_mcp_surface_map_missing: ${path}`);
  const map = JSON.parse(readFileSync(path, 'utf8'));
  const surface = map.surfaces?.find((item) => item.surface_id === 'ee-mcp.wsl-bash-from-windows');
  if (!surface) throw new Error('typed_mcp_surface_missing: ee-mcp.wsl-bash-from-windows');
  return surface;
}

function writeRuntimeEvidence(siteRoot, payload, existingPath = null) {
  const dir = join(siteRoot, '.ai', 'runtime', 'typed-mcp', 'ee-mcp');
  mkdirSync(dir, { recursive: true });
  const path = existingPath ?? join(dir, `ee_mcp_${Date.now()}_${randomUUID().slice(0, 8)}.json`);
  writeFileSync(path, `${JSON.stringify({ schema: 'narada.typed_mcp.ee_mcp.mcp_event.v0', occurred_at: new Date().toISOString(), ...payload }, null, 2)}\n`, 'utf8');
  return path;
}

function truncateUtf8(value, limit) {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= limit) return { text: value, truncated: false };
  return { text: buffer.subarray(0, limit).toString('utf8'), truncated: true };
}

function resolveSiteContext(serverOptions) {
  const siteRoot = resolve(serverOptions.siteRoot ?? process.cwd());
  const configPath = join(siteRoot, 'config.json');
  const config = existsSync(configPath) ? asRecord(parseJsonOrNull(readFileSync(configPath, 'utf8'))) : {};
  const locus = asRecord(config.locus);
  return {
    site_id: serverOptions.siteId ?? stringField(config, 'site_id') ?? basename(siteRoot),
    site_kind: serverOptions.siteKind ?? stringField(config, 'site_kind') ?? 'unspecified',
    site_root: siteRoot,
    workspace_root: stringField(config, 'workspace_root') ?? null,
    authority_locus: stringField(locus, 'authority_locus') ?? stringField(config, 'site_kind') ?? 'unspecified',
    source: existsSync(configPath) ? 'config' : 'options',
  };
}

function readSiteConfig(siteRoot) {
  const configPath = join(siteRoot, 'config.json');
  return existsSync(configPath) ? asRecord(parseJsonOrNull(readFileSync(configPath, 'utf8'))) : {};
}

function windowsPathToWslPath(path) {
  const match = String(path).match(/^([A-Za-z]):\\(.*)$/);
  if (!match) throw new Error(`windows_path_cannot_be_converted_to_wsl: ${path}`);
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

function normalizeWslPath(path) {
  let normalized = String(path).replaceAll('\\', '/').trim();
  while (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}

function isWslPathUnderPrefix(path, prefix) {
  const normalizedPath = normalizeWslPath(path);
  const normalizedPrefix = normalizeWslPath(prefix);
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

function quoteBashSingle(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function jsonToolResult(value, isError = false) {
  return buildOutputRefToolContent({ siteRoot: resolve(options.siteRoot ?? process.cwd()), toolName: activeOutputToolName, value, isError });
}

function commandToolResult(value) {
  return jsonToolResult(value, ['failed', 'timeout'].includes(value.status));
}

function tools() {
  return [
    {
      name: 'ee_mcp_doctor',
      description: 'Inspect EE-MCP readiness and declared bounds without executing.',
      inputSchema: objectSchema({}),
    },
    {
      name: 'ee_mcp_execute',
      description: 'Execute one allowlisted read-only command id in the declared embodiment.',
      inputSchema: objectSchema({
        command_id: { type: 'string', enum: commandIds() },
        task_number: { type: 'number' },
        cwd: { type: 'string' },
        timeout_seconds: { type: 'number' },
        output_limit_bytes: { type: 'number' },
        dry_run: { type: 'boolean' },
      }, ['command_id', 'cwd']),
    },
  ];
}

function parseArgs(args) {
  const parsed = { help: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--site-root' && next) {
      parsed.siteRoot = next;
      i += 1;
    } else if (arg === '--site-id' && next) {
      parsed.siteId = next;
      i += 1;
    } else if (arg === '--site-kind' && next) {
      parsed.siteKind = next;
      i += 1;
    } else if (arg === '--wsl-distribution' && next) {
      parsed.wslDistribution = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}

function drainJsonRpcFrames(input) {
  if (/^Content-Length:/im.test(input)) return drainContentLengthFrames(input);
  const lines = input.split(/\r?\n/);
  const remaining = lines.pop() ?? '';
  return { requests: lines.filter((line) => line.trim().length > 0).map((line) => JSON.parse(line)), remaining };
}

function parseJsonRpcInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (/^Content-Length:/im.test(trimmed)) {
    const parsed = drainContentLengthFrames(input);
    if (parsed.remaining.trim().length > 0) throw new Error('mcp_stdio_trailing_frame_bytes');
    return parsed.requests;
  }
  return trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

function drainContentLengthFrames(input) {
  const requests = [];
  let cursor = 0;
  while (cursor < input.length) {
    const headerEnd = input.indexOf('\r\n\r\n', cursor);
    if (headerEnd < 0) break;
    const header = input.slice(cursor, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error('mcp_stdio_frame_missing_content_length');
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (input.length < bodyEnd) break;
    requests.push(JSON.parse(input.slice(bodyStart, bodyEnd)));
    cursor = bodyEnd;
    while (input[cursor] === '\r' || input[cursor] === '\n') cursor += 1;
  }
  return { requests, remaining: input.slice(cursor) };
}

function objectSchema(properties, required = []) {
  return { type: 'object', properties, additionalProperties: false, ...(required.length > 0 ? { required } : {}) };
}

function parseJsonOrNull(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringField(record, key) {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function requiredString(record, key) {
  const value = stringField(record, key);
  if (!value) throw new Error(`missing_required_tool_argument: ${key}`);
  return value;
}

function numberField(record, key) {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanField(record, key) {
  return typeof record[key] === 'boolean' ? record[key] : undefined;
}
