import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadMcpSurfaceRegistry, registrySurfaces, siteControlRoot } from '../../carrier-action-admission/src/tool-metadata.mjs';

export class McpFabricError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'McpFabricError';
    this.code = code;
    this.details = details;
  }
}

export function loadSiteMcpFabric(siteRoot, options = {}) {
  const required = options.required ?? false;
  const validateRegistry = options.validateRegistry ?? 'diagnostic';
  const mcpDir = join(siteRoot, '.ai', 'mcp');
  if (!existsSync(mcpDir)) {
    if (!required) {
      const empty = emptyFabric(siteRoot, mcpDir);
      if (validateRegistry !== false) {
        empty.registry_validation = validateFabricAgainstRegistry(siteRoot, mcpDir, [], {});
      }
      return empty;
    }
    throw new McpFabricError('mcp_fabric_missing', `MCP fabric directory not found: ${mcpDir}`, { siteRoot, mcpDir });
  }

  const files = readdirSync(mcpDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const servers = {};
  const sources = {};
  const skipped = [];
  const surfaceRegistry = loadMcpSurfaceRegistry(siteRoot);

  for (const file of files) {
    const path = join(mcpDir, file);
    const packet = parseJsonFile(path);
    const serverEntries = Object.entries(packet.mcpServers ?? {});
    for (const [serverName, rawServer] of serverEntries) {
      const normalized = normalizeServerConfig(serverName, rawServer, siteRoot);
      if (!normalized) {
        skipped.push({ file, server_name: serverName, reason: 'transport_not_stdio', transport: rawServer?.transport ?? null });
        continue;
      }

      if (servers[serverName]) {
        if (canonicalJson(servers[serverName]) !== canonicalJson(normalized)) {
          throw new McpFabricError('mcp_fabric_duplicate_server_conflict', `Conflicting MCP server definition for ${serverName}`, {
            serverName,
            firstFile: sources[serverName],
            secondFile: file,
          });
        }
        continue;
      }

      servers[serverName] = normalized;
      sources[serverName] = file;
    }
  }

  for (const [serverName, server] of Object.entries(servers)) {
    const sourceFile = sources[serverName];
    const surfaceTools = server.surface_id ? surfaceRegistry.tools_by_surface_id[server.surface_id] ?? null : null;
    const generatedFileTools = sourceFile ? surfaceRegistry.tools_by_generated_file[sourceFile] ?? null : null;
    const serverNameTools = surfaceRegistry.tools_by_server_name?.[serverName] ?? null;
    server.registry_tools = serverNameTools
      ? { ...serverNameTools }
      : {
          ...(generatedFileTools ?? {}),
          ...(surfaceTools ?? {}),
        };
    server.registry_source = surfaceRegistry.status === 'loaded' ? surfaceRegistry.path : null;
    server.registry_metadata_authoritative = surfaceRegistry.status === 'loaded' && (!!serverNameTools || !!surfaceTools || !!generatedFileTools);
  }

  if (required && skipped.length > 0) {
    throw new McpFabricError('mcp_fabric_unsupported_transport', `Unsupported MCP transport found in ${mcpDir}`, {
      siteRoot,
      mcpDir,
      skipped,
    });
  }

  if (required && Object.keys(servers).length === 0) {
    throw new McpFabricError('mcp_fabric_empty', `No stdio MCP servers found in ${mcpDir}`, { siteRoot, mcpDir, files });
  }

  const registryValidation = validateFabricAgainstRegistry(siteRoot, mcpDir, files, servers);
  if (validateRegistry === true && registryValidation.status === 'mismatch') {
    throw new McpFabricError('mcp_fabric_registry_mismatch', `MCP fabric does not match registry ${normalize(registryValidation.registry_path)}`, {
      siteRoot,
      mcpDir,
      registryPath: registryValidation.registry_path,
      missing: registryValidation.missing,
    });
  }

  return {
    schema: 'narada.mcp.fabric.loaded.v1',
    site_root: siteRoot,
    source: '.ai/mcp',
    mcp_dir: mcpDir,
    files,
    servers,
    sources,
    skipped,
    registry_validation: validateRegistry === false ? undefined : registryValidation,
  };
}

export function codexMcpEnvVarNames() {
  return [
    'NARADA_AGENT_ID',
    'NARADA_AGENT_START_EVENT_ID',
    'NARADA_CARRIER_SESSION_ID',
    'NARADA_SITE_ROOT',
    'NARADA_WORKSPACE_ROOT',
    'NARADA_AGENT_CONTEXT_DB',
  ];
}

export function projectFabricForCodex(fabric) {
  const envVars = codexMcpEnvVarNames();
  return Object.entries(fabric.servers).map(([name, server]) => ({
    name,
    command: server.command,
    args: server.args,
    env_vars: mergeUnique([...(server.env_vars ?? []), ...envVars]),
    ...(server.startup_timeout_sec ? { startup_timeout_sec: server.startup_timeout_sec } : {}),
  }));
}

export function projectFabricForAgentTui(fabric, envValues) {
  const mcpServers = {};
  for (const [name, server] of Object.entries(fabric.servers)) {
    const tools = agentTuiToolNames(server);
    if (tools.length === 0) continue;
    mcpServers[name] = {
      command: server.command,
      args: server.args,
      env: {
        ...projectServerEnvironment(server),
        ...envValues,
      },
      tools,
    };
  }
  return { mcpServers };
}

export function projectFabricForClaudeCode(fabric, envValues) {
  const mcpServers = {};
  for (const [name, server] of Object.entries(fabric.servers)) {
    mcpServers[name] = {
      command: server.command,
      args: server.args,
      env: {
        ...projectServerEnvironment(server),
        ...envValues,
      },
    };
  }
  return { mcpServers };
}

export function projectServerEnvironment(server, baseEnv = process.env) {
  const inherited = {};
  for (const name of server.env_vars ?? []) {
    if (Object.prototype.hasOwnProperty.call(baseEnv, name) && baseEnv[name] !== undefined) {
      inherited[name] = String(baseEnv[name]);
    }
  }
  return {
    ...inherited,
    ...(server.env ?? {}),
  };
}

export function mcpServerNames(fabric) {
  return Object.keys(fabric.servers).sort((a, b) => a.localeCompare(b));
}

export async function runMcpFabricDoctor(siteRoot, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? 5000));
  let fabric;
  try {
    fabric = loadSiteMcpFabric(siteRoot, {
      required: options.required ?? true,
      validateRegistry: options.validateRegistry ?? 'diagnostic',
    });
  } catch (error) {
    return {
      schema: 'narada.mcp.fabric.doctor.v1',
      status: 'failed',
      site_root: siteRoot,
      rows: [],
      diagnostics: [doctorDiagnostic(error, 'fabric_load')],
    };
  }

  const rows = [];
  for (const [serverName, server] of Object.entries(fabric.servers)) {
    rows.push(await probeMcpServer({
      siteRoot,
      serverName,
      server,
      sourceFile: fabric.sources?.[serverName] ?? null,
      timeoutMs,
      env: options.env ?? process.env,
    }));
  }

  return {
    schema: 'narada.mcp.fabric.doctor.v1',
    status: rows.every((row) => row.initialize_status === 'ok' && row.tools_list_status === 'ok') ? 'ok' : 'failed',
    site_root: siteRoot,
    mcp_dir: fabric.mcp_dir,
    files: fabric.files,
    registry_validation: fabric.registry_validation ?? null,
    rows,
    diagnostics: [],
  };
}

