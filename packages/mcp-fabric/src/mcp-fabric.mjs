import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join, normalize, relative, resolve } from 'node:path';
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
  const fabricDirectory = resolveSiteMcpFabricDirectory(siteRoot);
  const mcpDir = fabricDirectory.mcpDir;
  if (!existsSync(mcpDir)) {
    if (!required) {
      const empty = emptyFabric(siteRoot, mcpDir);
      empty.source = fabricDirectory.source;
      empty.candidate_mcp_dirs = fabricDirectory.candidates;
      if (validateRegistry !== false) {
        empty.registry_validation = validateFabricAgainstRegistry(siteRoot, mcpDir, [], {});
      }
      return empty;
    }
    throw new McpFabricError('mcp_fabric_missing', `MCP fabric directory not found: ${mcpDir}`, {
      siteRoot,
      mcpDir,
      candidate_mcp_dirs: fabricDirectory.candidates,
    });
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
          const details = {
            serverName,
            firstFile: sources[serverName],
            secondFile: file,
            siteRoot,
            mcpDir,
          };
          details.repair_plan = mcpFabricRepairPlan('mcp_fabric_duplicate_server_conflict', details);
          throw new McpFabricError('mcp_fabric_duplicate_server_conflict', `Conflicting MCP server definition for ${serverName}`, details);
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
    const registryTools = serverNameTools ?? surfaceTools ?? generatedFileTools ?? null;
    server.registry_tools = registryTools ? { ...registryTools } : {};
    server.registry_source = surfaceRegistry.status === 'loaded' ? surfaceRegistry.path : null;
    server.registry_metadata_authoritative = surfaceRegistry.status === 'loaded' && !!registryTools;
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

  const nonCanonicalServerNames = Object.keys(servers)
    .filter((serverName) => !serverName.startsWith('narada-'))
    .sort((a, b) => a.localeCompare(b));
  if (required && nonCanonicalServerNames.length > 0) {
    throw new McpFabricError(
      'temporary_mcp_server_name_missing_narada_prefix',
      `Temporary MCP leak identification gate refused non-canonical server names: ${nonCanonicalServerNames.join(', ')}`,
      {
        siteRoot,
        mcpDir,
        non_canonical_server_names: nonCanonicalServerNames,
        remediation: 'Temporary MCP leak identification gate: Site-local MCP server names must start with narada- while launcher fabric leakage is being identified.',
      },
    );
  }

  const registryValidation = validateFabricAgainstRegistry(siteRoot, mcpDir, files, servers);
  if (validateRegistry === true && registryValidation.status === 'mismatch') {
    const details = {
      siteRoot,
      mcpDir,
      registryPath: registryValidation.registry_path,
      missing: registryValidation.missing,
    };
    details.repair_plan = mcpFabricRepairPlan('mcp_fabric_registry_mismatch', details);
    throw new McpFabricError('mcp_fabric_registry_mismatch', `MCP fabric does not match registry ${normalize(registryValidation.registry_path)}`, details);
  }

  return {
    schema: 'narada.mcp.fabric.loaded.v1',
    site_root: siteRoot,
    source: fabricDirectory.source,
    mcp_dir: mcpDir,
    candidate_mcp_dirs: fabricDirectory.candidates,
    files,
    servers,
    sources,
    skipped,
    registry_validation: validateRegistry === false ? undefined : registryValidation,
  };
}

