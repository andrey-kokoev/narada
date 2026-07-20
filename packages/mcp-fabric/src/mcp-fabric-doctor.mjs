import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { spawnHiddenPostureProcess } from '@narada2/process-launch-posture';
import { loadMcpSurfaceRegistry, registrySurfaces, siteControlRoot } from '@narada2/carrier-action-admission/tool-metadata';
import { projectServerEnvironment } from './mcp-fabric-projection.mjs';
import { renderTable } from './mcp-fabric-table.mjs';
import { loadSiteMcpFabric } from './mcp-fabric-loader.mjs';
import { mcpFabricRepairPlan } from './mcp-fabric-repair-plans.mjs';
import { createMcpFabricLifecycle, transitionMcpFabricLifecycle } from './mcp-fabric-state.mjs';
import {
  createMcpFabricRuntimeLifecycle,
  transitionMcpFabricRuntime,
} from './mcp-fabric-runtime-state.mjs';

export async function runMcpFabricDoctor(siteRoot, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? 5000));
  let fabric;
  let runtimeLifecycle = createMcpFabricRuntimeLifecycle();
  try {
    runtimeLifecycle = transitionMcpFabricRuntime(runtimeLifecycle, 'loading');
    fabric = loadSiteMcpFabric(siteRoot, {
      required: options.required ?? true,
      validateRegistry: options.validateRegistry ?? 'diagnostic',
    });
  } catch (error) {
    runtimeLifecycle = transitionMcpFabricRuntime(runtimeLifecycle, 'unavailable');
    return {
      schema: 'narada.mcp.fabric.doctor.v1',
      status: 'failed',
      site_root: siteRoot,
      rows: [],
      runtime_lifecycle_schema: runtimeLifecycle.schema,
      runtime_lifecycle_state: runtimeLifecycle.state,
      runtime_lifecycle_history: runtimeLifecycle.history,
      runtime_lifecycle: runtimeLifecycle,
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

  runtimeLifecycle = transitionMcpFabricRuntime(
    runtimeLifecycle,
    rows.every((row) => row.initialize_status === 'ok' && row.tools_list_status === 'ok') ? 'ready' : 'degraded',
  );

  return {
    schema: 'narada.mcp.fabric.doctor.v1',
    status: rows.every((row) => row.initialize_status === 'ok' && row.tools_list_status === 'ok') ? 'ok' : 'failed',
    site_root: siteRoot,
    mcp_dir: fabric.mcp_dir,
    files: fabric.files,
    candidate_files: fabric.candidate_files ?? fabric.files,
    registry_validation: fabric.registry_validation ?? null,
    lifecycle_state: fabric.lifecycle_state ?? 'loaded',
    lifecycle_history: fabric.lifecycle_history ?? ['discovered', 'loaded'],
    runtime_lifecycle_schema: runtimeLifecycle.schema,
    runtime_lifecycle_state: runtimeLifecycle.state,
    runtime_lifecycle_history: runtimeLifecycle.history,
    runtime_lifecycle: runtimeLifecycle,
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
  let lifecycle = transitionMcpFabricLifecycle(createMcpFabricLifecycle(), 'loaded');
  const entrypoint = resolveServerEntrypoint(server, siteRoot);
  if (entrypoint && !existsSync(entrypoint.path)) {
    lifecycle = transitionMcpFabricLifecycle(lifecycle, 'starting');
    lifecycle = transitionMcpFabricLifecycle(lifecycle, 'start_failed');
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
    lifecycle = transitionMcpFabricLifecycle(lifecycle, 'closed');
    return { file: sourceFile, server: serverName, command: commandSummary, path_normalization: pathNormalization, initialize_status: "not_run", tools_list_status: "not_run", tools_list_count: null, first_diagnostic: `${diagnostics[0].code}: ${diagnostics[0].message}`, diagnostics, lifecycle_state: lifecycle.state, lifecycle_history: lifecycle.history };
  }

  try {
    lifecycle = transitionMcpFabricLifecycle(lifecycle, 'starting');
    proc = spawnHiddenPostureProcess(server.command, server.args ?? [], {
      posture: 'mcp_server',
      cwd: siteRoot,
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
    lifecycle = transitionMcpFabricLifecycle(
      lifecycle,
      initializeStatus === 'ok' && toolsListStatus === 'ok' ? 'ready' : initializeStatus === 'ok' ? 'probe_failed' : 'start_failed',
    );
  } catch (error) {
    const diagnostic = doctorDiagnostic(error, initializeStatus === 'not_run' ? 'initialize' : 'tools_list');
    diagnostics.push(diagnostic);
    if (diagnostic.code === 'initialize_timeout') initializeStatus = 'timeout';
    else if (diagnostic.code === 'tools_list_timeout') toolsListStatus = 'timeout';
    else if (initializeStatus === 'not_run') initializeStatus = 'error';
    else toolsListStatus = 'error';
    lifecycle = transitionMcpFabricLifecycle(lifecycle, initializeStatus === 'ok' ? 'probe_failed' : 'start_failed');
  } finally {
    if (proc && lifecycle.state !== 'closed') {
      lifecycle = transitionMcpFabricLifecycle(lifecycle, 'closing');
    }
    await stopDoctorProcess(proc);
    if (lifecycle.state !== 'closed') {
      lifecycle = transitionMcpFabricLifecycle(lifecycle, 'closed');
    }
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
    lifecycle_state: lifecycle.state,
    lifecycle_history: lifecycle.history,
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

function normalizePortablePathText(value) {
  return String(value).replaceAll('\\', '/');
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