export function renderMcpFabricDoctorTable(report) {
  const rows = report.rows ?? [];
  const tableRows = rows.length > 0
    ? rows.map((row) => [
        row.file ?? '-',
        row.server,
        row.command,
        row.path_normalization,
        row.initialize_status,
        String(row.tools_list_count ?? '-'),
        row.first_diagnostic ?? '-',
      ])
    : [['-', '-', '-', '-', 'failed', '-', report.diagnostics?.[0]?.message ?? 'no MCP servers']];
  return renderTable([
    'file',
    'server',
    'command',
    'paths',
    'init',
    'tools',
    'first diagnostic',
  ], tableRows);
}

async function probeMcpServer({ siteRoot, serverName, server, sourceFile, timeoutMs, env }) {
  const diagnostics = [];
  const stdoutPollution = [];
  const stderrLines = [];
  const commandSummary = summarizeCommand(server);
  const pathNormalization = serverPathNormalization(server);
  let initializeStatus = 'not_run';
  let toolsListStatus = 'not_run';
  let toolsListCount = null;
  let proc = null;
  const entrypoint = resolveServerEntrypoint(server, siteRoot);
  if (entrypoint && !existsSync(entrypoint.path)) {
    diagnostics.push({ code: "entry_missing", message: entrypoint.path, phase: "preflight", details: entrypoint });
    return { file: sourceFile, server: serverName, command: commandSummary, path_normalization: pathNormalization, initialize_status: "not_run", tools_list_status: "not_run", tools_list_count: null, first_diagnostic: `${diagnostics[0].code}: ${diagnostics[0].message}`, diagnostics };
  }

  try {
    proc = spawn(server.command, server.args ?? [], {
      cwd: siteRoot,
      windowsHide: true,
      env: {
        ...process.env,
        ...projectServerEnvironment(server, env),
      },
    });

    let buffer = '';
    const pending = new Map();
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.id != null && pending.has(message.id)) {
            const request = pending.get(message.id);
            clearTimeout(request.timeout);
            pending.delete(message.id);
            request.resolve(message);
          }
        } catch {
          stdoutPollution.push(line.slice(0, 200));
        }
      }
    });
    proc.stderr.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
        if (shouldSuppressMcpDoctorStderr(line)) continue;
        stderrLines.push(line.slice(0, 200));
      }
    });

    const init = await sendMcpDoctorRequest(proc, pending, {
      jsonrpc: '2.0',
      id: 'doctor-initialize',
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    }, timeoutMs, 'initialize_timeout');
    initializeStatus = init.error ? 'error' : 'ok';
    if (init.error) diagnostics.push({ code: 'initialize_error', message: init.error.message ?? JSON.stringify(init.error) });

    if (initializeStatus === 'ok') {
      const tools = await sendMcpDoctorRequest(proc, pending, {
        jsonrpc: '2.0',
        id: 'doctor-tools-list',
        method: 'tools/list',
        params: {},
      }, timeoutMs, 'tools_list_timeout');
      toolsListStatus = tools.error ? 'error' : 'ok';
      if (tools.error) {
        diagnostics.push({ code: 'tools_list_error', message: tools.error.message ?? JSON.stringify(tools.error) });
      } else {
        toolsListCount = Array.isArray(tools.result?.tools) ? tools.result.tools.length : 0;
      }
    }

    if (stdoutPollution.length > 0) {
      diagnostics.push({ code: 'stdout_pollution', message: stdoutPollution[0] });
    }
    if (stderrLines.length > 0) {
      diagnostics.push({ code: 'stderr', message: stderrLines[0] });
    }
  } catch (error) {
    const diagnostic = doctorDiagnostic(error, initializeStatus === 'not_run' ? 'initialize' : 'tools_list');
    diagnostics.push(diagnostic);
    if (diagnostic.code === 'initialize_timeout') initializeStatus = 'timeout';
    else if (diagnostic.code === 'tools_list_timeout') toolsListStatus = 'timeout';
    else if (initializeStatus === 'not_run') initializeStatus = 'error';
    else toolsListStatus = 'error';
  } finally {
    await stopDoctorProcess(proc);
  }

  return {
    file: sourceFile,
    server: serverName,
    command: commandSummary,
    path_normalization: pathNormalization,
    initialize_status: initializeStatus,
    tools_list_status: toolsListStatus,
    tools_list_count: toolsListCount,
    first_diagnostic: diagnostics[0] ? `${diagnostics[0].code}: ${diagnostics[0].message}` : null,
    diagnostics,
  };
}

