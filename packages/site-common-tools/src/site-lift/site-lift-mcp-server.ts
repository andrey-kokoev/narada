#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NARADA_USER_SITE_LOCUS } from '../site-locus-shim.js';
import { buildOutputRefToolContent } from '../mcp-payload-file.js';

const PROTOCOL_VERSION: any = '2024-11-05';
const SERVER_NAME: any = 'narada-site-lift-catalog-mcp';
const SERVER_VERSION: any = '0.1.0';
const CATALOG_SCHEMA: any = 'narada.site_lift_catalog.v0';

const options: any = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write('Usage: node tools/site-lift/site-lift-mcp-server.ts --site-root <path>\n');
  process.exit(0);
}

const siteRoot: any = resolve(options.siteRoot ?? process.cwd());
const catalogPath: any = join(siteRoot, 'site-lift', 'lift-catalog.json');
let activeOutputToolName: any = null;

runStdioServer().catch((error: any) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function runStdioServer() : Promise<any>{
  let buffer: any = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;
    let requests: any = [];
    if (buffer.includes('Content-Length:')) {
      const drained: any = drainJsonRpcFrames(buffer);
      buffer = drained.remaining;
      requests = drained.requests;
    } else {
      const lines: any = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      requests = lines.filter((line: any) => line.trim().length > 0).map((line: any) => JSON.parse(line));
    }
    for (const request of requests) {
      const response: any = handleRequest(request);
      if (response) writeMcpFrame(response);
    }
  }
  for (const request of parseJsonRpcInput(buffer.trim())) {
    const response: any = handleRequest(request);
    if (response) writeMcpFrame(response);
  }
}