function resolveSiteMcpFabricDirectory(siteRoot) {
  const primary = join(siteRoot, '.ai', 'mcp');
  const contained = join(siteRoot, '.narada', '.ai', 'mcp');
  const candidates = [primary, contained];
  if (existsSync(primary)) {
    return { mcpDir: primary, source: '.ai/mcp', candidates };
  }
  if (existsSync(contained)) {
    return { mcpDir: contained, source: '.narada/.ai/mcp', candidates };
  }
  return { mcpDir: primary, source: '.ai/mcp', candidates };
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
      ...(server.target_site_root ? { target_site_root: server.target_site_root } : {}),
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

  const configDiagnostics = buildGeneratedConfigDiagnostics(siteRoot, fabric);
  const rows = [];
  for (const [serverName, server] of Object.entries(fabric.servers)) {
    rows.push(await probeMcpServer({
      siteRoot,
      serverName,
      server,
      sourceFile: fabric.sources?.[serverName] ?? null,
      configDiagnostic: configDiagnostics.servers_by_name?.[serverName] ?? null,
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
    generated_config_diagnostics: configDiagnostics,
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

async function probeMcpServer({ siteRoot, serverName, server, sourceFile, configDiagnostic, timeoutMs, env }) {
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
    diagnostics.push({
      code: 'entry_missing',
      message: entrypoint.path,
      phase: 'preflight',
      details: {
        ...entrypoint,
        config_provenance: configDiagnostic?.provenance ?? null,
        generated_config: configDiagnostic?.generated_config ?? null,
        repair_scope: configDiagnostic?.repair_scope ?? null,
      },
      repair_plan: entrypointRepairPlan(entrypoint, configDiagnostic),
    });
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
    repair_plan: error?.details?.repair_plan ?? null,
  };
}

function mcpFabricRepairPlan(code, details = {}) {
  if (code === 'mcp_fabric_duplicate_server_conflict') {
    return {
      schema: 'narada.mcp.fabric.repair_plan.v1',
      kind: 'duplicate_server_conflict',
      status: 'manual_review_required',
      server_name: details.serverName ?? null,
      conflicting_files: [details.firstFile, details.secondFile].filter(Boolean).map((file) => ({
        file,
        path: details.mcpDir ? join(details.mcpDir, file) : file,
      })),
      recommended_actions: [
        'Keep exactly one canonical MCP server definition for this server name.',
        'Regenerate Site MCP client configs from the Site surface registry if either file is generated.',
        'Remove or rename the stale duplicate file only after confirming it is not the registered surface owner.',
      ],
      verification: [
        'Run MCP fabric doctor after the duplicate is removed or regenerated.',
        'Confirm the server name appears once and initializes from the intended generated file.',
      ],
    };
  }
  if (code === 'mcp_fabric_registry_mismatch') {
    return {
      schema: 'narada.mcp.fabric.repair_plan.v1',
      kind: 'registry_generated_file_mismatch',
      status: 'regenerate_or_remove_stale_registry_entry',
      registry_path: details.registryPath ?? null,
      missing: (details.missing ?? []).map((item) => ({
        surface_id: item.surface_id,
        generated_file: item.generated_file,
        expected_path: details.mcpDir && item.generated_file ? join(details.mcpDir, item.generated_file) : item.generated_file,
      })),
      recommended_actions: [
        'Regenerate missing MCP client config files from the authoritative Site surface registry.',
        'If a registry surface is obsolete, remove or retire that registry entry instead of leaving a missing generated file.',
      ],
      verification: [
        'Run MCP fabric doctor with registry validation enabled.',
        'Confirm registry_validation.status is ok.',
      ],
    };
  }
  return null;
}

function entrypointRepairPlan(entrypoint, configDiagnostic) {
  if (!configDiagnostic) return null;
  return {
    schema: 'narada.mcp.fabric.repair_plan.v1',
    kind: 'stale_generated_config_entrypoint',
    status: configDiagnostic.repair_scope === 'ignored_local_projection_repair'
      ? 'repair_ignored_local_projection'
      : 'repair_durable_repo_source',
    entrypoint_path: entrypoint.path,
    generated_config: configDiagnostic.generated_config,
    provenance: configDiagnostic.provenance,
    regeneration: configDiagnostic.regeneration,
    repair_scope: configDiagnostic.repair_scope,
    recommended_actions: configDiagnostic.repair_scope === 'ignored_local_projection_repair'
      ? [
          'Regenerate the ignored local MCP client config from the durable Site surface registry.',
          'Do not commit the ignored local projection; commit only registry/source changes if the durable surface contract is wrong.',
        ]
      : [
          'Repair the durable MCP config source or registry entry that produced the stale entrypoint path.',
          'Regenerate the Site MCP client config after the durable source is corrected.',
        ],
    verification: [
      'Run MCP fabric doctor again and confirm the entry_missing diagnostic is gone.',
      'Confirm generated_config_diagnostics reports the expected repair_scope.',
    ],
  };
}

function buildGeneratedConfigDiagnostics(siteRoot, fabric) {
  const registry = loadMcpSurfaceRegistry(siteRoot);
  const generatedConfigs = [];
  const serversByName = {};
  const surfaces = registry.status === 'loaded' ? registry.surfaces : [];
  for (const surface of surfaces) {
    const generatedPath = stringOrNull(surface?.client_config?.generated_path);
    if (!generatedPath) continue;
    const configPath = resolve(siteRoot, generatedPath);
    const generatedFile = basename(generatedPath);
    generatedConfigs.push({
      surface_id: stringOrNull(surface?.surface_id),
      server_name: stringOrNull(surface?.server_name ?? surface?.client_config?.server_name),
      generated_path: generatedPath,
      generated_file: generatedFile,
      config_path: configPath,
      config_present: existsSync(configPath),
      config_ignored: isIgnoredLocalProjection(siteRoot, configPath),
      provenance: surfaceProvenance(surface, registry.path),
      regeneration: surfaceRegeneration(surface, siteRoot),
    });
  }

  const staleEntrypoints = [];
  for (const [serverName, server] of Object.entries(fabric.servers ?? {})) {
    const sourceFile = fabric.sources?.[serverName] ?? null;
    const diagnostic = generatedConfigs.find((config) => {
      if (config.server_name && config.server_name !== serverName) return false;
      if (server.surface_id && config.surface_id === server.surface_id) return true;
      return sourceFile && config.generated_file === sourceFile;
    }) ?? null;
    if (!diagnostic) continue;
    const repairScope = diagnostic.config_ignored
      ? 'ignored_local_projection_repair'
      : 'durable_repo_repair';
    const serverDiagnostic = {
      generated_config: {
        path: diagnostic.config_path,
        generated_path: diagnostic.generated_path,
        present: diagnostic.config_present,
        ignored: diagnostic.config_ignored,
      },
      provenance: diagnostic.provenance,
      regeneration: diagnostic.regeneration,
      repair_scope: repairScope,
    };
    const entrypoint = resolveServerEntrypoint(server, siteRoot);
    if (entrypoint && !existsSync(entrypoint.path)) {
      staleEntrypoints.push({
        server_name: serverName,
        surface_id: diagnostic.surface_id,
        entrypoint_path: entrypoint.path,
        entrypoint_source: entrypoint.source,
        generated_config: serverDiagnostic.generated_config,
        provenance: serverDiagnostic.provenance,
        regeneration: serverDiagnostic.regeneration,
        repair_scope: repairScope,
      });
    }
    serversByName[serverName] = serverDiagnostic;
  }

  const withRepairScope = generatedConfigs.map((config) => ({
    ...config,
    repair_scope: config.config_ignored
      ? 'ignored_local_projection_repair'
      : 'durable_repo_repair',
  }));
  return {
    schema: 'narada.mcp.fabric.generated_config_diagnostics.v1',
    status: staleEntrypoints.length === 0 ? 'ok' : 'stale_entrypoints',
    registry_path: registry.path,
    generated_configs: withRepairScope,
    stale_entrypoints: staleEntrypoints,
    ignored_local_repair_count: withRepairScope.filter((config) => config.repair_scope === 'ignored_local_projection_repair').length,
    durable_repo_repair_count: withRepairScope.filter((config) => config.repair_scope === 'durable_repo_repair').length,
    servers_by_name: serversByName,
  };
}

function surfaceProvenance(surface, registryPath) {
  return {
    registry_path: registryPath,
    source_file: stringOrNull(surface?.client_config?.source_file ?? surface?.source_file) ?? registryPath,
    generated_by: stringOrNull(surface?.client_config?.generated_by ?? surface?.generated_by) ?? null,
  };
}

function surfaceRegeneration(surface, siteRoot) {
  return {
    command: stringOrNull(surface?.client_config?.regeneration_command ?? surface?.regeneration_command)
      ?? `pnpm --filter @narada2/typed-mcp-surface exec node src/generate-carrier-mcp-config.mjs --site-root ${siteRoot} --carrier all --write`,
    source_file: stringOrNull(surface?.client_config?.regeneration_source_file ?? surface?.client_config?.source_file ?? surface?.source_file)
      ?? stringOrNull(surface?.client_config?.generated_from)
      ?? '.narada/capabilities/mcp-surfaces.json',
  };
}

function isIgnoredLocalProjection(siteRoot, path) {
  const gitignorePath = join(siteRoot, '.gitignore');
  if (!existsSync(gitignorePath)) return false;
  const relativePath = normalizePortablePathText(relative(siteRoot, path));
  const patterns = readFileSync(gitignorePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'));
  return patterns.some((pattern) => gitignorePatternMatches(pattern, relativePath));
}

function gitignorePatternMatches(pattern, relativePath) {
  const normalizedPattern = normalizePortablePathText(pattern.replace(/^\//, ''));
  if (normalizedPattern.endsWith('/')) {
    return relativePath.startsWith(normalizedPattern.slice(0, -1));
  }
  if (normalizedPattern.includes('*')) {
    const escaped = normalizedPattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*');
    return new RegExp(`^${escaped}$`).test(relativePath);
  }
  return relativePath === normalizedPattern || relativePath.startsWith(`${normalizedPattern}/`);
}

function stringOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
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
  const siteRootResolved = resolve(siteRoot);
  const portableSiteRoot = siteRootResolved.replaceAll('\\', '/');
  const targetSiteRoot = rawServer.target_site_root
    ? String(rawServer.target_site_root).replaceAll('{site_root}', portableSiteRoot)
    : portableSiteRoot;
  const args = Array.isArray(rawServer.args)
    ? rawServer.args.map((arg) => normalizePortablePathText(String(arg).replaceAll('{site_root}', portableSiteRoot)))
    : [];
  const normalizedTargetSiteRoot = normalizePortablePathText(targetSiteRoot);
  const pathPolicyViolation = firstServerPathPolicyViolation(serverName, siteRootResolved, args, normalizedTargetSiteRoot);
  if (pathPolicyViolation) {
    throw new McpFabricError(
      'mcp_fabric_server_path_outside_site_root',
      `MCP server ${serverName} contains a path outside the Site root`,
      pathPolicyViolation,
    );
  }
  return {
    transport: 'stdio',
    command,
    args,
    env: objectStringValues(rawServer.env),
    env_vars: Array.isArray(rawServer.env_vars) ? rawServer.env_vars.map(String) : [],
    ...rawServerToolList(rawServer),
    ...(rawServer.surface_id ? { surface_id: String(rawServer.surface_id) } : {}),
    target_site_root: normalizedTargetSiteRoot,
    ...(rawServer.authority_posture ? { authority_posture: String(rawServer.authority_posture) } : {}),
    ...(Number.isFinite(Number(rawServer.startup_timeout_sec)) ? { startup_timeout_sec: Number(rawServer.startup_timeout_sec) } : {}),
  };
}

function firstServerPathPolicyViolation(serverName, siteRoot, args, targetSiteRoot) {
  const siteRootResolved = resolve(siteRoot);
  for (const [index, arg] of args.entries()) {
    const violation = pathPolicyViolationForValue({
      siteRoot,
      siteRootResolved,
      value: arg,
      field: `args[${index}]`,
      serverName,
    });
    if (violation) return violation;
  }
  if (targetSiteRoot) {
    return pathPolicyViolationForValue({
      siteRoot,
      siteRootResolved,
      value: targetSiteRoot,
      field: 'target_site_root',
      serverName,
    });
  }
  return null;
}

function pathPolicyViolationForValue({ siteRoot, siteRootResolved, value, field, serverName }) {
  const text = String(value ?? '');
  if (!/(^|[\\/])\.\.([\\/]|$)/.test(text)) return null;
  const candidate = isAbsolute(text) ? resolve(text) : resolve(siteRoot, text);
  if (isPathInside(candidate, siteRootResolved)) return null;
  return {
    server_name: serverName,
    field,
    value: text,
    resolved_path: normalizePortablePathText(candidate),
    site_root: normalizePortablePathText(siteRootResolved),
  };
}

function isPathInside(candidate, root) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
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