function sendMcpDoctorRequest(proc, pending, request, timeoutMs, timeoutCode) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(request.id);
      const error = new Error(`${timeoutCode}: ${request.method} timed out after ${timeoutMs}ms`);
      error.code = timeoutCode;
      reject(error);
    }, timeoutMs);
    pending.set(request.id, { resolve, timeout });
    proc.stdin.write(`${JSON.stringify(request)}\n`);
  });
}

function resolveServerEntrypoint(server, siteRoot) {
  const command = String(server.command ?? "");
  const args = server.args ?? [];
  const nodeCommand = /(^|[\\/])node(\.exe)?$/i.test(command);
  const scriptArg = nodeCommand ? args.find((arg) => /\.(mjs|js|cjs)$/i.test(String(arg))) : null;
  const candidate = scriptArg ?? (isAbsolute(command) ? command : null);
  if (!candidate) return null;
  const path = isAbsolute(candidate) ? candidate : resolve(siteRoot, candidate);
  return { path, source: scriptArg ? "args" : "command" };
}

function serverPathNormalization(server) {
  const values = [...(server.args ?? []), server.target_site_root ?? ''].filter(Boolean);
  return values.some((value) => String(value).includes('\\')) ? 'backslash_remaining' : 'ok';
}

function summarizeCommand(server) {
  return [basename(String(server.command ?? '')), ...(server.args ?? []).map(summarizeCommandArg)].join(' ');
}