function writeMcpFrame(response: any) : any{
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function handleRequest(request: any) : any{
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  try {
    return { jsonrpc: '2.0', id: request.id ?? null, result: dispatchMethod(request.method, request.params ?? {}) };
  } catch (error: any) {
    return {
      jsonrpc: '2.0',
      id: request?.id ?? null,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function dispatchMethod(method: any, params: any) : any{
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      };
    case 'tools/list':
      return { tools: tools() };
    case 'tools/call':
      return callTool(params);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function callTool(params: any) : any{
  const record: any = asRecord(params);
  const name: any = stringField(record, 'name');
  const args: any = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');
  activeOutputToolName = name;
  switch (name) {
    case 'site_lift_catalog_doctor':
      return jsonToolResult(doctor());
    case 'site_lift_catalog_list':
      return jsonToolResult(listArtifacts(args));
    case 'site_lift_catalog_show':
      return jsonToolResult(showArtifact(args));
    case 'site_lift_catalog_adoption_plan':
      return jsonToolResult(adoptionPlan(args));
    case 'site_lift_catalog_adoption_command':
      return jsonToolResult(adoptionCommand(args));
    default:
      throw new Error(`site_lift_catalog_refused_unknown_tool: ${name}`);
  }
}

function tools() : any{
  return [
    {
      name: 'site_lift_catalog_doctor',
      description: 'Validate the read-only Site lift catalog and report version drift against local source manifests.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'site_lift_catalog_list',
      description: 'List liftable Site artifacts from the advisory catalog. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          source_locus: { type: 'string' },
          lift_class: { type: 'string' },
          status: { type: 'string' },
          includes_mcp_server: { type: 'boolean' },
        },
      },
    },
    {
      name: 'site_lift_catalog_show',
      description: 'Show full advisory metadata for one liftable artifact. Read-only.',
      inputSchema: {
        type: 'object',
        properties: { artifact_id: { type: 'string' } },
        required: ['artifact_id'],
      },
    },
    {
      name: 'site_lift_catalog_adoption_plan',
      description: 'Return descriptive adoption requirements and non-portable boundaries for one artifact. Read-only.',
      inputSchema: {
        type: 'object',
        properties: { artifact_id: { type: 'string' } },
        required: ['artifact_id'],
      },
    },
    {
      name: 'site_lift_catalog_adoption_command',
      description: 'Return a first-class read-only adoption command packet for a receiving Site to review and execute under its own authority.',
      inputSchema: {
        type: 'object',
        properties: {
          artifact_id: { type: 'string' },
          receiving_site_id: { type: 'string' },
          receiving_site_root: { type: 'string' },
        },
        required: ['artifact_id'],
      },
    },
  ];
}

function doctor() : any{
  const loaded: any = loadCatalog();
  if (loaded.status !== 'ok') {
    return {
      schema: 'narada.site_lift_catalog.doctor.v0',
      status: 'error',
      catalog_path: relativePath(catalogPath),
      catalog_exists: existsSync(catalogPath),
      error: loaded.error,
      canonical_tools: tools().map((tool: any) => tool.name),
    };
  }
  const catalog: any = loaded.catalog;
  const artifacts: any = catalog.artifacts.map(withDriftStatus);
  const driftCount: any = artifacts.filter((artifact: any) => artifact.version_drift.status === 'drift').length;
  const missingVersionSourceCount: any = artifacts.filter((artifact: any) => artifact.version_drift.status === 'source_missing').length;
  return {
    schema: 'narada.site_lift_catalog.doctor.v0',
    status: driftCount === 0 && missingVersionSourceCount === 0 ? 'ok' : 'warning',
    authority_posture: catalog.authority_posture,
    catalog_path: relativePath(catalogPath),
    catalog_exists: true,
    catalog_schema: catalog.schema,
    schema_valid: catalog.schema === CATALOG_SCHEMA,
    artifact_count: artifacts.length,
    version_drift_count: driftCount,
    missing_version_source_count: missingVersionSourceCount,
    canonical_tools: tools().map((tool: any) => tool.name),
    artifacts: artifacts.map(compactArtifact),
  };
}

function listArtifacts(args: any) : any{
  const catalog: any = requireCatalog();
  let artifacts: any = catalog.artifacts.map(withDriftStatus);
  const sourceLocus: any = stringField(args, 'source_locus');
  const liftClass: any = stringField(args, 'lift_class');
  const status: any = stringField(args, 'status');
  const includesMcpServer: any = booleanField(args, 'includes_mcp_server');
  if (sourceLocus) artifacts = artifacts.filter((artifact: any) => artifact.source_locus === sourceLocus);
  if (liftClass) artifacts = artifacts.filter((artifact: any) => artifact.lift_class === liftClass);
  if (status) artifacts = artifacts.filter((artifact: any) => artifact.status === status);
  if (includesMcpServer !== undefined) {
    artifacts = artifacts.filter((artifact: any) => artifact.includes_mcp_server === includesMcpServer);
  }
  return {
    schema: 'narada.site_lift_catalog.list.v0',
    status: 'ok',
    authority_posture: catalog.authority_posture,
    count: artifacts.length,
    artifacts: artifacts.map(compactArtifact),
  };
}

function showArtifact(args: any) : any{
  const artifactId: any = requiredString(args, 'artifact_id');
  const catalog: any = requireCatalog();
  const artifact: any = catalog.artifacts.find((entry: any) => entry.artifact_id === artifactId);
  if (!artifact) return artifactNotFound(artifactId, catalog);
  return {
    schema: 'narada.site_lift_catalog.show.v0',
    status: 'ok',
    authority_posture: catalog.authority_posture,
    receiving_site_must_admit: artifact.receiving_site_must_admit === true,
    artifact: withDriftStatus(artifact),
  };
}

function adoptionPlan(args: any) : any{
  const artifactId: any = requiredString(args, 'artifact_id');
  const catalog: any = requireCatalog();
  const artifact: any = catalog.artifacts.find((entry: any) => entry.artifact_id === artifactId);
  if (!artifact) return artifactNotFound(artifactId, catalog);
  const enriched: any = withDriftStatus(artifact);
  return {
    schema: 'narada.site_lift_catalog.adoption_plan.v0',
    status: 'ok',
    authority_posture: catalog.authority_posture,
    artifact_id: artifact.artifact_id,
    name: artifact.name,
    version: artifact.version,
    version_drift: enriched.version_drift,
    receiving_site_must_admit: artifact.receiving_site_must_admit === true,
    portable_scope: artifact.portable_scope,
    source_locus: artifact.source_locus,
    source_paths: artifact.source_paths ?? [],
    compatibility_source_paths: artifact.compatibility_source_paths ?? [],
    dependencies: artifact.dependencies ?? [],
    non_portable_paths: artifact.non_portable_paths ?? [],
    authority_boundaries: artifact.authority_boundaries ?? [],
    adoption_requirements: artifact.adoption_requirements ?? [],
    receiving_site_adoption_checklist: artifact.receiving_site_adoption_checklist ?? [],
    adoption_command_behavior: artifact.adoption_command_behavior ?? null,
    mcp: artifact.includes_mcp_server ? {
      includes_mcp_server: true,
      includes_client_config: artifact.includes_client_config === true,
      receiver_must_register_mcp: artifact.receiver_must_register_mcp === true,
      entrypoint: artifact.mcp?.entrypoint ?? null,
      transport: artifact.mcp?.transport ?? null,
      canonical_tools: artifact.mcp?.canonical_tools ?? [],
    } : { includes_mcp_server: false },
    mutation_posture: 'advisory_only_no_copy_install_or_bootstrap',
  };
}

function adoptionCommand(args: any) : any{
  const artifactId: any = requiredString(args, 'artifact_id');
  const receivingSiteId: any = stringField(args, 'receiving_site_id') ?? 'receiving-site';
  const receivingSiteRoot: any = stringField(args, 'receiving_site_root') ?? null;
  const plan: any = adoptionPlan({ artifact_id: artifactId });
  if (plan.status === 'error') return plan;
  const requiredSteps: any = [
    {
      step: 'preflight',
      description: 'Confirm receiving Site authority, writable root, Node.js availability, and no raw authority database overwrite.',
      checks: [
        'receiving_site_root_exists',
        'receiving_site_authority_confirmed',
        'node_available',
        'source_paths_present',
      ],
    },
    {
      step: 'copy_portable_files',
      description: 'Copy only catalog-listed portable source paths under receiving Site authority.',
      source_paths: plan.source_paths,
      compatibility_source_paths: plan.compatibility_source_paths,
      excludes: plan.non_portable_paths,
    },
    {
      step: 'dependency_verification',
      description: 'Verify catalog dependencies and local receiving-Site equivalents before enabling lifecycle commands.',
      dependencies: plan.dependencies,
    },
    {
      step: 'migration_discovery',
      description: 'Discover task lifecycle database migrations without overwriting existing receiving-Site authority databases.',
      non_portable_paths: plan.non_portable_paths,
    },
    {
      step: 'roster_setup',
      description: 'Create or reconcile receiving-Site roster records under receiving-Site authority.',
    },
    {
      step: 'mcp_smoke_test',
      description: 'Start the catalog-listed MCP facade in the receiving Site and verify doctor/list/show or equivalent smoke paths.',
      mcp: plan.mcp,
    },
    {
      step: 'adoption_record',
      description: 'Write an adoption record or proposal packet in the receiving Site with friction and follow-up evidence.',
    },
  ];
  return {
    schema: 'narada.site_lift_catalog.adoption_command.v0',
    status: 'ok',
    authority_posture: plan.authority_posture,
    mutation_posture: 'advisory_command_packet_no_copy_install_or_bootstrap',
    artifact_id: plan.artifact_id,
    name: plan.name,
    version: plan.version,
    receiving_site: {
      site_id: receivingSiteId,
      root: receivingSiteRoot,
      must_admit: plan.receiving_site_must_admit,
      authority_warning: 'This packet does not grant receiving-Site adoption authority.',
    },
    command_flow: requiredSteps,
    receiving_site_adoption_checklist: plan.receiving_site_adoption_checklist,
    adoption_behavior: plan.adoption_command_behavior,
    adoption_record_template: {
      schema: 'narada.site_lift_catalog.adoption_record.v0',
      artifact_id: plan.artifact_id,
      source_site_id: NARADA_USER_SITE_LOCUS,
      receiving_site_id: receivingSiteId,
      receiving_site_root: receivingSiteRoot,
      decision: 'pending_receiving_site_admission',
      preflight: 'pending',
      dependency_verification: 'pending',
      migration_discovery: 'pending',
      roster_setup: 'pending',
      mcp_smoke_test: 'pending',
      friction: [],
      proposals: [],
    },
  };
}

function compactArtifact(artifact: any) : any{
  return {
    artifact_id: artifact.artifact_id,
    name: artifact.name,
    status: artifact.status,
    lift_class: artifact.lift_class,
    source_locus: artifact.source_locus,
    version: artifact.version,
    includes_mcp_server: artifact.includes_mcp_server === true,
    receiving_site_must_admit: artifact.receiving_site_must_admit === true,
    portable_scope: artifact.portable_scope,
    version_drift: artifact.version_drift,
  };
}

function withDriftStatus(artifact: any) : any{
  const actual: any = readVersionSource(artifact.version_source);
  let versionDrift: any;
  if (actual.status !== 'ok') {
    versionDrift = {
      status: actual.status,
      declared_version: artifact.version,
      actual_version: null,
      source_path: artifact.version_source?.path ?? null,
    };
  } else if (actual.version !== artifact.version) {
    versionDrift = {
      status: 'drift',
      declared_version: artifact.version,
      actual_version: actual.version,
      source_path: artifact.version_source.path,
    };
  } else {
    versionDrift = {
      status: 'ok',
      declared_version: artifact.version,
      actual_version: actual.version,
      source_path: artifact.version_source.path,
    };
  }
  return { ...artifact, version_drift: versionDrift };
}

function readVersionSource(versionSource: any) : any{
  if (!versionSource?.path) return { status: 'source_missing' };
  const absolutePath: any = resolve(siteRoot, versionSource.path);
  if (!existsSync(absolutePath)) return { status: 'source_missing' };
  try {
    const doc: any = JSON.parse(readFileSync(absolutePath, 'utf8'));
    const value: any = readJsonPointer(doc, versionSource.json_pointer ?? '/version');
    return typeof value === 'string' && value.length > 0
      ? { status: 'ok', version: value }
      : { status: 'version_missing' };
  } catch (error: any) {
    return { status: 'source_invalid_json', message: error instanceof Error ? error.message : String(error) };
  }
}

function readJsonPointer(value: any, pointer: any) : any{
  if (pointer === '' || pointer === '/') return value;
  let current: any = value;
  for (const part of pointer.split('/').slice(1).map((item: any) => item.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function requireCatalog() : any{
  const loaded: any = loadCatalog();
  if (loaded.status !== 'ok') throw new Error(loaded.error);
  return loaded.catalog;
}

function loadCatalog() : any{
  if (!existsSync(catalogPath)) return { status: 'error', error: 'site_lift_catalog_not_found' };
  try {
    const catalog: any = JSON.parse(readFileSync(catalogPath, 'utf8'));
    if (catalog.schema !== CATALOG_SCHEMA) return { status: 'error', error: `site_lift_catalog_schema_mismatch: ${catalog.schema}` };
    if (!Array.isArray(catalog.artifacts)) return { status: 'error', error: 'site_lift_catalog_artifacts_not_array' };
    return { status: 'ok', catalog };
  } catch (error: any) {
    return { status: 'error', error: `site_lift_catalog_invalid_json: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function artifactNotFound(artifactId: any, catalog: any) : any{
  return {
    schema: 'narada.site_lift_catalog.error.v0',
    status: 'error',
    error: 'artifact_not_found',
    artifact_id: artifactId,
    known_artifact_ids: catalog.artifacts.map((artifact: any) => artifact.artifact_id),
  };
}

function jsonToolResult(payload: any) : any{
  return buildOutputRefToolContent({ siteRoot, toolName: activeOutputToolName, value: payload });
}

function parseJsonRpcInput(text: any) : any{
  if (!text.trim()) return [];
  return text.split(/\r?\n/).filter((line: any) => line.trim().length > 0).map((line: any) => JSON.parse(line));
}

function drainJsonRpcFrames(input: any) : any{
  const requests: any = [];
  let remaining: any = input;
  while (true) {
    const crlfHeaderEnd: any = remaining.indexOf('\r\n\r\n');
    const lfHeaderEnd: any = remaining.indexOf('\n\n');
    const headerEnd: any = crlfHeaderEnd >= 0 ? crlfHeaderEnd : lfHeaderEnd;
    const separatorLength: any = crlfHeaderEnd >= 0 ? 4 : 2;
    if (headerEnd < 0) break;
    const match: any = /Content-Length:\s*(\d+)/i.exec(remaining.slice(0, headerEnd));
    if (!match) break;
    const bodyStart: any = headerEnd + separatorLength;
    const bodyEnd: any = bodyStart + Number(match[1]);
    if (remaining.length < bodyEnd) break;
    requests.push(JSON.parse(remaining.slice(bodyStart, bodyEnd)));
    remaining = remaining.slice(bodyEnd);
  }
  return { requests, remaining };
}

function parseArgs(argv: any) : any{
  const parsed: any = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--help' || argv[i] === '-h') parsed.help = true;
    else if (argv[i] === '--site-root') parsed.siteRoot = argv[++i];
  }
  return parsed;
}

function asRecord(value: any) : any{
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringField(record: any, key: any) : any{
  const value: any = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredString(record: any, key: any) : any{
  const value: any = stringField(record, key);
  if (!value) throw new Error(`${key}_required`);
  return value;
}

function booleanField(record: any, key: any) : any{
  const value: any = record?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function relativePath(path: any) : any{
  return path.startsWith(siteRoot) ? path.slice(siteRoot.length + 1).replace(/\\/g, '/') : path;
}