function summarizeCommandArg(arg) {
  const value = String(arg);
  if (value.startsWith('--')) return value;
  if (value.includes('/') || value.includes('\\')) return basename(value);
  return value;
}

function doctorDiagnostic(error, phase) {
  return {
    code: error?.code ?? 'mcp_fabric_doctor_failed',
    message: error instanceof Error ? error.message : String(error),
    phase,
    details: error?.details ?? {},
  };
}

function stopDoctorProcess(proc) {
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

function renderTable(headers, rows) {
  const maxWidths = [24, 30, 72, 8, 8, 7, 72];
  const formattedRows = rows.map((row) => row.map((cell, index) => formatTableCell(cell, maxWidths[index])));
  const formattedHeaders = headers.map((header, index) => formatTableCell(header, maxWidths[index]));
  const widths = formattedHeaders.map((header, index) => Math.max(
    header.length,
    ...formattedRows.map((row) => String(row[index] ?? '').length),
  ));
  const renderRow = (row) => row.map((cell, index) => String(cell ?? '').padEnd(widths[index])).join('  ');
  return [
    renderRow(formattedHeaders),
    renderRow(widths.map((width) => '-'.repeat(width))),
    ...formattedRows.map(renderRow),
  ].join('\n');
}

function formatTableCell(value, maxWidth = 80) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxWidth) return text;
  return `${text.slice(0, Math.max(0, maxWidth - 1))}…`;
}

function shouldSuppressMcpDoctorStderr(message) {
  return message.includes('ExperimentalWarning: SQLite is an experimental feature')
    || message.includes('Use `node --trace-warnings ...` to show where the warning was created');
}

function emptyFabric(siteRoot, mcpDir) {
  return {
    schema: 'narada.mcp.fabric.loaded.v1',
    site_root: siteRoot,
    source: '.ai/mcp',
    mcp_dir: mcpDir,
    files: [],
    servers: {},
    sources: {},
    skipped: [],
  };
}

function parseJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new McpFabricError('mcp_fabric_invalid_json', `Invalid MCP config JSON: ${path}`, {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeServerConfig(serverName, rawServer, siteRoot) {
  if (!rawServer || typeof rawServer !== 'object') {
    throw new McpFabricError('mcp_fabric_invalid_server', `Invalid MCP server definition for ${serverName}`, { serverName });
  }
  const transport = rawServer.transport ?? (rawServer.command ? 'stdio' : null);
  if (transport !== 'stdio') return null;
  const command = normalizeCommand(rawServer.command);
  const portableSiteRoot = siteRoot.replaceAll('\\', '/');
  const args = Array.isArray(rawServer.args)
    ? rawServer.args.map((arg) => normalizePortablePathText(String(arg).replaceAll('{site_root}', portableSiteRoot)))
    : [];
  return {
    transport: 'stdio',
    command,
    args,
    env: objectStringValues(rawServer.env),
    env_vars: Array.isArray(rawServer.env_vars) ? rawServer.env_vars.map(String) : [],
    ...rawServerToolList(rawServer),
    ...(rawServer.surface_id ? { surface_id: String(rawServer.surface_id) } : {}),
    ...(rawServer.target_site_root ? { target_site_root: normalizePortablePathText(String(rawServer.target_site_root).replaceAll('{site_root}', portableSiteRoot)) } : {}),
    ...(rawServer.authority_posture ? { authority_posture: String(rawServer.authority_posture) } : {}),
    ...(Number.isFinite(Number(rawServer.startup_timeout_sec)) ? { startup_timeout_sec: Number(rawServer.startup_timeout_sec) } : {}),
  };
}

function validateFabricAgainstRegistry(siteRoot, mcpDir, files, servers) {
  const registryPath = join(siteControlRoot(siteRoot), 'capabilities', 'mcp-surfaces.json');
  if (!existsSync(registryPath)) {
    return {
      status: 'missing',
      registry_path: registryPath,
      missing: [],
    };
  }

  const registry = parseJsonFile(registryPath);
  const expectedSurfaces = [];
  for (const surface of registrySurfaces(registry)) {
    const generatedPath = surface?.client_config?.generated_path;
    const surfaceId = surface?.surface_id;
    if (!generatedPath || !surfaceId) continue;
    expectedSurfaces.push({
      surface_id: String(surfaceId),
      generated_file: basename(String(generatedPath)),
    });
  }

  const presentFiles = new Set(files);
  const missing = expectedSurfaces.filter((surface) => {
    return !presentFiles.has(surface.generated_file);
  });
  return {
    status: missing.length === 0 ? 'ok' : 'mismatch',
    registry_path: registryPath,
    expected_count: expectedSurfaces.length,
    missing,
  };
}

function normalizeCommand(command) {
  if (String(command ?? '').toLowerCase() === 'node') return process.execPath;
  return String(command ?? '');
}

function normalizePortablePathText(value) {
  return value.replaceAll('\\', '/');
}

function objectStringValues(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, String(entry)]));
}

function agentTuiToolNames(server) {
  if (server.registry_metadata_authoritative === true) {
    return expandAgentContextStartupAliases(server, mergeUnique(Object.values(server.registry_tools ?? {})
      .filter((tool) => tool && tool.refused !== true)
      .map((tool) => tool.name)));
  }
  return expandAgentContextStartupAliases(server, mergeUnique([
    ...(server.tools ?? []),
    ...(server.allowed_tools ?? []),
    ...(server.tool_names ?? []),
  ]));
}

function expandAgentContextStartupAliases(server, tools) {
  if (!isAgentContextSurface(server)) return tools;
  const toolSet = new Set(tools);
  if (toolSet.has('startup_sequence') || toolSet.has('agent_context_startup_sequence')) {
    toolSet.add('agent_context_startup_sequence');
    toolSet.delete('startup_sequence');
  }
  return mergeUnique([...toolSet]);
}

function isAgentContextSurface(server) {
  if (String(server.surface_id ?? '') === 'agent-context-mcp.local') return true;
  const registryToolNames = Object.keys(server.registry_tools ?? {});
  return registryToolNames.some((tool) => tool.startsWith('agent_context_'));
}

function rawServerToolList(rawServer) {
  const tools = mergeUnique([
    ...(Array.isArray(rawServer.tools) ? rawServer.tools : []),
    ...(Array.isArray(rawServer.allowed_tools) ? rawServer.allowed_tools : []),
    ...(Array.isArray(rawServer.tool_names) ? rawServer.tool_names : []),
  ]);
  return tools.length > 0 ? { tools } : {};
}

function mergeUnique(values) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && String(value).length > 0).map(String))).sort((a, b) => a.localeCompare(b));
}

function canonicalJson(value) {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map((key) => [key, sortDeep(value[key])]));
}

if (isMainModule()) {
  const cliArgs = parseDoctorCliArgs(process.argv.slice(2));
  runMcpFabricDoctor(cliArgs.siteRoot ?? process.cwd(), {
    timeoutMs: cliArgs.timeoutMs,
    required: true,
  }).then((report) => {
    if (cliArgs.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`${renderMcpFabricDoctorTable(report)}\n`);
    }
    process.exit(report.status === 'ok' ? 0 : 1);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

function parseDoctorCliArgs(argv) {
  const parsed = { siteRoot: null, timeoutMs: 5000, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--site-root' && argv[i + 1]) {
      parsed.siteRoot = argv[i + 1];
      i += 1;
    } else if (arg === '--timeout-ms' && argv[i + 1]) {
      parsed.timeoutMs = Number(argv[i + 1]);
      i += 1;
    }
  }
  return parsed;
}
