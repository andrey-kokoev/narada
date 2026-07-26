#!/usr/bin/env node
import { createHash } from 'crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, resolve, join, relative } from 'path';
import Database from '@narada2/sqlite';
import { runGovernedCommand } from '@narada2/process-launch-posture';
import { fileURLToPath } from 'url';
import net from 'net';
import {
  assembleBindingDiagnosis,
  assembleRuntimeBindingProjection,
} from './operator-surface-binding-services.js';
import {
  buildMcpRuntimeRegistryStatus,
  coordinateMcpRuntimeRestartRequest,
} from './mcp-runtime-instance-registry.js';
import { assertCanonicalSiteLocus, NARADA_USER_SITE_LOCUS } from '../site-locus-shim.js';
import { buildOutputRefToolContent, enforceInlinePayloadLimit, resolveToolPayloadArgs } from '../mcp-payload-file.js';

const PROTOCOL_VERSION: any = '2024-11-05';

let activeOutputToolName: any = null;

const TOOL_ALIASES: any = {
  operator_identity_list: 'operator_surface_list_identities',
  operator_identity_focus: 'operator_surface_focus_identity',
  operator_workspace_list: 'operator_surface_list_workspaces',
  operator_workspace_switch: 'operator_surface_switch_workspace',
  operator_binding_status: 'operator_surface_binding_status',
  operator_binding_repair: 'operator_surface_repair_bindings',
  operator_yasb_status: 'operator_surface_yasb_status',
  operator_yasb_debug: 'operator_surface_yasb_debug',
  yasb_debug: 'operator_surface_yasb_debug',
  operator_yasb_recover: 'operator_surface_recover_yasb',
  yasb_recover: 'operator_surface_recover_yasb',
  yasb_reload: 'operator_surface_reload_yasb',
  operator_yasb_reload: 'operator_surface_reload_yasb',
  yasb_stop: 'operator_surface_stop_yasb',
  operator_yasb_stop: 'operator_surface_stop_yasb',
  operator_yasb_materialize: 'operator_surface_materialize_yasb_projection',
  yasb_materialize_restart: 'operator_surface_materialize_yasb_projection',
  materialize_yasb_projection: 'operator_surface_materialize_yasb_projection',
  materialize_display_tools: 'operator_surface_materialize_display_tools',
  operator_osl_status: 'operator_surface_osl_status',
  operator_osl_start: 'operator_surface_start_osl',
  operator_osl_stop: 'operator_surface_stop_osl',
  operator_komorebi_health: 'operator_surface_komorebi_health',
  operator_komorebi_debug: 'operator_surface_komorebi_debug',
  komorebi_debug: 'operator_surface_komorebi_debug',
  operator_komorebi_stop: 'operator_surface_stop_komorebi',
  komorebi_stop: 'operator_surface_stop_komorebi',
  operator_restart_whkd: 'operator_surface_restart_whkd',
  operator_whkd_restart: 'operator_surface_restart_whkd',
  restart_whkd: 'operator_surface_restart_whkd',
};

const options: any = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write('Usage: node operator-surface-mcp-server.ts --site-root <path> [--invoke-tool <name> --arguments-file <path>]\n');
  process.exit(0);
}

const siteRoot: any = resolve(options.siteRoot ?? process.cwd());
const serverDir: any = dirname(fileURLToPath(import.meta.url));
const repoRoot: any = resolve(serverDir, '..', '..');
const carriersDir: any = join(siteRoot, 'tools', 'operator-surface-carriers');
const overlayDir: any = join(siteRoot, 'tools', 'window-surface-overlay');
const panelHostDir: any = join(siteRoot, 'tools', 'osl-webview2-panel-host');
const yasbToolsDir: any = join(siteRoot, 'templates', 'pc-sites', 'windows-komorebi-yasb', 'tools', 'yasb');
const komorebiToolsDir: any = join(siteRoot, 'templates', 'pc-sites', 'windows-komorebi-yasb', 'tools', 'komorebi');
const displayToolsDir: any = join(siteRoot, 'templates', 'pc-sites', 'windows-komorebi-yasb', 'tools', 'display');
const pcSiteRoot: any = options.pcSiteRoot ?? 'C:/ProgramData/Narada/sites/pc/desktop-sunroom-2';
const runtimeBindingsPath: any = join(pcSiteRoot, 'runtime', 'operator-surface-window-bindings.json');
const identitiesProjectionPath: any = join(siteRoot, 'operator-surfaces', 'identities.json');
const operatorWorkspacesProjectionPath: any = join(siteRoot, 'operator-surfaces', 'operator-workspaces.json');
const windowLabelsProjectionPath: any = join(siteRoot, 'operator-surfaces', 'window-labels.json');
const operatorSurfaceDbPath: any = join(siteRoot, '.ai', 'db', 'operator-surface.db');
const operatorSurfaceBackupDir: any = join(siteRoot, '.ai', 'backups', 'operator-surface');
const operatorSurfaceAuthoritySchemaVersion: any = 1;
const operatorSurfaceAuthoritySchemaId: any = 'narada.operator_surface.authority_db.v1';
const taskLifecycleDbPath: any = join(siteRoot, '.ai', 'task-lifecycle.db');
const operatorSurfaceRuntimeDbPath: any = join(pcSiteRoot, 'runtime', 'operator-surface-runtime.db');
const oslPidPath: any = join(pcSiteRoot, 'runtime', 'window-surface-overlay.pid');
const pcOverlayDir: any = join(pcSiteRoot, 'tools', 'window-surface-overlay');
const yasbPipe: any = '\\\\.\\pipe\\yasb_pipe_cli';
let operatorDb: any = null;
let runtimeDb: any = null;

if (options.invokeTool) {
  invokeOneShotTool(options).catch((error: any) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
} else {
  runStdioServer().catch((error: any) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

async function invokeOneShotTool(serverOptions: any) : Promise<any>{
  if (!serverOptions.argumentsFile) throw new Error('operator_surface_one_shot_requires_arguments_file');
  const args: any = JSON.parse(readFileSync(resolve(serverOptions.argumentsFile), 'utf8'));
  const result: any = await callTool({ name: serverOptions.invokeTool, arguments: args });
  const text: any = result?.content?.[0]?.text;
  process.stdout.write(`${text ?? JSON.stringify(result, null, 2)}\n`);
}

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
      requests = lines
        .filter((line: any) => line.trim().length > 0)
        .map((line: any) => JSON.parse(line));
    }

    for (const request of requests) {
      const response: any = await handleRequest(request);
      if (response) writeMcpFrame(response);
    }
  }
  const trailing: any = buffer.trim();
  if (trailing.length > 0) {
    for (const request of parseJsonRpcInput(trailing)) {
      const response: any = await handleRequest(request);
      if (response) writeMcpFrame(response);
    }
  }
}

function writeMcpFrame(response: any) : any{
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function handleRequest(request: any) : Promise<any>{
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  try {
    const result: any = await dispatchMethod(request.method, request.params ?? {});
    return { jsonrpc: '2.0', id: request.id ?? null, result };
  } catch (error: any) {
    return {
      jsonrpc: '2.0',
      id: request?.id ?? null,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    };
  }
}

async function dispatchMethod(method: any, params: any) : Promise<any>{
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'narada-operator-surface-mcp',
          version: '0.1.0',
        },
      };
    case 'tools/list':
      return { tools: tools() };
    case 'tools/call':
      return await callTool(params);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

async function callTool(params: any) : Promise<any>{
  const record: any = asRecord(params);
  const name: any = stringField(record, 'name');
  const args: any = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');

  const canonicalName: any = TOOL_ALIASES[name] ?? name;
  activeOutputToolName = canonicalName;
  enforceInlinePayloadLimit({ toolName: canonicalName, args, allowPayloadCreation: true });
  const effectiveArgs: any = canonicalName === 'operator_surface_send_message' && stringField(args, 'payload_ref')
    ? resolveToolPayloadArgs({
      siteRoot,
      toolName: canonicalName,
      args,
      allowedTools: ['operator_surface_send_message'],
    }).args
    : args;

  switch (canonicalName) {
    case 'operator_surface_doctor':
      return operatorSurfaceDoctor();

    case 'operator_surface_authority_status':
      return operatorSurfaceAuthorityStatus();

    case 'operator_surface_backup_authority':
      return operatorSurfaceBackupAuthority(args);

    case 'operator_surface_list_identities':
      return operatorIdentityList(args);

    case 'operator_surface_register_agent_profile':
      return operatorSurfaceRegisterAgentProfile(args);

    case 'operator_surface_admit_identity':
      return operatorSurfaceAdmitIdentity(args);

    case 'operator_surface_update_identity':
      return operatorSurfaceUpdateIdentity(args);

    case 'operator_surface_revoke_identity':
      return operatorSurfaceRevokeIdentity(args);

    case 'operator_surface_list_agent_profiles':
      return operatorIdentityList(args);

    case 'operator_surface_show_agent_profile':
      return operatorSurfaceShowAgentProfile(args);

    case 'operator_surface_register':
      return await operatorSurfaceRegister(args);

    case 'operator_surface_list':
      return operatorSurfaceList(args);

    case 'operator_surface_observe_current':
      return await operatorSurfaceObserveCurrent(args);

    case 'operator_surface_bind_agent':
      return await operatorSurfaceBindAgent(args);

    case 'operator_surface_unbind_agent':
      return operatorSurfaceUnbindAgent(args);

    case 'operator_surface_prune_stale_bindings':
      return await operatorSurfacePruneStaleBindings(args);

    case 'operator_surface_project_osl_bindings':
      return await operatorSurfaceProjectOslBindings(args);

    case 'operator_surface_project_identity_registry':
      return operatorSurfaceProjectIdentityRegistry(args);

    case 'operator_surface_project_window_labels':
      return await operatorSurfaceProjectWindowLabels(args);

    case 'operator_surface_project_osl_state':
      return await operatorSurfaceProjectOslState(args);

    case 'operator_surface_focus_identity':
      return await operatorIdentityFocus(args);

    case 'operator_surface_send_message':
      return await operatorSurfaceSendMessage(effectiveArgs);

    case 'operator_surface_message_bus_state':
      return await operatorSurfaceMessageBusState(args);

    case 'operator_surface_list_workspaces':
      return operatorWorkspaceList();

    case 'operator_surface_register_workspace':
      return operatorSurfaceRegisterWorkspace(args);

    case 'operator_surface_project_workspace_state':
      return operatorSurfaceProjectWorkspaceState(args);

    case 'operator_surface_switch_workspace':
      return await operatorWorkspaceSwitch(args);

    case 'operator_surface_binding_status':
      return operatorBindingStatus();

    case 'operator_surface_repair_bindings':
      return await operatorBindingRepair(args);

    case 'operator_surface_health':
      return await operatorSurfaceHealth();

    case 'operator_surface_yasb_status':
      return await operatorYasbStatus();

    case 'operator_surface_yasb_debug':
      return await operatorYasbDebug(args);

    case 'operator_surface_recover_yasb':
      return await operatorYasbRecover(args);

    case 'operator_surface_reload_yasb':
      return await operatorYasbReload(args);

    case 'operator_surface_stop_yasb':
      return await operatorYasbStop(args);

    case 'operator_surface_materialize_yasb_projection':
      return await operatorYasbMaterializeProjection(args);

    case 'operator_surface_materialize_komorebi_tools':
      return operatorKomorebiMaterializeTools(args);

    case 'operator_surface_materialize_display_tools':
      return operatorDisplayMaterializeTools(args);

    case 'operator_surface_osl_status':
      return operatorOslStatus();

    case 'operator_surface_start_osl':
      return await operatorOslStart();

    case 'operator_surface_stop_osl':
      return await operatorOslStop();

    case 'operator_surface_build_deploy_osl':
      return await operatorOslBuildDeploy(args);

    case 'operator_surface_mcp_runtime_registry_status':
      return operatorMcpRuntimeRegistryStatus(args);

    case 'operator_surface_mcp_restart_request':
      return operatorMcpRestartRequest(args);

    case 'operator_surface_komorebi_health':
      return await operatorKomorebiHealth();

    case 'operator_surface_komorebi_debug':
      return await operatorKomorebiDebug(args);

    case 'operator_surface_repair_phantom_tiled_windows':
      return await operatorKomorebiRepairPhantomTiledWindows(args);

    case 'operator_surface_stop_komorebi':
      return await operatorKomorebiStop(args);

    case 'operator_surface_restart_komorebi':
      return await operatorKomorebiRestart(args);

    case 'operator_surface_restart_whkd':
      return await operatorWhkdRestart(args);

    default:
      throw new Error(`operator_surface_mcp_refused: ${name}`);
  }
}

/* ─── Authority lifecycle ─── */
function ensureOperatorSurfaceAuthorityMetadata(db: any) : any{
  const now: any = new Date().toISOString();
  const upsert: any = db.prepare(`
    INSERT INTO operator_surface_metadata (key, value_json, updated_at, updated_by)
    VALUES (@key, @value_json, @updated_at, @updated_by)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `);
  const existingSchema: any = db.prepare(`
    SELECT value_json FROM operator_surface_metadata
    WHERE key = 'schema'
  `).get();
  const existingSchemaValue: any = parseJson(existingSchema?.value_json, {});
  if (existingSchemaValue.schema_version !== operatorSurfaceAuthoritySchemaVersion || existingSchemaValue.schema_id !== operatorSurfaceAuthoritySchemaId) {
    upsert.run({
      key: 'schema',
      value_json: JSON.stringify({
        schema_id: operatorSurfaceAuthoritySchemaId,
        schema_version: operatorSurfaceAuthoritySchemaVersion,
        authority_scope: 'user_site_operator_surface_profiles_and_workspaces',
        projection_policy: 'json_files_are_generated_compatibility_projections_not_authority',
      }),
      updated_at: now,
      updated_by: 'operator_surface_mcp_schema_bootstrap',
    });
  }
  const existingLifecycle: any = db.prepare(`
    SELECT value_json FROM operator_surface_metadata
    WHERE key = 'lifecycle_policy'
  `).get();
  if (!existingLifecycle) {
    upsert.run({
      key: 'lifecycle_policy',
      value_json: JSON.stringify({
        backup_tool: 'operator_surface_backup_authority',
        restore_policy: 'restore_latest_backup_to_.ai/db/operator-surface.db_then_run_operator_surface_project_osl_state',
        rebuild_policy: 'use_admitted_migrations_or_profile_workspace_registration_tools; projections_are_not_sufficient_as_authority_sources',
        portability: 'user_site_db_is_portable_site_authority; pc_runtime_db_remains_pc_locus_state',
      }),
      updated_at: now,
      updated_by: 'operator_surface_mcp_schema_bootstrap',
    });
  }
}

function readOperatorSurfaceAuthorityMetadata(db: any) : any{
  return Object.fromEntries(db.prepare(`
    SELECT key, value_json, updated_at, updated_by
    FROM operator_surface_metadata
    ORDER BY key
  `).all().map((row: any) => [row.key, {
    value: parseJson(row.value_json, row.value_json),
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  }]));
}

function operatorSurfaceAuthorityStatus() : any{
  const db: any = openOperatorSurfaceDb();
  const tables: any = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'operator_surface_%'
    ORDER BY name
  `).all().map((row: any) => row.name);
  const counts: any = Object.fromEntries(tables.map((table: any) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
  return jsonToolResult({
    status: 'ok',
    schema: 'narada.operator_surface.authority_status.v0',
    authority: 'sqlite',
    db_path: operatorSurfaceDbPath,
    metadata: readOperatorSurfaceAuthorityMetadata(db),
    tables,
    counts,
    backup_tool: 'operator_surface_backup_authority',
    projection_boundaries: operatorSurfaceProjectionBoundaries(),
  });
}

async function operatorSurfaceBackupAuthority(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const reason: any = stringField(args, 'reason') ?? 'operator_surface_authority_backup';
  const db: any = openOperatorSurfaceDb();
  const timestamp: any = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot: any = join(operatorSurfaceBackupDir, timestamp);
  const backupDbPath: any = join(backupRoot, 'operator-surface.db');
  const manifestPath: any = join(backupRoot, 'manifest.json');
  const manifest: any = {
    schema: 'narada.operator_surface.authority_backup.v0',
    created_at: new Date().toISOString(),
    created_by: 'operator_surface_mcp',
    reason,
    authority: 'sqlite',
    source_db: operatorSurfaceDbPath,
    backup_db: backupDbPath,
    metadata: readOperatorSurfaceAuthorityMetadata(db),
    projection_boundaries: operatorSurfaceProjectionBoundaries(),
    restore_procedure: [
      'Stop operator-surface MCP/carriers that might hold the DB open.',
      'Copy backup operator-surface.db back to .ai/db/operator-surface.db.',
      'Start the MCP surface, inspect operator_surface_authority_status, then regenerate projections with operator_surface_project_osl_state.',
    ],
    rebuild_policy: 'Generated projection JSON is insufficient as a bootstrap authority source; use admitted migrations or MCP registration tools to rebuild missing authority rows.',
  };
  if (dryRun) return jsonToolResult({ status: 'dry_run', backup_root: backupRoot, manifest });
  mkdirSync(backupRoot, { recursive: true });
  await db.backup(backupDbPath);
  writeJsonFile(manifestPath, manifest);
  return jsonToolResult({ status: 'backed_up', backup_root: backupRoot, backup_db: backupDbPath, manifest_path: manifestPath, manifest });
}

function operatorSurfaceProjectionBoundaries() : any{
  return {
    user_site_authority_db: operatorSurfaceDbPath,
    pc_site_runtime_authority_db: operatorSurfaceRuntimeDbPath,
    generated_projections: {
      identities: identitiesProjectionPath,
      operator_workspaces: operatorWorkspacesProjectionPath,
      window_labels: windowLabelsProjectionPath,
      runtime_bindings: runtimeBindingsPath,
    },
    rule: 'Projection JSON is generated compatibility output, not an authority or backup source.',
  };
}

/* ─── Doctor ─── */
async function operatorSurfaceDoctor() : Promise<any>{
  const authorityStatus: any = unwrapSync(operatorSurfaceAuthorityStatus());
  const checks: any = {
    authority_posture: 'sqlite_authority_with_generated_projections',
    authority_metadata: authorityStatus.metadata,
    surface_type: 'operator_surface_mcp',
    site_root: siteRoot,
    pc_site_root: pcSiteRoot,
    operator_surface_db: operatorSurfaceDbPath,
    operator_surface_db_exists: existsSync(operatorSurfaceDbPath),
    operator_surface_runtime_db: operatorSurfaceRuntimeDbPath,
    operator_surface_runtime_db_exists: existsSync(operatorSurfaceRuntimeDbPath),
    identities_json: existsSync(join(siteRoot, 'operator-surfaces', 'identities.json')),
    identities_projection_json: existsSync(identitiesProjectionPath),
    operator_workspaces_projection_json: existsSync(operatorWorkspacesProjectionPath),
    window_labels_projection_json: existsSync(windowLabelsProjectionPath),
    runtime_bindings_projection_json: existsSync(runtimeBindingsPath),
    projection_boundaries: {
      identities_json: {
        path: identitiesProjectionPath,
        role: 'compatibility_projection',
        authority: operatorSurfaceDbPath,
      },
      operator_workspaces_json: {
        path: operatorWorkspacesProjectionPath,
        role: 'compatibility_projection_for_legacy_carriers',
        authority: operatorSurfaceDbPath,
      },
      window_labels_json: {
        path: windowLabelsProjectionPath,
        role: 'compatibility_projection_for_current_osl_renderer',
        authority: operatorSurfaceDbPath,
      },
      runtime_bindings_json: {
        path: runtimeBindingsPath,
        role: 'compatibility_projection_for_current_osl_renderer',
        authority: operatorSurfaceRuntimeDbPath,
      },
    },
    carriers_dir: existsSync(carriersDir),
    overlay_dir: existsSync(overlayDir),
    yasb_pipe_accessible: false,
    osl_pid_file: existsSync(oslPidPath),
    canonical_tools: tools().map((t: any) => t.name),
    deprecated_aliases: TOOL_ALIASES,
    allowed_tools: tools().map((t: any) => t.name),
    conceptual_role: {
      execution_context_relation: 'observes and can mutate local operator execution substrate',
      intelligence_context_relation: 'materializes operator/runtime context for evaluation',
      authority_state_relation: 'profiles/workspaces live in User Site SQLite; runtime surfaces/bindings live in PC Site SQLite',
    },
  };
  try {
    checks.yasb_pipe_accessible = await new Promise((resolve: any) => {
      const client: any = net.connect(yasbPipe, () => { client.end(); resolve(true); });
      client.on('error', () => resolve(false));
      client.setTimeout(500, () => { client.destroy(); resolve(false); });
    });
  } catch { checks.yasb_pipe_accessible = false; }
  return jsonToolResult({ status: 'ok', ...checks });
}

/* ─── Identity List ─── */
function operatorIdentityList(args: any) : any{
  const db: any = openOperatorSurfaceDb();
  const siteFilter: any = stringField(args, 'site_id');
  const roleFilter: any = stringField(args, 'role');
  const includeDeprecated: any = booleanField(args, 'include_deprecated') === true;
  const clauses: any = ['revoked_at IS NULL'];
  const params: any = {};
  if (!includeDeprecated) clauses.push('deprecated = 0');
  if (siteFilter) { clauses.push('site_id = @site_id'); params.site_id = siteFilter; }
  if (roleFilter) { clauses.push('role = @role'); params.role = roleFilter; }
  const rows: any = db.prepare(`
    SELECT identity_id, identity_name, agent_name, role, agent_kind, site_id,
           label, display_name, deprecated, superseded_by, admitted_by, admitted_at,
           updated_at, submit_strategy, carrier_projections_json
    FROM operator_surface_identities
    WHERE ${clauses.join(' AND ')}
    ORDER BY site_id, role, agent_name
  `).all(params);
  const identities: any = rows.map((row: any) => ({
    identity_id: row.identity_id,
    identity_name: row.identity_name,
    agent_name: row.agent_name,
    role: row.role,
    agent_kind: row.agent_kind,
    site_id: row.site_id,
    label: row.label,
    display_name: row.display_name,
    deprecated: row.deprecated === 1,
    superseded_by: row.superseded_by,
    admitted_by: row.admitted_by,
    admitted_at: row.admitted_at,
    updated_at: row.updated_at,
    submit_strategy: row.submit_strategy,
    carrier_projections: parseJson(row.carrier_projections_json, {}),
  }));
  return jsonToolResult({
    status: 'ok',
    authority: 'sqlite',
    db_path: operatorSurfaceDbPath,
    count: identities.length,
    identities,
  });
}

function operatorSurfaceShowAgentProfile(args: any) : any{
  const identityName: any = stringField(args, 'identity_name') ?? stringField(args, 'identity_id');
  if (!identityName) throw new Error('identity_name_required');
  const profile: any = getAgentProfile(identityName);
  if (!profile) throw new Error(`agent_profile_not_found: ${identityName}`);
  return jsonToolResult({ status: 'ok', authority: 'sqlite', db_path: operatorSurfaceDbPath, profile });
}

function operatorSurfaceRegisterAgentProfile(args: any) : any{
  const identityName: any = stringField(args, 'identity_name') ?? stringField(args, 'identity_id');
  if (!identityName) throw new Error('identity_name_required');
  const role: any = stringField(args, 'role');
  if (!role) throw new Error('role_required');
  const explicitSiteId: any = stringField(args, 'site_id');
  const siteId: any = explicitSiteId
    ? assertCanonicalSiteLocus(explicitSiteId, 'operator_surface_register_agent_profile.site_id')
    : NARADA_USER_SITE_LOCUS;
  const agentName: any = stringField(args, 'agent_name') ?? identityName.split('.').pop();
  const agentKind: any = stringField(args, 'agent_kind') ?? 'cli-coding-agent';
  const admittedBy: any = stringField(args, 'admitted_by') ?? 'operator';
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const now: any = new Date().toISOString();
  const db: any = openOperatorSurfaceDb();
  const existing: any = db.prepare('SELECT identity_id FROM operator_surface_identities WHERE identity_id = ? OR identity_name = ?').get(identityName, identityName);
  const rosterAgent: any = getRosterAgent(identityName);
  const allowUnrostered: any = booleanField(args, 'allow_unrostered') === true;
  if (!rosterAgent && !allowUnrostered) {
    throw new Error(`agent_not_in_sqlite_roster: ${identityName}`);
  }
  if (rosterAgent && rosterAgent.role !== role) {
    throw new Error(`agent_role_mismatch: profile=${role} roster=${rosterAgent.role}`);
  }

  const profile: any = {
    identity_id: identityName,
    identity_name: identityName,
    agent_name: agentName,
    role,
    agent_kind: agentKind,
    site_id: siteId,
    site_locus_resolution: {
      schema: 'narada.site_locus.canonical_resolution.v1',
      site_locus: siteId,
      source: explicitSiteId ? 'explicit' : 'configured_default',
    },
    label: stringField(args, 'label') ?? agentName,
    display_name: stringField(args, 'display_name') ?? agentName,
    narada_site_relation: objectField(args, 'narada_site_relation') ?? {
      site_id: siteId,
      site_kind: stringField(args, 'site_kind') ?? 'user',
      root: siteRoot,
      relation: stringField(args, 'relation') ?? `${siteId} ${agentName} operator surface`,
    },
    role_metadata: { role, role_is_naming_authority: false },
    projection_intent: arrayField(args, 'projection_intent', ['native_window_label_overlay']),
    distinct_from: arrayField(args, 'distinct_from', []),
    carrier_projections: objectField(args, 'carrier_projections') ?? {},
    label_projection: objectField(args, 'label_projection') ?? {},
    input_capabilities: arrayField(args, 'input_capabilities', ['focus', 'type_text', 'submit']),
    submit_strategy: stringField(args, 'submit_strategy') ?? 'known_surface_submit',
    role_prompt: stringField(args, 'role_prompt') ?? null,
    authority_limits: arrayField(args, 'authority_limits', [
      'identity_record_is_site_authority',
      'runtime_handle_binding_is_not_admitted_here',
      'operator_surface_does_not_grant_effect_capability',
    ]),
  };

  if (dryRun) {
    return jsonToolResult({ status: 'dry_run', authority: 'sqlite', roster_agent: rosterAgent, would: existing ? 'update_agent_profile' : 'insert_agent_profile', profile });
  }

  db.transaction(() => {
    db.prepare(`
      INSERT INTO operator_surface_sites (site_id, affinity_color, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(site_id) DO UPDATE SET updated_at = excluded.updated_at
    `).run(siteId, stringField(args, 'site_affinity_color') ?? '000000', now);
    db.prepare(`
      INSERT INTO operator_surface_roles (role, label, affinity_color, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(role) DO UPDATE SET label = excluded.label, affinity_color = excluded.affinity_color, updated_at = excluded.updated_at
    `).run(role, stringField(args, 'role_label') ?? role, stringField(args, 'role_affinity_color') ?? '000000', now);
    db.prepare(`
      INSERT INTO operator_surface_identities (
        identity_id, identity_name, agent_name, role, agent_kind, site_id,
        label, display_name, deprecated, superseded_by,
        previous_identity_ids_json, migration_history_json,
        narada_site_relation_json, role_metadata_json,
        projection_intent_json, distinct_from_json, carrier_projections_json,
        label_projection_json, input_capabilities_json, submit_strategy, role_prompt,
        authority_limits_json, admitted_by, admitted_at, updated_at
      ) VALUES (
        @identity_id, @identity_name, @agent_name, @role, @agent_kind, @site_id,
        @label, @display_name, 0, NULL,
        '[]', '[]',
        @narada_site_relation_json, @role_metadata_json,
        @projection_intent_json, @distinct_from_json, @carrier_projections_json,
        @label_projection_json, @input_capabilities_json, @submit_strategy, @role_prompt,
        @authority_limits_json, @admitted_by, @admitted_at, @updated_at
      )
      ON CONFLICT(identity_id) DO UPDATE SET
        identity_name = excluded.identity_name,
        agent_name = excluded.agent_name,
        role = excluded.role,
        agent_kind = excluded.agent_kind,
        site_id = excluded.site_id,
        label = excluded.label,
        display_name = excluded.display_name,
        narada_site_relation_json = excluded.narada_site_relation_json,
        role_metadata_json = excluded.role_metadata_json,
        projection_intent_json = excluded.projection_intent_json,
        distinct_from_json = excluded.distinct_from_json,
        carrier_projections_json = excluded.carrier_projections_json,
        label_projection_json = excluded.label_projection_json,
        input_capabilities_json = excluded.input_capabilities_json,
        submit_strategy = excluded.submit_strategy,
        role_prompt = excluded.role_prompt,
        authority_limits_json = excluded.authority_limits_json,
        updated_at = excluded.updated_at
    `).run({
      ...profile,
      narada_site_relation_json: JSON.stringify(profile.narada_site_relation),
      role_metadata_json: JSON.stringify(profile.role_metadata),
      projection_intent_json: JSON.stringify(profile.projection_intent),
      distinct_from_json: JSON.stringify(profile.distinct_from),
      carrier_projections_json: JSON.stringify(profile.carrier_projections),
      label_projection_json: JSON.stringify(profile.label_projection),
      input_capabilities_json: JSON.stringify(profile.input_capabilities),
      role_prompt: profile.role_prompt,
      authority_limits_json: JSON.stringify(profile.authority_limits),
      admitted_by: admittedBy,
      admitted_at: now,
      updated_at: now,
    });
    db.prepare(`
      INSERT INTO operator_surface_identity_admission_log
        (identity_id, event_kind, event_at, event_by, payload_json, source)
      VALUES (?, ?, ?, ?, ?, 'operator_surface_mcp')
    `).run(identityName, existing ? 'updated' : 'admitted', now, admittedBy, JSON.stringify(profile));
  })();

  return jsonToolResult({ status: existing ? 'updated' : 'registered', authority: 'sqlite', db_path: operatorSurfaceDbPath, profile: getAgentProfile(identityName) });
}

function operatorSurfaceAdmitIdentity(args: any) : any{
  const identityName: any = stringField(args, 'identity_name') ?? stringField(args, 'identity_id');
  if (!identityName) throw new Error('identity_name_required');
  const existing: any = getAgentProfile(identityName);
  if (existing && !existing.revoked_at) throw new Error(`operator_surface_identity_already_exists: ${identityName}`);
  const result: any = operatorSurfaceRegisterAgentProfile({ ...args, identity_name: identityName });
  if (booleanField(args, 'dry_run') !== true) operatorSurfaceProjectIdentityRegistry({});
  return result;
}

function operatorSurfaceUpdateIdentity(args: any) : any{
  const identityName: any = stringField(args, 'identity_name') ?? stringField(args, 'identity_id');
  if (!identityName) throw new Error('identity_name_required');
  const existing: any = getAgentProfile(identityName);
  if (!existing || existing.revoked_at) throw new Error(`operator_surface_identity_not_found: ${identityName}`);
  const result: any = operatorSurfaceRegisterAgentProfile({ ...args, identity_name: identityName });
  if (booleanField(args, 'dry_run') !== true) operatorSurfaceProjectIdentityRegistry({});
  return result;
}

function operatorSurfaceRevokeIdentity(args: any) : any{
  const identityName: any = stringField(args, 'identity_name') ?? stringField(args, 'identity_id');
  if (!identityName) throw new Error('identity_name_required');
  const revokedBy: any = stringField(args, 'revoked_by') ?? stringField(args, 'admitted_by') ?? 'operator_surface_mcp';
  const reason: any = stringField(args, 'reason') ?? 'not_specified';
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const existing: any = getAgentProfile(identityName);
  if (!existing || existing.revoked_at) throw new Error(`operator_surface_identity_not_found: ${identityName}`);
  const now: any = new Date().toISOString();
  if (dryRun) {
    return jsonToolResult({ status: 'dry_run', authority: 'sqlite', would: 'revoke_identity', identity_name: identityName, reason });
  }
  const db: any = openOperatorSurfaceDb();
  db.transaction(() => {
    db.prepare(`
      UPDATE operator_surface_identities
      SET revoked_at = ?, revoked_by = ?, updated_at = ?
      WHERE identity_id = ? OR identity_name = ?
    `).run(now, revokedBy, now, identityName, identityName);
    db.prepare(`
      INSERT INTO operator_surface_identity_admission_log
        (identity_id, event_kind, event_at, event_by, payload_json, source)
      VALUES (?, 'revoked', ?, ?, ?, 'operator_surface_mcp')
    `).run(identityName, now, revokedBy, JSON.stringify({ identity_name: identityName, reason }));
  })();
  const projection: any = unwrapSync(operatorSurfaceProjectIdentityRegistry({}));
  return jsonToolResult({ status: 'revoked', authority: 'sqlite', db_path: operatorSurfaceDbPath, identity_name: identityName, revoked_at: now, revoked_by: revokedBy, reason, projection });
}

/* ─── Identity Focus ─── */
async function operatorIdentityFocus(args: any) : Promise<any>{
  const identityName: any = stringField(args, 'identity_name');
  if (!identityName) throw new Error('identity_name_required');
  const dryRun: any = booleanField(args, 'dry_run');
  const scriptPath: any = join(carriersDir, 'windows-glue', 'Focus-OperatorSurfaceIdentity.ps1');
  if (!existsSync(scriptPath)) {
    return jsonToolResult({ status: 'missing_capability', capability: 'focus_identity', expected: scriptPath, authority: 'sqlite', note: 'Legacy PowerShell carrier is absent; MCP did not fall back to an ad-hoc path.' });
  }
  const psArgs: any = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-IdentityName', identityName, '-PassThru'];
  if (dryRun) psArgs.push('-DryRun');
  const stdout: any = await spawnPwsh(psArgs);
  return jsonToolResult({ status: 'ok', focus_event: safeJsonParse(stdout) ?? stdout });
}

/* ─── Operator Surface Message Bus ─── */
async function operatorSurfaceSendMessage(args: any) : Promise<any>{
  const identityName: any = stringField(args, 'identity_name');
  const text: any = stringField(args, 'text');
  if (!identityName) throw new Error('identity_name_required');
  if (!text) throw new Error('text_required');

  const permissionDecision: any = evaluateOsmSendPermission(args);
  if (permissionDecision.allowed !== true) {
    return jsonToolResult({
      status: 'refused',
      capability: 'operator_surface_message_bus',
      refusal_kind: 'osm_send_permission_policy',
      reason: permissionDecision.reason,
      policy: permissionDecision.policy,
      authority_basis: permissionDecision.authority_basis,
      evidence: permissionDecision.evidence,
      no_bus_event_created: true,
      no_payload_created: true,
      no_delivery_artifact_created: true,
    }, true);
  }

  const scriptPath: any = join(carriersDir, 'Send-OperatorSurfaceMessageBus.ps1');
  if (!existsSync(scriptPath)) {
    return jsonToolResult({
      status: 'missing_capability',
      capability: 'operator_surface_message_bus',
      expected: scriptPath,
      note: 'OSM carrier is absent; MCP did not fall back to an ad-hoc send path.',
    }, true);
  }

  const psArgs: any = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-UserSiteRoot',
    siteRoot,
    '-PcSiteRoot',
    pcSiteRoot,
    '-IdentityName',
    identityName,
    '-Text',
    text,
    '-MessagePosture',
    stringField(args, 'message_posture') ?? 'note',
    '-SubmitStrategy',
    stringField(args, 'submit_strategy') ?? 'known_surface_submit',
    '-AssertedBy',
    stringField(args, 'asserted_by') ?? 'operator_surface_mcp',
    '-MaxAttempts',
    String(numberField(args, 'max_attempts') ?? 2),
    '-BackoffMs',
    String(numberField(args, 'backoff_ms') ?? 750),
    '-ExpiresAfterMs',
    String(numberField(args, 'expires_after_ms') ?? 10000),
    '-PassThru',
  ];
  const hwnd: any = numberField(args, 'hwnd');
  if (hwnd && hwnd !== 0) psArgs.push('-Hwnd', String(hwnd));
  const fromIdentity: any = stringField(args, 'from_identity');
  if (fromIdentity) psArgs.push('-FromIdentity', fromIdentity);
  const dedupeKey: any = stringField(args, 'dedupe_key');
  if (dedupeKey) psArgs.push('-DedupeKey', dedupeKey);
  const authorityBasis: any = objectField(args, 'authority_basis') ?? null;
  if (typeof authorityBasis?.kind === 'string') psArgs.push('-AuthorityBasisKind', authorityBasis.kind);
  if (typeof authorityBasis?.summary === 'string') psArgs.push('-AuthorityBasisSummary', authorityBasis.summary);
  if (booleanField(args, 'explicit_operator_osm_request') === true) psArgs.push('-ExplicitOperatorOsmRequest');
  if (booleanField(args, 'no_dedupe') === true) psArgs.push('-NoDedupe');
  if (booleanField(args, 'dry_run') === true) psArgs.push('-DryRun');

  const result: any = await spawnPwshBounded(psArgs, { timeoutMs: Math.max(5000, Math.min(numberField(args, 'timeout_ms') ?? 30000, 120000)) });
  const parsed: any = safeJsonParse(result.stdout);
  if (result.status !== 'completed') {
    return jsonToolResult({
      status: 'failed',
      capability: 'operator_surface_message_bus',
      result: summarizeCapture(result),
      parsed,
    }, true);
  }
  return jsonToolResult({
    status: 'ok',
    capability: 'operator_surface_message_bus',
    osm_send_permission_policy: permissionDecision.evidence,
    delivery: parsed ?? result.stdout,
  });
}

function evaluateOsmSendPermission(args: any) : any{
  const policy: any = readOsmSendPermissionPolicy();
  const authorityBasis: any = objectField(args, 'authority_basis') ?? null;
  const explicitOperatorRequestFlag: any = booleanField(args, 'explicit_operator_osm_request') === true;
  const explicitAuthorityBasis: any = hasExplicitOsmAuthority(authorityBasis);
  const explicitOperatorRequest: any = explicitAuthorityBasis;
  const genericContinuationOnly: any = isGenericContinuationAuthority(authorityBasis);
  if (policy.mode === 'allowed') {
    return {
      allowed: true,
      reason: 'policy_allowed',
      policy,
      authority_basis: authorityBasis,
      evidence: {
        policy_mode: policy.mode,
        decision: 'allowed',
        authority_basis_kind: authorityBasis?.kind ?? null,
      },
    };
  }
  if (policy.mode === 'not_allowed') {
    return {
      allowed: false,
      reason: 'site_policy_not_allowed',
      policy,
      authority_basis: authorityBasis,
      evidence: {
        policy_mode: policy.mode,
        decision: 'refused',
        refusal_before_bus_artifacts: true,
      },
    };
  }
  if (policy.mode === 'on_operator_request_only') {
    if (!explicitOperatorRequest || genericContinuationOnly) {
      return {
        allowed: false,
        reason: genericContinuationOnly
          ? 'generic_continuation_does_not_authorize_osm_send'
          : 'explicit_operator_osm_request_required',
        policy,
        authority_basis: authorityBasis,
        evidence: {
          policy_mode: policy.mode,
          decision: 'refused',
          explicit_operator_osm_request: explicitOperatorRequest,
          explicit_operator_osm_request_flag: explicitOperatorRequestFlag,
          explicit_authority_basis: explicitAuthorityBasis,
          generic_continuation_only: genericContinuationOnly,
          refusal_before_bus_artifacts: true,
        },
      };
    }
    return {
      allowed: true,
      reason: 'explicit_operator_osm_request_present',
      policy,
      authority_basis: authorityBasis,
      evidence: {
        policy_mode: policy.mode,
        decision: 'allowed',
        authority_basis_kind: authorityBasis?.kind ?? null,
        explicit_operator_osm_request: true,
      },
    };
  }
  return {
    allowed: false,
    reason: `unknown_osm_send_permission_policy_mode:${policy.mode}`,
    policy,
    authority_basis: authorityBasis,
    evidence: {
      policy_mode: policy.mode,
      decision: 'refused',
      refusal_before_bus_artifacts: true,
    },
  };
}

function readOsmSendPermissionPolicy() : any{
  const defaultPolicy: any = {
    schema: 'narada.site.osm_send_permission_policy.v0',
    mode: 'allowed',
    source: 'default_missing_site_config',
    modes: ['allowed', 'not_allowed', 'on_operator_request_only'],
  };
  const configPath: any = join(siteRoot, 'config.json');
  if (!existsSync(configPath)) return defaultPolicy;
  const config: any = parseJson(readFileSync(configPath, 'utf8'), {});
  const policy: any = config?.runtime_config?.operator_surface_message_send_permission_policy?.current_value
    ?? config?.structural_config?.operator_surface_message_send_permission_policy
    ?? defaultPolicy;
  const mode: any = typeof policy?.mode === 'string' ? policy.mode : defaultPolicy.mode;
  return {
    schema: policy?.schema ?? defaultPolicy.schema,
    mode,
    source: policy === defaultPolicy ? defaultPolicy.source : 'config.json',
    modes: Array.isArray(policy?.modes) ? policy.modes : defaultPolicy.modes,
    explicit_request_required: policy?.explicit_request_required === true,
    generic_continuation_phrases_do_not_authorize: Array.isArray(policy?.generic_continuation_phrases_do_not_authorize)
      ? policy.generic_continuation_phrases_do_not_authorize
      : ['go on', 'next', 'continue', 'proceed', 'try now', 'retry'],
  };
}

function hasExplicitOsmAuthority(authorityBasis: any) : any{
  const kind: any = authorityBasis?.kind;
  const summary: any = typeof authorityBasis?.summary === 'string' ? authorityBasis.summary.toLowerCase() : '';
  if (kind !== 'operator_direct_instruction') return false;
  return /\b(osm|operator surface message|message bus|send message|send osm|handoff)\b/.test(summary);
}

function isGenericContinuationAuthority(authorityBasis: any) : any{
  const summary: any = typeof authorityBasis?.summary === 'string' ? authorityBasis.summary.trim().toLowerCase() : '';
  return ['go on', 'next', 'continue', 'proceed', 'try now', 'retry'].includes(summary);
}

async function operatorSurfaceMessageBusState(args: any) : Promise<any>{
  const scriptPath: any = join(carriersDir, 'Get-OperatorSurfaceMessageBusState.ps1');
  if (!existsSync(scriptPath)) {
    return jsonToolResult({
      status: 'missing_capability',
      capability: 'operator_surface_message_bus_state',
      expected: scriptPath,
    }, true);
  }
  const psArgs: any = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-PcSiteRoot',
    pcSiteRoot,
    '-Latest',
    String(numberField(args, 'latest') ?? 10),
    '-PassThru',
  ];
  const busEventId: any = stringField(args, 'bus_event_id');
  if (busEventId) psArgs.push('-BusEventId', busEventId);
  const dedupeKey: any = stringField(args, 'dedupe_key');
  if (dedupeKey) psArgs.push('-DedupeKey', dedupeKey);

  const result: any = await spawnPwshBounded(psArgs, { timeoutMs: Math.max(5000, Math.min(numberField(args, 'timeout_ms') ?? 30000, 120000)) });
  const parsed: any = safeJsonParse(result.stdout);
  if (result.status !== 'completed') {
    return jsonToolResult({ status: 'failed', capability: 'operator_surface_message_bus_state', result: summarizeCapture(result), parsed }, true);
  }
  return jsonToolResult(parsed ?? { status: 'ok', stdout: result.stdout });
}

/* ─── Workspace List ─── */
function operatorWorkspaceList() : any{
  migrateWorkspacesFromProjectionIfNeeded();
  const db: any = openOperatorSurfaceDb();
  const rows: any = db.prepare(`
    SELECT workspace_id, display_name, surface_state, intent, default_variant_id,
           monitor_count, payload_json, updated_at
    FROM operator_surface_workspaces
    WHERE revoked_at IS NULL
    ORDER BY workspace_id
  `).all();
  const memberRows: any = db.prepare(`
    SELECT identity_name, role_in_workspace, desired_posture, preferred_locus_json
    FROM operator_surface_workspace_members
    WHERE workspace_id = ?
    ORDER BY sort_order, identity_name
  `);
  const workspaces: any = rows.map((row: any) => {
    const members: any = memberRows.all(row.workspace_id).map((member: any) => ({
      identity_name: member.identity_name,
      role: member.role_in_workspace,
      role_in_workspace: member.role_in_workspace,
      desired_posture: member.desired_posture,
      preferred_locus: parseJson(member.preferred_locus_json, {}),
    }));
    return {
      workspace_id: row.workspace_id,
      state: row.surface_state,
      surface_state: row.surface_state,
      display_name: row.display_name,
      intent: row.intent,
      default_variant_id: row.default_variant_id,
      monitor_count: row.monitor_count,
      updated_at: row.updated_at,
      member_count: members.length,
      members,
      payload: parseJson(row.payload_json, {}),
    };
  });
  return jsonToolResult({
    status: 'ok',
    authority: 'sqlite',
    db_path: operatorSurfaceDbPath,
    compatibility_projection: operatorWorkspacesProjectionPath,
    count: workspaces.length,
    workspaces,
  });
}

function operatorSurfaceRegisterWorkspace(args: any) : any{
  const workspaceId: any = stringField(args, 'workspace_id');
  if (!workspaceId) throw new Error('workspace_id_required');
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const now: any = new Date().toISOString();
  const payload: any = objectField(args, 'workspace') ?? {
    workspace_id: workspaceId,
    surface_state: stringField(args, 'surface_state') ?? stringField(args, 'state') ?? 'running',
    display_name: stringField(args, 'display_name') ?? workspaceId,
    intent: stringField(args, 'intent') ?? null,
    members: arrayField(args, 'members', []),
    hidden_members: arrayField(args, 'hidden_members', []),
    default_variant_id: stringField(args, 'default_variant_id') ?? null,
    topology_variants: arrayField(args, 'topology_variants', []),
    monitor_count: numberField(args, 'monitor_count') ?? null,
    projection: objectField(args, 'projection') ?? null,
  };
  payload.workspace_id = workspaceId;
  payload.surface_state = payload.surface_state ?? payload.state ?? 'running';
  payload.display_name = payload.display_name ?? workspaceId;
  const record: any = workspaceRecordFromPayload(payload, now, stringField(args, 'admitted_by') ?? 'operator_surface_mcp');

  if (dryRun) {
    return jsonToolResult({ status: 'dry_run', authority: 'sqlite', would: 'register_operator_workspace', workspace: record });
  }

  const db: any = openOperatorSurfaceDb();
  writeWorkspaceToDb(db, record);
  const projection: any = operatorSurfaceProjectWorkspaceState({});
  return jsonToolResult({
    status: 'registered',
    authority: 'sqlite',
    db_path: operatorSurfaceDbPath,
    workspace: workspaceById(workspaceId),
    projection: JSON.parse(projection.content[0].text),
  });
}

/* ─── Workspace Switch ─── */
async function operatorWorkspaceSwitch(args: any) : Promise<any>{
  const workspaceId: any = stringField(args, 'workspace_id');
  const direction: any = stringField(args, 'direction');
  if (!workspaceId && !direction) throw new Error('workspace_id_or_direction_required');
  if (direction && !['next', 'previous'].includes(direction)) throw new Error('direction_must_be_next_or_previous');
  operatorSurfaceProjectWorkspaceState({});
  const psArgs: any = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(carriersDir, 'Switch-OperatorWorkspace.ps1'), '-Apply', '-MutatingAuthorized', 'mcp_agent', '-PassThru'];
  if (workspaceId) { psArgs.push('-WorkspaceId'); psArgs.push(workspaceId); }
  if (direction) { psArgs.push('-Direction'); psArgs.push(direction); }
  const stdout: any = await spawnPwsh(psArgs);
  return jsonToolResult({ status: 'ok', switch_event: safeJsonParse(stdout) ?? stdout });
}

/* ─── Binding Status ─── */
function operatorBindingStatus() : any{
  const db: any = openOperatorSurfaceRuntimeDb();
  const rows: any = db.prepare(`
    SELECT b.binding_id, b.surface_id, b.identity_id, b.identity_name,
           b.bound_at, b.bound_by, b.assertion_method, b.status,
           s.surface_kind, s.hwnd, s.pid, s.process_name, s.window_class,
           s.window_title, s.status AS surface_status, s.observed_at
    FROM operator_surface_bindings b
    LEFT JOIN operator_surface_instances s ON s.surface_id = b.surface_id
    WHERE b.status = 'active'
    ORDER BY b.bound_at DESC
  `).all();
  const bindings: any = rows.map((row: any) => ({
    binding_id: row.binding_id,
    surface_id: row.surface_id,
    identity_id: row.identity_id,
    identity_name: row.identity_name,
    bound_at: row.bound_at,
    bound_by: row.bound_by,
    assertion_method: row.assertion_method,
    status: row.status,
    surface: {
      surface_kind: row.surface_kind,
      hwnd: row.hwnd,
      pid: row.pid,
      process_name: row.process_name,
      window_class: row.window_class,
      window_title: row.window_title,
      status: row.surface_status,
      observed_at: row.observed_at,
    },
  }));
  return jsonToolResult({ status: 'ok', authority: 'sqlite', db_path: operatorSurfaceRuntimeDbPath, count: bindings.length, bindings });
}

async function operatorSurfaceObserveCurrent(args: any) : Promise<any>{
  const observedBy: any = stringField(args, 'observed_by') ?? 'operator_surface_mcp';
  const evidence: any = await getWindowEvidence();
  return operatorSurfaceRegister({
    surface_kind: 'windows_hwnd',
    surface_id: `hwnd:${evidence.hwnd}`,
    hwnd: evidence.hwnd,
    pid: evidence.pid,
    process_name: evidence.process_name,
    window_class: evidence.window_class,
    window_title: evidence.window_title,
    observed_by: observedBy,
    evidence,
    dry_run: booleanField(args, 'dry_run'),
  });
}

async function operatorSurfaceRegister(args: any) : Promise<any>{
  const surfaceKind: any = stringField(args, 'surface_kind') ?? 'windows_hwnd';
  const explicitSurfaceId: any = stringField(args, 'surface_id');
  const hwnd: any = numberField(args, 'hwnd');
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const observedBy: any = stringField(args, 'observed_by') ?? 'operator_surface_mcp';
  const now: any = new Date().toISOString();

  let evidence: any = objectField(args, 'evidence') ?? {};
  if (surfaceKind === 'windows_hwnd' && hwnd && (!evidence.pid || !evidence.window_class)) {
    evidence = await getWindowEvidence(hwnd);
  }
  const surfaceId: any = explicitSurfaceId ?? (hwnd ? `hwnd:${hwnd}` : undefined);
  if (!surfaceId) throw new Error('surface_id_or_hwnd_required');

  const record: any = {
    surface_id: surfaceId,
    surface_kind: surfaceKind,
    hwnd: hwnd ?? evidence.hwnd ?? null,
    pid: numberField(args, 'pid') ?? evidence.pid ?? null,
    process_name: stringField(args, 'process_name') ?? evidence.process_name ?? null,
    window_class: stringField(args, 'window_class') ?? evidence.window_class ?? null,
    window_title: stringField(args, 'window_title') ?? evidence.window_title ?? null,
    observed_at: now,
    observed_by: observedBy,
    evidence,
    status: stringField(args, 'status') ?? 'observed',
  };

  if (dryRun) {
    return jsonToolResult({ status: 'dry_run', authority: 'sqlite', would: 'register_operator_surface', surface: record });
  }

  const db: any = openOperatorSurfaceRuntimeDb();
  db.prepare(`
    INSERT INTO operator_surface_instances (
      surface_id, surface_kind, hwnd, pid, process_name, window_class,
      window_title, observed_at, observed_by, evidence_json, status
    ) VALUES (
      @surface_id, @surface_kind, @hwnd, @pid, @process_name, @window_class,
      @window_title, @observed_at, @observed_by, @evidence_json, @status
    )
    ON CONFLICT(surface_id) DO UPDATE SET
      surface_kind = excluded.surface_kind,
      hwnd = excluded.hwnd,
      pid = excluded.pid,
      process_name = excluded.process_name,
      window_class = excluded.window_class,
      window_title = excluded.window_title,
      observed_at = excluded.observed_at,
      observed_by = excluded.observed_by,
      evidence_json = excluded.evidence_json,
      status = excluded.status
  `).run({ ...record, evidence_json: JSON.stringify(evidence) });
  db.prepare(`
    INSERT INTO operator_surface_runtime_events
      (event_at, event_kind, surface_id, identity_id, payload_json, source)
    VALUES (?, 'surface_registered', ?, NULL, ?, 'operator_surface_mcp')
  `).run(now, surfaceId, JSON.stringify(record));

  return jsonToolResult({ status: 'registered', authority: 'sqlite', db_path: operatorSurfaceRuntimeDbPath, surface: record });
}

function operatorSurfaceList(args: any) : any{
  const db: any = openOperatorSurfaceRuntimeDb();
  const status: any = stringField(args, 'status');
  const clauses: any = [];
  const params: any = {};
  if (status) { clauses.push('status = @status'); params.status = status; }
  const where: any = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const surfaces: any = db.prepare(`
    SELECT surface_id, surface_kind, hwnd, pid, process_name, window_class,
           window_title, observed_at, observed_by, status, evidence_json
    FROM operator_surface_instances
    ${where}
    ORDER BY observed_at DESC
  `).all(params).map((row: any) => ({ ...row, evidence: parseJson(row.evidence_json, {}) }));
  return jsonToolResult({ status: 'ok', authority: 'sqlite', db_path: operatorSurfaceRuntimeDbPath, count: surfaces.length, surfaces });
}

async function operatorSurfaceBindAgent(args: any) : Promise<any>{
  const identityName: any = stringField(args, 'identity_name') ?? stringField(args, 'identity_id');
  if (!identityName) throw new Error('identity_name_required');
  const profile: any = getAgentProfile(identityName);
  if (!profile) throw new Error(`agent_profile_not_registered: ${identityName}`);
  if (profile.deprecated || profile.revoked_at) throw new Error(`agent_profile_not_active: ${identityName}`);

  const hwnd: any = numberField(args, 'hwnd');
  let surfaceId: any = stringField(args, 'surface_id') ?? (hwnd ? `hwnd:${hwnd}` : undefined);
  if (!surfaceId) throw new Error('surface_id_or_hwnd_required');

  const dryRun: any = booleanField(args, 'dry_run') === true;
  const boundBy: any = stringField(args, 'bound_by') ?? stringField(args, 'asserted_by') ?? 'operator_surface_mcp';
  const assertionMethod: any = stringField(args, 'assertion_method') ?? 'mcp_explicit_surface_agent_binding';
  const livenessPolicy: any = stringField(args, 'liveness_policy') ?? 'live_hwnd_required';
  const allowedGuardDrift: any = arrayField(args, 'allow_guard_drift', []);
  const now: any = new Date().toISOString();
  const runtimeDb: any = openOperatorSurfaceRuntimeDb();

  let surface: any = runtimeDb.prepare('SELECT * FROM operator_surface_instances WHERE surface_id = ?').get(surfaceId);
  if (!surface && hwnd) {
    const observed: any = await unwrapToolResult(await operatorSurfaceRegister({ surface_kind: 'windows_hwnd', hwnd, observed_by: boundBy }));
    surface = runtimeDb.prepare('SELECT * FROM operator_surface_instances WHERE surface_id = ?').get(observed.surface.surface_id);
    surfaceId = observed.surface.surface_id;
  }
  if (!surface) throw new Error(`operator_surface_not_registered: ${surfaceId}`);

  const liveness: any = surface.hwnd ? await validateWindowLiveness(surface) : { live: true, window_live: true, hard_failures: [], guard_drift: [] };
  if (!liveness.window_live && booleanField(args, 'allow_stale_surface') !== true) {
    throw new Error(`operator_surface_not_live: ${surfaceId}: ${liveness.hard_failures.join('+')}`);
  }
  const unallowedGuardDrift: any = (liveness.guard_drift ?? []).filter((reason: any) => !allowedGuardDrift.includes(reason));
  if (livenessPolicy === 'strict_guards' && unallowedGuardDrift.length > 0 && booleanField(args, 'allow_stale_surface') !== true) {
    throw new Error(`operator_surface_guard_drift: ${surfaceId}: ${unallowedGuardDrift.join('+')}`);
  }

  const binding: any = {
    binding_id: `bind_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
    surface_id: surfaceId,
    identity_id: profile.identity_id,
    identity_name: profile.identity_name,
    bound_at: now,
    bound_by: boundBy,
    assertion_method: assertionMethod,
    evidence: {
      profile_authority: operatorSurfaceDbPath,
      surface_authority: operatorSurfaceRuntimeDbPath,
      liveness_policy: livenessPolicy,
      allowed_guard_drift: allowedGuardDrift,
      liveness,
      surface: surfaceRow(surface),
    },
  };

  if (dryRun) {
    return jsonToolResult({ status: 'dry_run', authority: 'sqlite', would: 'bind_agent_to_operator_surface', binding });
  }

  runtimeDb.transaction(() => {
    runtimeDb.prepare(`
      UPDATE operator_surface_bindings
      SET status = 'replaced', unbound_at = ?, unbound_by = ?
      WHERE status = 'active' AND (surface_id = ? OR identity_id = ?)
    `).run(now, boundBy, surfaceId, profile.identity_id);
    runtimeDb.prepare(`
      INSERT INTO operator_surface_bindings (
        binding_id, surface_id, identity_id, identity_name, bound_at, bound_by,
        assertion_method, evidence_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(binding.binding_id, binding.surface_id, binding.identity_id, binding.identity_name, binding.bound_at, binding.bound_by, binding.assertion_method, JSON.stringify(binding.evidence));
    runtimeDb.prepare(`
      INSERT INTO operator_surface_runtime_events
        (event_at, event_kind, surface_id, identity_id, payload_json, source)
      VALUES (?, 'binding_created', ?, ?, ?, 'operator_surface_mcp')
    `).run(now, surfaceId, profile.identity_id, JSON.stringify(binding));
  })();

  await operatorSurfaceProjectOslBindings({ refresh_live_evidence: true });

  return jsonToolResult({ status: 'bound', authority: 'sqlite', db_path: operatorSurfaceRuntimeDbPath, binding });
}

function operatorSurfaceUnbindAgent(args: any) : any{
  const identityName: any = stringField(args, 'identity_name') ?? stringField(args, 'identity_id');
  const surfaceId: any = stringField(args, 'surface_id');
  if (!identityName && !surfaceId) throw new Error('identity_name_or_surface_id_required');
  const unboundBy: any = stringField(args, 'unbound_by') ?? 'operator_surface_mcp';
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const now: any = new Date().toISOString();
  const db: any = openOperatorSurfaceRuntimeDb();
  const clauses: any = ["status = 'active'"];
  const params: any = { now, unbound_by: unboundBy };
  if (identityName) { clauses.push('identity_id = @identity OR identity_name = @identity'); params.identity = identityName; }
  if (surfaceId) { clauses.push('surface_id = @surface_id'); params.surface_id = surfaceId; }
  const where: any = clauses.map((c: any) => `(${c})`).join(' AND ');
  const matches: any = db.prepare(`SELECT * FROM operator_surface_bindings WHERE ${where}`).all(params);
  if (dryRun) return jsonToolResult({ status: 'dry_run', authority: 'sqlite', would: 'unbind_agent_operator_surface', count: matches.length, bindings: matches });
  const result: any = db.prepare(`UPDATE operator_surface_bindings SET status = 'unbound', unbound_at = @now, unbound_by = @unbound_by WHERE ${where}`).run(params);
  db.prepare(`
    INSERT INTO operator_surface_runtime_events
      (event_at, event_kind, surface_id, identity_id, payload_json, source)
    VALUES (?, 'binding_unbound', ?, ?, ?, 'operator_surface_mcp')
  `).run(now, surfaceId ?? null, identityName ?? null, JSON.stringify({ identity_name: identityName, surface_id: surfaceId, count: result.changes }));
  operatorSurfaceProjectOslBindings({ refresh_live_evidence: true }).catch(() => {});
  return jsonToolResult({ status: 'unbound', authority: 'sqlite', db_path: operatorSurfaceRuntimeDbPath, count: result.changes });
}

async function operatorSurfacePruneStaleBindings(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const stalePolicy: any = stringField(args, 'stale_policy') ?? 'dead_hwnd_only';
  const diagnosis: any = await diagnoseOperatorSurfaceBindings();
  const stale: any = (diagnosis.bindings ?? []).filter((binding: any) => {
    if (stalePolicy === 'strict_guards') return binding.status === 'dead' || binding.status === 'guard_drift';
    if (stalePolicy === 'report_all_drift') return binding.status !== 'healthy';
    return binding.status === 'dead';
  });
  const mode: any = stalePolicy === 'strict_guards' ? 'guard_drift_included' : 'dead_hwnd_only';
  if (dryRun || stalePolicy === 'report_all_drift') {
    return jsonToolResult({
      status: 'dry_run',
      authority: 'sqlite',
      stale_policy: stalePolicy,
      mode,
      stale_count: stale.length,
      stale,
      diagnosis,
    });
  }
  const now: any = new Date().toISOString();
  const db: any = openOperatorSurfaceRuntimeDb();
  const update: any = db.prepare("UPDATE operator_surface_bindings SET status = 'stale', unbound_at = ?, unbound_by = 'operator_surface_prune_stale_bindings' WHERE binding_id = ?");
  for (const item of stale) update.run(now, item.binding_id);
  db.prepare(`
    INSERT INTO operator_surface_runtime_events
      (event_at, event_kind, surface_id, identity_id, payload_json, source)
    VALUES (?, 'stale_bindings_pruned', NULL, NULL, ?, 'operator_surface_mcp')
  `).run(now, JSON.stringify({ stale_policy: stalePolicy, mode, stale_count: stale.length, stale }));
  await operatorSurfaceProjectOslBindings({ refresh_live_evidence: true });
  return jsonToolResult({ status: 'pruned', authority: 'sqlite', db_path: operatorSurfaceRuntimeDbPath, stale_policy: stalePolicy, mode, stale_count: stale.length, stale });
}

async function diagnoseOperatorSurfaceBindings() : Promise<any>{
  const db: any = openOperatorSurfaceRuntimeDb();
  const rows: any = db.prepare(`
    SELECT b.binding_id, b.surface_id, b.identity_id, b.identity_name, b.bound_at, b.bound_by, b.assertion_method,
           s.hwnd, s.pid, s.process_name, s.window_class, s.window_title, s.observed_at, s.observed_by
    FROM operator_surface_bindings b
    LEFT JOIN operator_surface_instances s ON s.surface_id = b.surface_id
    WHERE b.status = 'active'
    ORDER BY b.bound_at ASC
  `).all();
  const livenessBySurfaceId: any = new Map();
  for (const row of rows) {
    let liveness: any = { live: false, window_live: false, hard_failures: ['surface_without_hwnd'], guard_drift: [], current: null };
    if (row.hwnd) {
      try {
        liveness = await validateWindowLiveness(row);
      } catch (error: any) {
        liveness = {
          live: false,
          window_live: false,
          hard_failures: ['liveness_probe_failed'],
          guard_drift: [],
          current: { error: error instanceof Error ? error.message : String(error) },
        };
      }
    }
    livenessBySurfaceId.set(row.surface_id, liveness);
  }
  return assembleBindingDiagnosis({
    rows,
    livenessBySurfaceId,
    dbPath: operatorSurfaceRuntimeDbPath,
  });
}

async function operatorSurfaceProjectOslBindings(args: any) : Promise<any>{
  const refreshLiveEvidence: any = booleanField(args, 'refresh_live_evidence') !== false;
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const db: any = openOperatorSurfaceRuntimeDb();
  const rows: any = db.prepare(`
    SELECT b.identity_name, b.bound_by, b.bound_at, b.assertion_method,
           s.surface_id, s.hwnd, s.pid, s.process_name, s.window_class, s.window_title
    FROM operator_surface_bindings b
    JOIN operator_surface_instances s ON s.surface_id = b.surface_id
    WHERE b.status = 'active' AND s.hwnd IS NOT NULL
    ORDER BY b.bound_at ASC
  `).all();

  const evidenceBySurfaceId: any = new Map();
  for (const row of rows) {
    let evidence: any = {
      hwnd: row.hwnd,
      pid: row.pid,
      process_name: row.process_name,
      window_class: row.window_class,
      window_title: row.window_title,
      live: null,
    };
    if (refreshLiveEvidence) {
      try {
        evidence = await getWindowEvidence(row.hwnd);
      } catch (error: any) {
        evidence.error = error instanceof Error ? error.message : String(error);
      }
    }
    evidenceBySurfaceId.set(row.surface_id, {
      hwnd: Number(row.hwnd),
      pid: evidence.pid ? Number(evidence.pid) : (row.pid ? Number(row.pid) : null),
      process_name: evidence.process_name ?? row.process_name ?? null,
      window_title: evidence.window_title ?? row.window_title ?? null,
      window_class: evidence.window_class ?? row.window_class ?? null,
    });
  }

  const preserved: any = [];
  const output: any = assembleRuntimeBindingProjection({
    rows,
    evidenceBySurfaceId,
    pcSiteRoot,
    siteRoot,
    operatorSurfaceRuntimeDbPath,
  });
  /*
  const legacyOutput = {
    schema: 'narada.operator_surfaces.runtime_window_bindings.v0',
    owner_pc_site_root: pcSiteRoot.replaceAll('/', '\\'),
    user_identity_registry: join(siteRoot, 'operator-surfaces', 'identities.json'),
    updated_at: new Date().toISOString(),
    projection_authority: 'sqlite',
    projection_source: operatorSurfaceRuntimeDbPath,
    projection_note: 'Compatibility projection for current OSL binary. SQLite remains authoritative; legacy non-SQLite bindings are not preserved.',
    bindings: projected,
  };
  */

  if (dryRun) {
    return jsonToolResult({
      status: 'dry_run',
      authority: 'sqlite',
      projection_target: runtimeBindingsPath,
      projected_count: output.bindings.length,
      preserved_count: preserved.length,
      output,
    });
  }

  mkdirSync(join(pcSiteRoot, 'runtime'), { recursive: true });
  writeJsonFile(runtimeBindingsPath, output);
  return jsonToolResult({
    status: 'projected',
    authority: 'sqlite',
    projection_target: runtimeBindingsPath,
    projected_count: output.bindings.length,
    preserved_count: preserved.length,
  });
}

function operatorSurfaceProjectIdentityRegistry(args: any) : any{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const db: any = openOperatorSurfaceDb();
  const identities: any = db.prepare(`
    SELECT * FROM operator_surface_identities
    WHERE revoked_at IS NULL
    ORDER BY site_id, role, agent_name
  `).all().map(identityProjectionRow);
  const sites: any = Object.fromEntries(db.prepare(`
    SELECT site_id, affinity_color FROM operator_surface_sites ORDER BY site_id
  `).all().map((row: any) => [row.site_id, { affinity_color: row.affinity_color }]));
  const roles: any = Object.fromEntries(db.prepare(`
    SELECT role, label, affinity_color FROM operator_surface_roles ORDER BY role
  `).all().map((row: any) => [row.role, { label: row.label, affinity_color: row.affinity_color }]));
  const output: any = {
    schema: 'narada.operator_surfaces.identities.v0',
    owner_site_id: 'andrey-user',
    description: 'Compatibility projection for operator-surface and CLI coding agent identities. SQLite is authoritative.',
    projection_authority: 'sqlite',
    projection_source: operatorSurfaceDbPath,
    projection_note: 'Do not edit this file as authority. Use operator_surface_register_agent_profile or an admitted SQLite migration.',
    identity_law: {
      role_metadata_is_naming_authority: false,
      windows_terminal_is_naming_authority: false,
      implicit_identity_inference_allowed: false,
    },
    identities,
    sites,
    roles,
    updated_at: new Date().toISOString(),
  };
  if (dryRun) {
    return jsonToolResult({ status: 'dry_run', authority: 'sqlite', projection_target: identitiesProjectionPath, count: identities.length, output });
  }
  writeJsonFile(identitiesProjectionPath, output);
  return jsonToolResult({ status: 'projected', authority: 'sqlite', projection_target: identitiesProjectionPath, count: identities.length });
}

function operatorSurfaceProjectWorkspaceState(args: any) : any{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  migrateWorkspacesFromProjectionIfNeeded();
  const db: any = openOperatorSurfaceDb();
  const rows: any = db.prepare(`
    SELECT payload_json, workspace_id, display_name, surface_state, intent,
           default_variant_id, monitor_count, updated_at
    FROM operator_surface_workspaces
    WHERE revoked_at IS NULL
    ORDER BY workspace_id
  `).all();
  const memberRows: any = db.prepare(`
    SELECT identity_name, role_in_workspace, desired_posture, preferred_locus_json
    FROM operator_surface_workspace_members
    WHERE workspace_id = ?
    ORDER BY sort_order, identity_name
  `);
  const workspaces: any = rows.map((row: any) => {
    const payload: any = parseJson(row.payload_json, {});
    const members: any = memberRows.all(row.workspace_id).map((member: any) => ({
      identity_name: member.identity_name,
      role_in_workspace: member.role_in_workspace,
      desired_posture: member.desired_posture,
      preferred_locus: parseJson(member.preferred_locus_json, {}),
    }));
    return {
      ...payload,
      workspace_id: row.workspace_id,
      surface_state: row.surface_state,
      display_name: row.display_name,
      intent: row.intent,
      members,
      default_variant_id: row.default_variant_id,
      monitor_count: row.monitor_count,
      updated_at: row.updated_at,
    };
  });
  const output: any = {
    schema: 'narada.operator_surfaces.operator_workspaces.v0',
    owner_site_id: 'andrey-user',
    description: 'Compatibility projection for operator workspace membership. SQLite is authoritative.',
    projection_authority: 'sqlite',
    projection_source: operatorSurfaceDbPath,
    projection_note: 'Do not edit this file as authority. Use operator_surface_register_workspace or an admitted SQLite migration.',
    workspaces,
    authority_limits: [
      'workspace_membership_is_user_site_sqlite_authority',
      'runtime_hwnd_bindings_are_pc_site_sqlite_authority',
      'komorebi_workspaces_are_tiling_projection_slots',
    ],
    updated_at: new Date().toISOString(),
  };
  if (dryRun) {
    return jsonToolResult({ status: 'dry_run', authority: 'sqlite', projection_target: operatorWorkspacesProjectionPath, count: workspaces.length, output });
  }
  writeJsonFile(operatorWorkspacesProjectionPath, output);
  return jsonToolResult({ status: 'projected', authority: 'sqlite', projection_target: operatorWorkspacesProjectionPath, count: workspaces.length });
}

async function operatorSurfaceProjectWindowLabels(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const identityProjection: any = await unwrapToolResult(operatorSurfaceProjectIdentityRegistry({ dry_run: dryRun }));
  if (dryRun) {
    return jsonToolResult({
      status: 'dry_run',
      authority: 'sqlite',
      projection_target: windowLabelsProjectionPath,
      prerequisites: { identity_projection: identityProjection },
    });
  }
  const scriptPath: any = join(carriersDir, 'Build-WindowLabelsFromIdentities.ps1');
  if (!existsSync(scriptPath)) throw new Error('window_label_projection_script_not_found');
  const stdout: any = await spawnPwsh([
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-UserSiteRoot',
    siteRoot,
    '-OutputPath',
    windowLabelsProjectionPath,
    '-RuntimeBindingPath',
    runtimeBindingsPath,
    '-TaskDbPath',
    taskLifecycleDbPath,
  ]);
  stampWindowLabelsProjection();
  return jsonToolResult({
    status: 'projected',
    authority: 'sqlite',
    projection_target: windowLabelsProjectionPath,
    identity_projection: identityProjection,
    build_output: stdout,
  });
}

async function operatorSurfaceProjectOslState(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const identity_registry: any = await unwrapToolResult(operatorSurfaceProjectIdentityRegistry({ dry_run: dryRun }));
  const window_labels: any = await unwrapToolResult(await operatorSurfaceProjectWindowLabels({ dry_run: dryRun }));
  const runtime_bindings: any = await unwrapToolResult(await operatorSurfaceProjectOslBindings({
    dry_run: dryRun,
    refresh_live_evidence: booleanField(args, 'refresh_live_evidence') !== false,
  }));
  return jsonToolResult({
    status: dryRun ? 'dry_run' : 'projected',
    authority: 'sqlite',
    projections: { identity_registry, window_labels, runtime_bindings },
  });
}

/* ─── Binding Repair ─── */
async function operatorBindingRepair(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run');
  const scriptPath: any = join(carriersDir, 'windows-glue', 'Repair-OperatorSurfaceWindows.ps1');
  if (!existsSync(scriptPath)) {
    return jsonToolResult({ status: 'missing_capability', capability: 'repair_bindings', expected: scriptPath, authority: 'sqlite', note: 'Legacy PowerShell carrier is absent; MCP did not fall back to an ad-hoc path.' });
  }
  const psArgs: any = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PassThru'];
  if (dryRun) psArgs.push('-DryRun');
  const stdout: any = await spawnPwsh(psArgs);
  return jsonToolResult({ status: 'ok', repair_event: safeJsonParse(stdout) ?? stdout });
}

/* ─── Surface Health ─── */
async function operatorSurfaceHealth() : Promise<any>{
  const bindingDiagnosis: any = await diagnoseOperatorSurfaceBindings();
  const projection: any = await unwrapToolResult(await operatorSurfaceProjectOslBindings({ dry_run: true, refresh_live_evidence: true }));
  const osl: any = await unwrapToolResult(operatorOslStatus());
  const missingCapabilities: any = [];
  const taxonomy: any = operatorSurfaceHealthTaxonomy({ bindingDiagnosis, projection, osl, missingCapabilities });
  return jsonToolResult({
    status: 'ok',
    schema: 'narada.operator_surfaces.health.v0',
    authority: 'sqlite',
    health: {
      taxonomy,
      binding_diagnosis: bindingDiagnosis,
      projection_check: {
        authority: 'projection_only',
        target: projection.projection_target,
        projected_count: projection.projected_count,
        preserved_count: projection.preserved_count,
        refresh_guidance: operatorSurfaceProjectionRefreshGuidance(bindingDiagnosis, projection),
        note: 'Runtime binding JSON is a compatibility projection; SQLite runtime DB remains authority.',
      },
      osl,
      missing_capabilities: missingCapabilities,
      recommendations: operatorSurfaceHealthRecommendations(bindingDiagnosis, osl, taxonomy),
    },
  });
}

function operatorSurfaceHealthTaxonomy({ bindingDiagnosis, projection, osl, missingCapabilities }: any) : any{
  const projectedCount: any = Number(projection?.projected_count ?? 0);
  const preservedCount: any = Number(projection?.preserved_count ?? 0);
  const volatileEvidenceDriftCount: any = Number(bindingDiagnosis?.volatile_evidence_drift ?? 0);
  const bindingStatus: any = (bindingDiagnosis.dead ?? 0) > 0
    ? 'dead'
    : (bindingDiagnosis.guard_drift ?? 0) > 0
      ? 'guard_drift'
      : (bindingDiagnosis.evidence_drift ?? 0) > 0
        ? 'evidence_drift'
        : 'healthy';
  const projectionStatus: any = preservedCount > 0 ? 'projection_preserved_stale_entries' : 'projection_refreshed_from_sqlite';
  const visibleLabelStatus: any = !osl?.running
    ? 'unavailable_osl_not_running'
    : projectedCount > 0
      ? 'labels_projected_from_sqlite'
      : 'osl_alive_no_visible_label_projection';
  const repairStatus: any = missingCapabilities.length > 0 ? 'missing_capability' : 'available';

  return {
    schema: 'narada.operator_surfaces.health_taxonomy.v0',
    canonical_model: 'Separate binding authority, projection freshness, OSL process liveness, visible-label confidence, and repair-capability availability. Healthy process liveness alone is not healthy operator-surface state.',
    authority_boundaries: {
      binding_authority: 'PC Site SQLite runtime DB',
      projection_authority: 'projection_only_compatibility_json',
      visible_label_authority: 'OSL runtime observation plus SQLite-backed projection',
      repair_authority: 'declared MCP/operator-surface repair capability',
    },
    dimensions: {
      binding_authority: {
        status: bindingStatus,
        source: 'operator_surface_runtime.db active bindings + HWND liveness probe',
        degraded_statuses: ['evidence_drift', 'guard_drift', 'dead'],
        volatile_evidence_drift_count: volatileEvidenceDriftCount,
        volatile_evidence_note: 'Windows Terminal PID/title churn on a live CASCADIA_HOSTING_WINDOW_CLASS HWND is volatile evidence, not binding-authority liveness failure.',
      },
      projection_freshness: {
        status: projectionStatus,
        projected_count: projectedCount,
        preserved_count: preservedCount,
        source: 'operator_surface_project_osl_bindings dry-run projection',
      },
      osl_process_liveness: {
        status: osl?.running ? 'running' : 'not_running',
        pid: osl?.pid ?? null,
        note: osl?.note ?? null,
        source: 'OSL PID file and process probe',
      },
      visible_label_confidence: {
        status: visibleLabelStatus,
        source: 'OSL liveness combined with SQLite-backed projected label count',
        degraded_when: 'OSL is running but no SQLite-backed labels are projected, or OSL is not running.',
      },
      repair_capability_availability: {
        status: repairStatus,
        missing_capabilities: missingCapabilities,
        source: 'operator-surface MCP repair tools and declared missing-capability list',
      },
    },
  };
}

function operatorSurfaceProjectionRefreshGuidance(bindingDiagnosis: any, projection: any) : any{
  const preservedCount: any = Number(projection?.preserved_count ?? 0);
  if ((bindingDiagnosis.dead ?? 0) > 0 || (bindingDiagnosis.guard_drift ?? 0) > 0) {
    return {
      status: 'binding_review_required_before_projection_refresh',
      action: 'review_or_rebind_authoritative_sqlite_binding',
      note: 'Dead or guard-drift bindings are authority problems; do not treat projection refresh as a rebind substitute.',
    };
  }
  if (preservedCount > 0 || (bindingDiagnosis.evidence_drift ?? 0) > 0 || (bindingDiagnosis.volatile_evidence_drift ?? 0) > 0) {
    return {
      status: 'refresh_projection_or_live_evidence_only',
      action: 'operator_surface_project_osl_bindings_or_reobserve_surface',
      note: 'Bindings remain live; refresh projection/evidence rather than rebinding.',
    };
  }
  return {
    status: 'projection_current_for_live_bindings',
    action: 'none',
    note: 'SQLite-backed bindings and projection dry-run do not indicate rebind work.',
  };
}

function operatorSurfaceHealthRecommendations(bindingDiagnosis: any, osl: any, taxonomy: any) : any{
  const recommendations: any = [];
  if ((bindingDiagnosis.dead ?? 0) > 0) recommendations.push('Run operator_surface_prune_stale_bindings, then bind replacement live carriers with operator_surface_bind_agent when reliable HWND evidence exists.');
  if ((bindingDiagnosis.guard_drift ?? 0) > 0) recommendations.push('Review guard_drift bindings before rebinding or unbinding; do not trust projection JSON as authority.');
  if ((bindingDiagnosis.evidence_drift ?? 0) > 0) recommendations.push('Refresh live evidence through operator_surface_observe_current or operator_surface_project_osl_bindings; do not prune live bindings by default.');
  if (!osl?.running) recommendations.push('Start OSL through operator_surface_start_osl after projecting SQLite-backed state.');
  if (taxonomy?.dimensions?.visible_label_confidence?.status === 'osl_alive_no_visible_label_projection') recommendations.push('OSL process is alive but no SQLite-backed labels are projected; refresh projection before treating visible labels as healthy.');
  if (taxonomy?.dimensions?.repair_capability_availability?.status === 'missing_capability') recommendations.push('Report missing operator-surface repair capability instead of returning healthy status.');
  return recommendations;
}

/* ─── YASB Status ─── */
async function operatorYasbStatus() : Promise<any>{
  const scriptPath: any = join(yasbToolsDir, 'Inspect-YasbRuntime.ps1');
  if (!existsSync(scriptPath)) {
    return jsonToolResult({ status: 'ok', note: 'inspect_script_not_found_at_expected_path', expected: scriptPath });
  }
  const psArgs: any = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PassThru'];
  const stdout: any = await spawnPwsh(psArgs);
  return jsonToolResult({ status: 'ok', yasb: safeJsonParse(stdout) ?? stdout });
}

async function operatorYasbDebug(args: any) : Promise<any>{
  const includePipeProbe: any = booleanField(args, 'include_pipe_probe') !== false;
  const status: any = await unwrapToolResult(await operatorYasbStatus());
  const pipe: any = includePipeProbe ? await probeNamedPipe(yasbPipe, 500) : null;
  return jsonToolResult({
    status: 'ok',
    schema: 'narada.operator_surface.yasb_debug.v0',
    authority: 'runtime_observation',
    mutation: 'none',
    pc_site_root: pcSiteRoot,
    checks: {
      status_tool: status,
      named_pipe: pipe,
    },
    health: yasbDebugHealth(status, pipe),
    interpretation: interpretYasbDebug(status, pipe),
  });
}

async function operatorYasbRecover(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const timeoutMs: any = Math.max(5000, Math.min(numberField(args, 'timeout_ms') ?? 60000, 120000));
  const pre: any = await unwrapToolResult(await operatorYasbDebug({ include_pipe_probe: true }));
  const preState: any = summarizeYasbRuntime(pre);
  const stages: any = [
    {
      stage: 'inspect',
      status: pre?.status ?? 'unknown',
      runtime_state: preState.state,
      health_verdict: pre?.health?.verdict ?? null,
      pipe_accessible: preState.pipe_accessible,
      process_count: preState.process_count,
    },
  ];

  const base: any = {
    schema: 'narada.operator_surface.yasb_recovery.v0',
    authority: 'operator_surface_mcp',
    mutation: dryRun ? 'none' : 'yasb_reload_or_pc_site_and_runtime_yasb_projection',
    timeout_ms: timeoutMs,
    compact: true,
    precheck: compactYasbDebug(pre),
  };

  if (dryRun) {
    const planned_action: any = preState.pipe_accessible && preState.process_alive
      ? 'reload_via_pipe_then_postcheck'
      : 'materialize_projection_restart_then_postcheck';
    return jsonToolResult({
      status: 'dry_run',
      operation_status: 'dry_run',
      ...base,
      planned_action,
      stages,
      evidence_refs: ['precheck'],
      next_step: planned_action,
    });
  }

  if (preState.pipe_accessible && preState.process_alive) {
    let reload: any = null;
    try {
      reload = await unwrapToolResult(await operatorYasbReload());
      stages.push({ stage: 'reload', status: 'completed', action: reload?.action ?? 'reload_sent' });
    } catch (error: any) {
      reload = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
      stages.push({ stage: 'reload', status: 'failed', error: reload.error });
    }

    const post: any = await unwrapToolResult(await operatorYasbDebug({ include_pipe_probe: true })).catch((error: any) => ({
      status: 'diagnostic_failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    const postState: any = summarizeYasbRuntime(post);
    stages.push({
      stage: 'postcheck',
      status: post?.status ?? 'unknown',
      runtime_state: postState.state,
      health_verdict: post?.health?.verdict ?? null,
      pipe_accessible: postState.pipe_accessible,
      process_count: postState.process_count,
    });

    const outcome: any = post?.health?.verdict === 'healthy'
      ? 'hidden_alive_reloaded_postcheck_healthy'
      : 'hidden_alive_reload_postcheck_degraded';
    return jsonToolResult({
      status: outcome,
      operation_status: outcome,
      ...base,
      action_taken: 'reload_via_pipe',
      stages,
      evidence_refs: ['precheck', 'reload_result', 'postcheck'],
      reload_result: reload,
      postcheck: compactYasbDebug(post),
    });
  }

  stages.push({
    stage: 'escalate',
    status: 'selected',
    reason: preState.process_alive ? 'yasb_pipe_missing' : 'yasb_process_not_running',
    action: 'materialize_projection_restart',
  });
  const materialize: any = await unwrapToolResult(await operatorYasbMaterializeProjection({
    restart_yasb: true,
    timeout_ms: timeoutMs,
    verbose: true,
  }));
  const post: any = materialize?.post_operation_yasb_debug ?? null;
  const postState: any = summarizeYasbRuntime(post);
  stages.push({
    stage: 'materialize_restart',
    status: materialize?.status ?? 'unknown',
    command_status: materialize?.command_status ?? null,
    command_timed_out: materialize?.command_timed_out ?? null,
  });
  stages.push({
    stage: 'postcheck',
    status: post?.status ?? 'unknown',
    runtime_state: postState.state,
    health_verdict: materialize?.post_operation_health_verdict ?? post?.health?.verdict ?? null,
    pipe_accessible: postState.pipe_accessible,
    process_count: postState.process_count,
  });

  const recovered: any = (materialize?.post_operation_health_verdict ?? post?.health?.verdict) === 'healthy';
  const outcome: any = recovered
    ? 'dead_or_missing_pipe_restart_postcheck_healthy'
    : 'dead_or_missing_pipe_restart_postcheck_degraded';
  return jsonToolResult({
    status: outcome,
    operation_status: outcome,
    ...base,
    action_taken: 'materialize_projection_restart',
    stages,
    evidence_refs: ['precheck', 'materialize_restart', 'postcheck'],
    materialize_restart: compactYasbMaterialization(materialize),
    postcheck: compactYasbDebug(post),
  });
}

function interpretYasbDebug(status: any, pipe: any) : any{
  const notes: any = [];
  if (status?.note === 'inspect_script_not_found_at_expected_path') {
    notes.push('YASB inspection script is missing from the expected template path; debug output is limited to pipe probing.');
  }
  if (pipe && !pipe.accessible) notes.push('YASB named pipe is not reachable from this session.');
  if (pipe?.accessible) notes.push('YASB named pipe accepted a connection; this is stronger runtime evidence than source-root process matching.');
  const displayStatus: any = status?.yasb?.display_congruence?.status;
  if (displayStatus === 'stale_display_attachment') notes.push('YASB process and pipe evidence can be green while monitor instances are attached to stale display identities.');
  if (displayStatus === 'current_display_attached') notes.push('YASB monitor instances match the current display identities reported by the runtime inspection.');
  return notes;
}

function summarizeYasbRuntime(debug: any) : any{
  const yasb: any = debug?.checks?.status_tool?.yasb ?? debug?.yasb ?? null;
  const processCount: any = Number(yasb?.process_count ?? 0);
  const pipeAccessible: any = debug?.checks?.named_pipe?.accessible === true;
  const displayStatus: any = yasb?.display_congruence?.status ?? 'unknown_current_display';
  let state: any = 'unknown';
  if (processCount === 0) state = 'dead_runtime';
  else if (!pipeAccessible) state = 'missing_pipe';
  else if (displayStatus !== 'current_display_attached') state = 'stale_or_partial_display_attachment';
  else state = 'hidden_or_alive_runtime';
  return {
    state,
    process_alive: processCount > 0,
    process_count: processCount,
    pipe_accessible: pipeAccessible,
    display_status: displayStatus,
    health_verdict: debug?.health?.verdict ?? null,
  };
}

function compactYasbDebug(debug: any) : any{
  if (!debug) return null;
  const summary: any = summarizeYasbRuntime(debug);
  const display: any = debug?.checks?.status_tool?.yasb?.display_congruence ?? debug?.yasb?.display_congruence ?? null;
  return {
    status: debug.status ?? 'unknown',
    health_verdict: debug?.health?.verdict ?? null,
    runtime_state: summary.state,
    process_count: summary.process_count,
    pipe_accessible: summary.pipe_accessible,
    display_status: summary.display_status,
    reasons: debug?.health?.reasons ?? [],
    active_display_identity: display?.active_display_identity ?? [],
    yasb_instance_display_identity: display?.yasb_instance_display_identity ?? [],
    detail_available_in: 'full_debug_payload',
  };
}

function compactYasbMaterialization(materialize: any) : any{
  if (!materialize) return null;
  return {
    status: materialize.status ?? 'unknown',
    operation_status: materialize.operation_status ?? materialize.status ?? 'unknown',
    command_status: materialize.command_status ?? null,
    command_timed_out: materialize.command_timed_out ?? null,
    post_operation_health_verdict: materialize.post_operation_health_verdict ?? null,
    status_interpretation: materialize.status_interpretation ?? null,
    detail_available_in: 'materialize_projection_result',
  };
}

function yasbDebugHealth(status: any, pipe: any) : any{
  const display: any = status?.yasb?.display_congruence ?? null;
  const processModel: any = status?.yasb?.process_model ?? null;
  const processAlive: any = Number(status?.yasb?.process_count ?? 0) > 0;
  const pipeReachable: any = pipe?.accessible === true;
  const displayStatus: any = display?.status ?? 'unknown_current_display';
  const cardinality: any = yasbProcessCardinalityPolicy(status?.yasb);
  const reasons: any = [];
  if (!processAlive) reasons.push('yasb_process_not_running');
  if (!pipeReachable) reasons.push('yasb_pipe_not_reachable');
  if (displayStatus !== 'current_display_attached') reasons.push(displayStatus);
  if (cardinality.status !== 'expected') reasons.push(cardinality.status);
  let verdict: any = 'degraded';
  if (processAlive && pipeReachable && displayStatus === 'current_display_attached') {
    verdict = cardinality.status === 'expected' ? 'healthy' : 'healthy_with_residual';
  }
  return {
    schema: 'narada.operator_surface.yasb_display_congruence_health.v0',
    verdict,
    dimensions: {
      spawned_process: processAlive ? 'healthy' : 'missing',
      pipe_reachability: pipeReachable ? 'healthy' : (pipe ? 'degraded' : 'unknown'),
      current_display_attachment: displayStatus,
      process_cardinality: cardinality.status,
      operator_visible_delivery: verdict === 'healthy' || verdict === 'healthy_with_residual' ? 'healthy' : 'degraded',
    },
    reasons,
    evidence: {
      process_cardinality_policy: cardinality,
      process_model: processModel,
      active_display_identity: display?.active_display_identity ?? [],
      yasb_instance_display_identity: display?.yasb_instance_display_identity ?? [],
      stale_yasb_instances: display?.stale_yasb_instances ?? [],
      missing_yasb_instances: display?.missing_yasb_instances ?? [],
      display_evidence_source: display?.evidence_source ?? null,
      authority: display?.authority ?? 'pc_locus_runtime_observation',
    },
  };
}

function yasbProcessCardinalityPolicy(yasb: any) : any{
  const processCount: any = Number(yasb?.process_count ?? 0);
  const instanceCount: any = Number(yasb?.instance_count ?? 0);
  const model: any = yasb?.process_model ?? {};
  const wrappers: any = Number(model?.wrappers ?? 0);
  const mains: any = Number(model?.mains ?? 0);
  const launchModel: any = model?.launch_model ?? 'unknown';
  const expectedPerInstance: any = launchModel === 'direct_main' ? 1 : 2;
  const expectedProcessCount: any = instanceCount > 0 ? instanceCount * expectedPerInstance : 0;
  const duplicateWrappers: any = Math.max(0, wrappers - instanceCount);
  const duplicateMains: any = launchModel === 'direct_main' ? 0 : Math.max(0, mains - instanceCount);
  let status: any = 'expected';
  if (processCount === 0) status = 'not_running';
  else if (instanceCount === 0) status = 'missing_instance_manifest';
  else if (launchModel === 'unknown') status = 'unknown_launch_model';
  else if (processCount !== expectedProcessCount || duplicateWrappers > 0 || duplicateMains > 0) status = 'unexpected_process_cardinality';
  return {
    schema: 'narada.yasb.process_cardinality_policy.v0',
    status,
    launch_model: launchModel,
    instance_count: instanceCount,
    process_count: processCount,
    wrappers,
    mains,
    expected_process_count: expectedProcessCount,
    expected_wrappers: launchModel === 'direct_main' ? 0 : instanceCount,
    expected_mains: instanceCount,
    duplicate_wrappers: duplicateWrappers,
    duplicate_mains: duplicateMains,
    rule: 'direct_main expects one main per monitor instance; supervised_wrapper expects one wrapper and one main per monitor instance. Extra wrappers/mains or mismatched total process count are residual evidence, not silently healthy.',
  };
}

/* ─── YASB Reload ─── */
async function operatorYasbReload(args: any = {}) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const pre: any = await unwrapToolResult(await operatorYasbDebug({ include_pipe_probe: true })).catch((error: any) => ({
    status: 'diagnostic_failed',
    error: error instanceof Error ? error.message : String(error),
  }));
  if (dryRun) {
    return jsonToolResult({
      status: 'dry_run',
      schema: 'narada.operator_surface.yasb_reload.v0',
      authority: 'operator_surface_mcp',
      mutation: 'none',
      planned_action: 'yasb_reload_via_named_pipe',
      precheck: compactYasbDebug(pre),
    });
  }
  const response: any = await sendYasbPipeCommand('reload');
  const post: any = await unwrapToolResult(await operatorYasbDebug({ include_pipe_probe: true })).catch((error: any) => ({
    status: 'diagnostic_failed',
    error: error instanceof Error ? error.message : String(error),
  }));
  return jsonToolResult({
    status: response.ok ? 'ok' : 'failed',
    schema: 'narada.operator_surface.yasb_reload.v0',
    authority: 'operator_surface_mcp',
    mutation: 'yasb_reload_via_named_pipe',
    pipe_response: response,
    action: response.ok ? 'reload_sent' : 'reload_not_sent',
    precheck: compactYasbDebug(pre),
    postcheck: compactYasbDebug(post),
  });
}

async function operatorYasbStop(args: any = {}) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const pre: any = await unwrapToolResult(await operatorYasbDebug({ include_pipe_probe: true })).catch((error: any) => ({
    status: 'diagnostic_failed',
    error: error instanceof Error ? error.message : String(error),
  }));
  if (dryRun) {
    return jsonToolResult({
      status: 'dry_run',
      schema: 'narada.operator_surface.yasb_stop.v0',
      authority: 'operator_surface_mcp',
      mutation: 'none',
      planned_action: 'yasb_stop_via_named_pipe_then_postcheck',
      precheck: compactYasbDebug(pre),
    });
  }
  const response: any = await sendYasbPipeCommand('stop', { attempts: 5, retryDelayMs: 250 });
  const post: any = await unwrapToolResult(await operatorYasbDebug({ include_pipe_probe: true })).catch((error: any) => ({
    status: 'diagnostic_failed',
    error: error instanceof Error ? error.message : String(error),
  }));
  const postState: any = summarizeYasbRuntime(post);
  let supervisorStop: any = null;
  let finalPost: any = post;
  let finalState: any = postState;
  if (response.ok && postState.process_alive) {
    supervisorStop = await stopYasbSupervisorProcesses();
    finalPost = await unwrapToolResult(await operatorYasbDebug({ include_pipe_probe: true })).catch((error: any) => ({
      status: 'diagnostic_failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    finalState = summarizeYasbRuntime(finalPost);
  }
  const operationStatus: any = !response.ok
    ? 'pipe_stop_failed'
    : finalState.process_alive
      ? 'stop_sent_supervisor_stop_running_or_unknown'
      : 'stop_sent_postcheck_stopped';
  return jsonToolResult({
    status: operationStatus,
    authority: 'operator_surface_mcp',
    schema: 'narada.operator_surface.yasb_stop.v0',
    mutation: supervisorStop ? 'yasb_stop_via_named_pipe_then_governed_supervisor_stop' : 'yasb_stop_via_named_pipe',
    pipe_response: response,
    action: response.ok ? 'stop_sent' : 'stop_not_sent',
    precheck: compactYasbDebug(pre),
    postcheck: compactYasbDebug(post),
    postcheck_state: postState,
    supervisor_stop: supervisorStop,
    final_postcheck: compactYasbDebug(finalPost),
    final_state: finalState,
  });
}

async function stopYasbSupervisorProcesses() : Promise<any>{
  const pcRestartScript: any = join(pcSiteRoot, 'tools', 'yasb', 'Restart-Yasb.ps1');
  const templateRestartScript: any = join(siteRoot, 'templates', 'pc-sites', 'windows-komorebi-yasb', 'tools', 'yasb', 'Restart-Yasb.ps1');
  const scriptPath: any = existsSync(pcRestartScript) ? pcRestartScript : templateRestartScript;
  if (!existsSync(scriptPath)) {
    return {
      status: 'missing_capability',
      capability: 'yasb_supervisor_stop_only',
      expected: [pcRestartScript, templateRestartScript],
    };
  }
  const result: any = await spawnPwshBounded([
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-SourceRoot',
    join(siteRoot, 'vendor', 'yasb'),
    '-StopOnly',
  ], { timeoutMs: 15000 });
  return {
    status: result.exit_code === 0 ? 'ok' : result.status,
    authority: 'operator_surface_mcp',
    mutation: 'yasb_supervisor_stop_only',
    script_path: scriptPath,
    command_result: summarizeCapture(result),
  };
}

async function sendYasbPipeCommand(command: any, options: any = {}) : Promise<any>{
  const attempts: any = Math.max(1, Math.min(numberField(options, 'attempts') ?? 1, 10));
  const retryDelayMs: any = Math.max(50, Math.min(numberField(options, 'retryDelayMs') ?? 250, 2000));
  const retryableCodes: any = new Set(['ENOENT', 'ECONNREFUSED', 'EPIPE']);
  const failures: any = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result: any = await sendYasbPipeCommandOnce(command, attempt);
    if (result.ok || attempt >= attempts || !retryableCodes.has(result.code)) {
      if (failures.length > 0) result.previous_failures = failures;
      result.attempt = attempt;
      result.attempts = attempts;
      return result;
    }
    failures.push(result);
    await sleep(retryDelayMs);
  }
  return { ok: false, status: 'error', command, pipe: yasbPipe, error: 'yasb_pipe_retry_exhausted', code: null, response: '', previous_failures: failures, attempts };
}

async function sendYasbPipeCommandOnce(command: any, attempt: any) : Promise<any>{
  return await new Promise((resolve: any) => {
    let data: any = '';
    let settled: any = false;
    const finish: any = (payload: any) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    const client: any = net.connect(yasbPipe, () => {
      client.write(`${command}\n`, (error: any) => {
        if (error) {
          finish({ ok: false, status: 'error', command, pipe: yasbPipe, error: error.message, code: error.code ?? null, response: data.trim(), attempt });
          return;
        }
        client.end();
      });
    });
    client.setTimeout(3000);
    client.on('data', (chunk: any) => { data += chunk.toString(); });
    client.on('timeout', () => {
      client.destroy();
      finish({ ok: false, status: 'timeout', command, pipe: yasbPipe, error: 'yasb_pipe_timeout', code: 'ETIMEOUT', response: data.trim(), attempt });
    });
    client.on('error', (error: any) => {
      finish({ ok: false, status: 'error', command, pipe: yasbPipe, error: error.message, code: error.code ?? null, response: data.trim(), attempt });
    });
    client.on('close', () => finish({ ok: true, status: 'sent', command, pipe: yasbPipe, response: data.trim(), attempt }));
  });
}

function sleep(ms: any) : any{
  return new Promise((resolve: any) => setTimeout(resolve, ms));
}

async function operatorYasbMaterializeProjection(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const restartYasb: any = booleanField(args, 'restart_yasb') === true;
  const verbose: any = booleanField(args, 'verbose') === true;
  const timeoutMs: any = Math.max(5000, Math.min(numberField(args, 'timeout_ms') ?? 45000, 120000));
  const pcYasbToolsDir: any = join(pcSiteRoot, 'tools', 'yasb');
  const applyScriptPath: any = join(pcYasbToolsDir, 'Apply-YasbProjection.ps1');
  const runtimeRoot: any = join(process.env.USERPROFILE ?? '', '.config', 'yasb');
  const templateFileCount: any = countFiles(yasbToolsDir);

  if (!existsSync(yasbToolsDir)) {
    return jsonToolResult({
      status: 'missing_capability',
      capability: 'yasb_template_projection',
      expected: yasbToolsDir,
      note: 'YASB template source is absent; MCP did not fall back to a manual copy path.',
    }, true);
  }

  const evidence: any = {
    schema: 'narada.operator_surface.yasb_projection_materialization.v0',
    authority: 'operator_surface_mcp',
    mutation: dryRun ? 'none' : 'pc_site_and_runtime_yasb_projection',
    user_site: {
      root: siteRoot,
      template_source: yasbToolsDir,
      role: 'portable_template_input',
      file_count: templateFileCount,
    },
    pc_site: {
      root: pcSiteRoot,
      target: pcYasbToolsDir,
      role: 'machine_local_configuration_authority',
    },
    runtime_projection: {
      target: runtimeRoot,
      role: 'generated_yasb_runtime_config',
    },
    actions: {
      copy_template_to_pc_site: true,
      apply_runtime_projection: true,
      restart_yasb: restartYasb,
      drift_check: true,
    },
  };

  if (dryRun) {
    return jsonToolResult({
      status: 'dry_run',
      ...evidence,
      would_invoke: {
        script_path: applyScriptPath,
        arguments: restartYasb ? [] : ['-NoRestart'],
        timeout_ms: timeoutMs,
      },
    });
  }

  mkdirSync(pcYasbToolsDir, { recursive: true });
  cpSync(yasbToolsDir, pcYasbToolsDir, { recursive: true, force: true });
  if (!existsSync(applyScriptPath)) throw new Error(`yasb_apply_script_not_materialized: ${applyScriptPath}`);

  const psArgs: any = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', applyScriptPath];
  if (!restartYasb) psArgs.push('-NoRestart');
  const applyRun: any = await spawnPwshBounded(psArgs, { timeoutMs });
  const stdout: any = applyRun.stdout;
  const applyOutput: any = safeJsonParse(stdout) ?? stdout;
  const parsedDriftOutput: any = typeof stdout === 'string' ? extractLastJsonObject(stdout) : null;
  const driftEvidence: any = parsedDriftOutput ?? (Array.isArray(applyOutput)
    ? applyOutput.find((entry: any) => entry && typeof entry === 'object' && Object.hasOwn(entry, 'DriftDetected'))
    : (applyOutput && typeof applyOutput === 'object' && Object.hasOwn(applyOutput, 'DriftDetected') ? applyOutput : null));
  const postStatus: any = await unwrapToolResult(await operatorYasbDebug({ include_pipe_probe: true })).catch((error: any) => ({
    status: 'diagnostic_failed',
    error: error instanceof Error ? error.message : String(error),
  }));
  const postHealthVerdict: any = postStatus?.health?.verdict ?? null;
  const materializationStatus: any = yasbMaterializationStatus(applyRun, postHealthVerdict);

  return jsonToolResult({
    status: materializationStatus,
    operation_status: materializationStatus,
    compact: !verbose,
    ...evidence,
    timeout_ms: timeoutMs,
    command_status: applyRun.status,
    command_timed_out: applyRun.timed_out,
    post_operation_health_verdict: postHealthVerdict,
    status_interpretation: yasbMaterializationStatusInterpretation(materializationStatus),
    pc_site_file_count: countFiles(pcYasbToolsDir),
    primary_verdict: {
      status: materializationStatus,
      command_status: applyRun.status,
      command_timed_out: applyRun.timed_out,
      post_operation_health_verdict: postHealthVerdict,
      healthy_after_timeout: materializationStatus === 'timed_out_postcheck_healthy',
    },
    apply_run: verbose ? {
      status: applyRun.status,
      exit_code: applyRun.exit_code,
      timed_out: applyRun.timed_out,
      stdout_tail: tailText(applyRun.stdout),
      stderr_tail: tailText(applyRun.stderr),
      error: applyRun.error ?? null,
    } : {
      status: applyRun.status,
      exit_code: applyRun.exit_code,
      timed_out: applyRun.timed_out,
      detail_available_with: 'verbose=true',
    },
    apply_output: verbose ? applyOutput : undefined,
    drift_check: driftEvidence ?? {
      status: 'captured_in_apply_output',
      note: 'Apply-YasbProjection completed successfully; drift command exits non-zero on detected drift.',
    },
    post_operation_yasb_debug: verbose ? postStatus : undefined,
    post_operation_yasb_summary: compactYasbDebug(postStatus),
  });
}

function yasbMaterializationStatus(applyRun: any, postHealthVerdict: any) : any{
  if (applyRun.status === 'completed') return 'completed';
  if (applyRun.status === 'failed') return 'failed';
  if (applyRun.status === 'timed_out' && postHealthVerdict === 'healthy') return 'timed_out_postcheck_healthy';
  if (applyRun.status === 'timed_out') return 'timed_out_postcheck_degraded_or_unknown';
  return 'failed';
}

function yasbMaterializationStatusInterpretation(status: any) : any{
  if (status === 'timed_out_postcheck_healthy') {
    return 'Apply/restart command exceeded the MCP timeout, but the post-operation YASB health check is healthy; treat this as healthy-after-timeout evidence, not repair failure.';
  }
  if (status === 'timed_out_postcheck_degraded_or_unknown') {
    return 'Apply/restart command exceeded the MCP timeout and post-operation health did not prove recovery; treat this as unresolved timeout, not success.';
  }
  if (status === 'completed') return 'Apply/restart command completed within the MCP timeout.';
  if (status === 'failed') return 'Apply/restart command failed before a healthy post-operation state was proven.';
  return 'Unknown materialization status.';
}

function operatorKomorebiMaterializeTools(args: any) : any{
  return materializePcSiteToolTree(args, {
    toolName: 'komorebi',
    templateDir: komorebiToolsDir,
    targetDir: join(pcSiteRoot, 'tools', 'komorebi'),
    schema: 'narada.operator_surface.komorebi_tools_materialization.v0',
    capability: 'komorebi_tools_template_materialization',
    missingNote: 'Komorebi tools template source is absent; MCP did not fall back to a manual copy path.',
    mutationName: 'pc_site_komorebi_tools_template_materialization',
    restartActionName: 'restart_komorebi',
  });
}

function operatorDisplayMaterializeTools(args: any) : any{
  return materializePcSiteToolTree(args, {
    toolName: 'display',
    templateDir: displayToolsDir,
    targetDir: join(pcSiteRoot, 'tools', 'display'),
    schema: 'narada.operator_surface.display_tools_materialization.v0',
    capability: 'display_tools_template_materialization',
    missingNote: 'Display tools template source is absent; MCP did not fall back to a manual copy path.',
    mutationName: 'pc_site_display_tools_template_materialization',
    restartActionName: 'restart_display_tools',
  });
}

function materializePcSiteToolTree(args: any, config: any) : any{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const {
    toolName,
    templateDir,
    targetDir,
    schema,
    capability,
    missingNote,
    mutationName,
    restartActionName,
  }: any = config;

  if (!existsSync(templateDir)) {
    return jsonToolResult({
      status: 'missing_capability',
      capability,
      expected: templateDir,
      note: missingNote,
    }, true);
  }

  const driftBefore: any = compareTemplateTree(templateDir, targetDir);
  const evidence: any = {
    schema,
    authority: 'operator_surface_mcp',
    mutation: dryRun ? 'none' : mutationName,
    user_site: {
      root: siteRoot,
      template_source: templateDir,
      role: 'portable_template_input',
      file_count: driftBefore.template_file_count,
    },
    pc_site: {
      root: pcSiteRoot,
      target: targetDir,
      role: 'machine_local_configuration_authority',
      file_count_before: driftBefore.pc_file_count,
    },
    actions: {
      copy_template_owned_files_to_pc_site: true,
      delete_pc_only_files: false,
      [restartActionName]: false,
      drift_check: true,
    },
    tool_tree: toolName,
    drift_before: driftBefore,
  };

  if (dryRun) {
    return jsonToolResult({
      status: 'dry_run',
      ...evidence,
      would_copy_count: driftBefore.template_files.length,
      would_preserve_pc_only_count: driftBefore.pc_only.length,
    });
  }

  mkdirSync(targetDir, { recursive: true });
  for (const file of listRelativeFiles(templateDir)) {
    const source: any = join(templateDir, ...file.split('/'));
    const target: any = join(targetDir, ...file.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { force: true });
  }

  const driftAfter: any = compareTemplateTree(templateDir, targetDir);
  return jsonToolResult({
    status: 'materialized',
    ...evidence,
    pc_site_file_count_after: driftAfter.pc_file_count,
    copied_count: driftBefore.template_files.length,
    preserved_pc_only_count: driftAfter.pc_only.length,
    drift_after: driftAfter,
  });
}

/* ─── OSL Status ─── */
function operatorOslStatus() : any{
  if (!existsSync(oslPidPath)) {
    return jsonToolResult({ status: 'ok', running: false, pid: null, note: 'pid_file_not_found' });
  }
  const pid: any = Number(readFileSync(oslPidPath, 'utf8').trim());
  if (Number.isNaN(pid)) {
    return jsonToolResult({ status: 'ok', running: false, pid: null, note: 'pid_file_malformed' });
  }
  try {
    process.kill(pid, 0);
    return jsonToolResult({ status: 'ok', running: true, pid });
  } catch {
    return jsonToolResult({ status: 'ok', running: false, pid, note: 'process_not_alive' });
  }
}

/* ─── OSL Start ─── */
async function operatorOslStart() : Promise<any>{
  const scriptPath: any = oslScriptPath('Start-WindowSurfaceOverlay.ps1');
  if (!existsSync(scriptPath)) throw new Error('start_overlay_script_not_found');
  const projection: any = await unwrapToolResult(await operatorSurfaceProjectOslState({ refresh_live_evidence: true }));
  const stdout: any = await spawnPwsh(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]);
  return jsonToolResult({ status: 'ok', projection, start_output: stdout });
}

/* ─── OSL Stop ─── */
async function operatorOslStop() : Promise<any>{
  const scriptPath: any = oslScriptPath('Stop-WindowSurfaceOverlay.ps1');
  if (!existsSync(scriptPath)) throw new Error('stop_overlay_script_not_found');
  const stdout: any = await spawnPwsh(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]);
  return jsonToolResult({ status: 'ok', stop_output: stdout });
}

async function operatorOslBuildDeploy(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const runTests: any = booleanField(args, 'run_tests') !== false;
  const expectedCommit: any = stringField(args, 'expected_commit');
  const sourceFile: any = join(overlayDir, 'src', 'main.rs');
  const sourceExe: any = join(overlayDir, 'target', 'release', 'narada-window-surface-overlay.exe');
  const runtimeExe: any = join(pcOverlayDir, 'narada-window-surface-overlay.exe');
  const installScript: any = join(overlayDir, 'Install-WindowSurfaceOverlay.ps1');
  const panelHostInstallScript: any = join(panelHostDir, 'Install-OslPanelHost.ps1');
  const pcPanelHostDir: any = join(pcSiteRoot, 'tools', 'osl-webview2-panel-host');
  if (!existsSync(sourceFile)) throw new Error('osl_source_file_not_found');
  if (!existsSync(installScript)) throw new Error('install_overlay_script_not_found');
  if (!existsSync(panelHostInstallScript)) throw new Error('install_osl_panel_host_script_not_found');

  const gitHead: any = await spawnCapture('git', ['rev-parse', '--short=8', 'HEAD'], { timeoutMs: 5000 });
  const gitStatus: any = await spawnCapture('git', ['status', '--short', '--', relative(siteRoot, overlayDir)], { timeoutMs: 5000 });
  const expectedSourceDiff: any = expectedCommit
    ? await spawnCapture('git', ['diff', '--quiet', expectedCommit, '--', relative(siteRoot, sourceFile)], { timeoutMs: 5000 })
    : null;
  const sourceHashBefore: any = sha256File(sourceFile);
  const runtimeHashBefore: any = existsSync(runtimeExe) ? sha256File(runtimeExe) : null;

  const plan: any = {
    status: dryRun ? 'planned' : 'ok',
    schema: 'narada.operator_surface.osl_build_deploy.v0',
    authority: 'operator_surface_mcp',
    source: {
      overlay_dir: overlayDir,
      source_file: sourceFile,
      source_sha256_before: sourceHashBefore,
      git_head: gitHead.stdout?.trim() || null,
      expected_commit: expectedCommit || null,
      expected_commit_matches_head: expectedCommit
        ? (gitHead.stdout?.trim() || '').startsWith(expectedCommit)
        : null,
      expected_source_matches_checkout: expectedSourceDiff ? expectedSourceDiff.exit_code === 0 : null,
      git_status: gitStatus.stdout?.trim() || '',
    },
    runtime: {
      pc_site_root: pcSiteRoot,
      runtime_exe: runtimeExe,
      runtime_sha256_before: runtimeHashBefore,
    },
    would: [
      ...(runTests ? ['cargo test'] : []),
      'cargo build --release',
      'Install-WindowSurfaceOverlay.ps1',
      'Install-OslPanelHost.ps1',
      'operator_surface_project_osl_state(refresh_live_evidence=true)',
      'Start-WindowSurfaceOverlay.ps1',
      'Inspect-WindowSurfaceOverlay.ps1',
    ],
  };

  if (dryRun) return jsonToolResult(plan);

  if (expectedCommit && plan.source.expected_source_matches_checkout === false) {
    throw new Error(`osl_source_commit_mismatch: ${relative(siteRoot, sourceFile)} differs from ${expectedCommit} at checkout ${plan.source.git_head}`);
  }

  const preBuildStop: any = await stopOslFromKnownScripts();

  const testResult: any = runTests
    ? await spawnCapture('cargo', ['test'], { cwd: overlayDir, timeoutMs: 300000 })
    : null;
  if (testResult && testResult.exit_code !== 0) {
    return jsonToolResult({ ...plan, status: 'blocked', blocker: 'cargo_test_failed', cargo_test: summarizeCapture(testResult) });
  }

  const buildResult: any = await spawnCapture('cargo', ['build', '--release'], { cwd: overlayDir, timeoutMs: 300000 });
  if (buildResult.exit_code !== 0) {
    return jsonToolResult({
      ...plan,
      status: 'blocked',
      cargo_test: testResult ? summarizeCapture(testResult) : null,
      blocker: 'cargo_build_failed',
      cargo_build: summarizeCapture(buildResult),
      stop: preBuildStop,
    });
  }
  if (!existsSync(sourceExe)) throw new Error('cargo_build_completed_but_release_exe_missing');

  const installOutput: any = await spawnPwsh(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installScript, '-PcSiteRoot', pcSiteRoot]);
  const panelHostInstallOutput: any = await spawnPwsh(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', panelHostInstallScript, '-PcSiteRoot', pcSiteRoot]);
  const projection: any = await unwrapToolResult(await operatorSurfaceProjectOslState({ refresh_live_evidence: true }));
  const startOutput: any = await spawnPwsh(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(pcOverlayDir, 'Start-WindowSurfaceOverlay.ps1')]);
  const inspectOutput: any = await spawnPwsh(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(pcOverlayDir, 'Inspect-WindowSurfaceOverlay.ps1')]);
  const inspect: any = safeJsonParse(inspectOutput);
  const matchedRecords: any = Array.isArray(inspect)
    ? inspect.filter((record: any) => record?.matched)
    : [];
  const renderableRecords: any = matchedRecords.filter((record: any) => record?.renderable === true);

  return jsonToolResult({
    ...plan,
    status: 'deployed',
    cargo_test: testResult ? summarizeCapture(testResult) : null,
    cargo_build: summarizeCapture(buildResult),
    stop: preBuildStop,
    install_output: installOutput,
    panel_host: {
      install_output: panelHostInstallOutput,
      runtime_dir: pcPanelHostDir,
      start_script_exists: existsSync(join(pcPanelHostDir, 'Start-OslPanelHost.ps1')),
      stop_script_exists: existsSync(join(pcPanelHostDir, 'Stop-OslPanelHost.ps1')),
      inspect_script_exists: existsSync(join(pcPanelHostDir, 'Inspect-OslPanelHost.ps1')),
      project_exists: existsSync(join(pcPanelHostDir, 'osl-webview2-panel-host.csproj')),
      app_exe_exists: existsSync(join(pcPanelHostDir, 'app', 'osl-webview2-panel-host.exe')),
    },
    projection,
    start_output: startOutput,
    source: {
      ...plan.source,
      source_sha256_after: sha256File(sourceFile),
    },
    runtime: {
      ...plan.runtime,
      release_exe: sourceExe,
      release_sha256_after: sha256File(sourceExe),
      runtime_sha256_after: existsSync(runtimeExe) ? sha256File(runtimeExe) : null,
      runtime_matches_release: existsSync(runtimeExe) ? sha256File(runtimeExe) === sha256File(sourceExe) : false,
    },
    inspect: {
      parsed: Boolean(inspect),
      matched_count: matchedRecords.length,
      renderable_count: renderableRecords.length,
      matched: matchedRecords.map((record: any) => ({
        hwnd: record?.window?.hwnd,
        identity_name: record?.matched?.surface_id,
        label: record?.matched?.label,
        renderable: record?.renderable,
        render_blocker: record?.render_blocker ?? null,
        stale: record?.stale ?? null,
        stale_reason: record?.stale_reason ?? null,
        label_rect: record?.matched?.label_rect ?? null,
      })),
    },
  });
}

function oslScriptPath(scriptName: any) : any{
  const runtimeScript: any = join(pcOverlayDir, scriptName);
  if (existsSync(runtimeScript)) return runtimeScript;
  return join(overlayDir, scriptName);
}

async function stopOslFromKnownScripts() : Promise<any>{
  const scripts: any = [
    join(pcOverlayDir, 'Stop-WindowSurfaceOverlay.ps1'),
    join(overlayDir, 'Stop-WindowSurfaceOverlay.ps1'),
  ].filter((script: any, index: any, all: any) => existsSync(script) && all.indexOf(script) === index);
  const results: any = [];
  for (const script of scripts) {
    try {
      const output: any = await spawnPwsh(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script]);
      results.push({ script, status: 'ok', output });
    } catch (error: any) {
      results.push({ script, status: 'warning', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

/* ─── Komorebi Health ─── */
function operatorMcpRuntimeRegistryStatus(args: any) : any{
  return jsonToolResult(buildMcpRuntimeRegistryStatus({
    siteRoot,
    pcSiteRoot,
    target: stringField(args, 'target') ?? stringField(args, 'surface_id') ?? stringField(args, 'server_name'),
  }));
}

function operatorMcpRestartRequest(args: any) : any{
  return jsonToolResult(coordinateMcpRuntimeRestartRequest({
    siteRoot,
    pcSiteRoot,
    target: stringField(args, 'target') ?? stringField(args, 'surface_id') ?? stringField(args, 'server_name'),
    staleEpoch: numberField(args, 'stale_epoch'),
    dryRun: args.dry_run !== false,
    mutatingAuthorized: stringField(args, 'mutating_authorized'),
    requestedBy: stringField(args, 'requested_by'),
  }));
}

async function operatorKomorebiHealth() : Promise<any>{
  const psArgs: any = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(carriersDir, 'Get-KomorebiShortcutAndRoleBorderHealth.ps1'), '-PassThru'];
  const stdout: any = await spawnPwsh(psArgs);
  const health: any = safeJsonParse(stdout) ?? stdout;
  const phantomTiledWindows: any = analyzeKomorebiPhantomTiledWindows(health);
  if (health && typeof health === 'object' && !Array.isArray(health)) {
    health.komorebi_tiling_anomalies = phantomTiledWindows;
    if (health.health_taxonomy?.dimensions) {
      health.health_taxonomy.dimensions.komorebi_tiling_integrity = {
        status: phantomTiledWindows.count > 0 ? 'phantom_tiled_window' : 'no_phantom_tiled_windows_detected',
        anomaly_count: phantomTiledWindows.count,
        source: 'komorebic state monitors[].workspaces[].containers[].windows[] rects plus latest_layout slot geometry',
        repair_capability: 'operator_surface_repair_phantom_tiled_windows',
      };
    }
  }
  return jsonToolResult({ status: 'ok', komorebi: health });
}

async function operatorKomorebiDebug(args: any) : Promise<any>{
  const includeRawState: any = booleanField(args, 'include_raw_state') !== false;
  const health: any = await unwrapToolResult(await operatorKomorebiHealth());
  const state: any = includeRawState ? await spawnCapture('komorebic', ['state'], { timeoutMs: 2000 }) : null;
  return jsonToolResult({
    status: 'ok',
    schema: 'narada.operator_surface.komorebi_debug.v0',
    authority: 'runtime_observation',
    mutation: 'none',
    pc_site_root: pcSiteRoot,
    checks: {
      health_tool: health,
      komorebic_state: state,
    },
    interpretation: interpretKomorebiDebug(health, state),
  });
}

function interpretKomorebiDebug(health: any, state: any) : any{
  const notes: any = [];
  if (state && state.exit_code !== 0) notes.push('komorebic state was unavailable or failed; health-tool output is still returned for diagnosis.');
  if (state?.parsed) notes.push('komorebic state returned parseable JSON runtime state.');
  const anomalyCount: any = Number(health?.komorebi?.komorebi_tiling_anomalies?.count ?? 0);
  if (anomalyCount > 0) notes.push(`komorebi health classified ${anomalyCount} phantom_tiled_window anomaly/anomalies; use operator_surface_repair_phantom_tiled_windows dry_run first.`);
  const roleBorder: any = health?.komorebi?.role_border_watcher ?? health?.komorebi?.roleBorderWatcher;
  if (roleBorder?.status === 'not_running') notes.push('Role-border watcher reported not_running; confirm whether OSL has absorbed this responsibility before treating it as failure.');
  return notes;
}

async function operatorKomorebiRepairPhantomTiledWindows(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') !== false;
  const force: any = booleanField(args, 'force') === true;
  const health: any = await unwrapToolResult(await operatorKomorebiHealth());
  const anomalies: any = health?.komorebi?.komorebi_tiling_anomalies ?? { count: 0, findings: [] };
  if (!force && Number(anomalies.count ?? 0) === 0) {
    return jsonToolResult({
      status: 'no_op',
      schema: 'narada.operator_surface.komorebi_phantom_tiled_window_repair.v0',
      reason: 'no_phantom_tiled_window_detected',
      dry_run: dryRun,
      anomalies,
    });
  }

  const mutatingAuthorizedArg: any = stringField(args, 'mutating_authorized') ?? stringField(args, 'authority');
  if (!dryRun && !mutatingAuthorizedArg) throw new Error('mutating_authorized_required');
  const mutatingAuthorized: any = mutatingAuthorizedArg ?? 'operator_surface_mcp';
  const pcRepairScript: any = join(pcSiteRoot, 'tools', 'komorebi', 'Invoke-KomorebiRepairAuthority.ps1');
  const templateRepairScript: any = join(siteRoot, 'templates', 'pc-sites', 'windows-komorebi-yasb', 'tools', 'komorebi', 'Invoke-KomorebiRepairAuthority.ps1');
  const scriptPath: any = existsSync(pcRepairScript) ? pcRepairScript : templateRepairScript;
  if (!existsSync(scriptPath)) throw new Error('komorebi_repair_authority_script_not_found');
  const psArgs: any = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-Intent',
    'retile_current_workspace',
    '-Posture',
    dryRun ? 'dry_run' : 'live_mutating',
    '-UserSiteRoot',
    siteRoot,
    '-PcSiteRoot',
    pcSiteRoot,
    '-MutatingAuthorized',
    mutatingAuthorized,
    '-PassThru',
  ];
  const stdout: any = await spawnPwsh(psArgs);
  return jsonToolResult({
    status: dryRun ? 'dry_run' : 'ok',
    schema: 'narada.operator_surface.komorebi_phantom_tiled_window_repair.v0',
    authority: 'operator_surface_mcp',
    repair_policy: {
      selected_action: 'retile_current_workspace',
      destructive_window_close: false,
      unmanage_window: false,
      rationale: 'First admitted repair for a tiled offscreen placeholder is bounded retile through Komorebi repair authority; no window close or arbitrary HWND unmanage is performed.',
    },
    anomalies,
    script_path: scriptPath,
    repair_event: safeJsonParse(stdout) ?? stdout,
  });
}

function analyzeKomorebiPhantomTiledWindows(health: any) : any{
  const stateText: any = health?.komorebi?.state_probe?.stdout ?? health?.komorebi?.stateProbe?.stdout;
  const state: any = typeof stateText === 'string' ? safeJsonParse(stateText) : stateText;
  if (!state || typeof state !== 'object') {
    return {
      schema: 'narada.operator_surface.komorebi_phantom_tiled_windows.v0',
      status: 'state_unavailable',
      count: 0,
      findings: [],
    };
  }

  const findings: any = [];
  const monitors: any = collectionElements(state.monitors);
  monitors.forEach((monitor: any, monitorIndex: any) => {
    const workspaces: any = collectionElements(monitor?.workspaces);
    workspaces.forEach((workspace: any, workspaceIndex: any) => {
      const layoutSlots: any = collectionElements(workspace?.latest_layout ?? monitor?.latest_layout);
      const containers: any = collectionElements(workspace?.containers);
      containers.forEach((container: any, containerIndex: any) => {
        const windows: any = collectionElements(container?.windows);
        windows.forEach((window: any, windowIndex: any) => {
          const actualRect: any = normalizeRect(window?.rect ?? window?.window_rect ?? window?.actual_rect ?? window?.frame_rect);
          const allocatedLayoutRect: any = normalizeRect(layoutSlots[containerIndex] ?? layoutSlots[windowIndex]);
          const reasons: any = phantomWindowReasons(window, actualRect, allocatedLayoutRect);
          if (reasons.length === 0) return;
          findings.push({
            failure_class: 'phantom_tiled_window',
            monitor: {
              index: monitorIndex,
              id: monitor?.id ?? monitor?.name ?? null,
              name: monitor?.name ?? null,
            },
            workspace: {
              index: workspaceIndex,
              id: workspace?.id ?? workspace?.name ?? workspace?.workspace_id ?? null,
              name: workspace?.name ?? null,
            },
            container: {
              index: containerIndex,
              window_index: windowIndex,
            },
            window: {
              hwnd: numberOrNull(window?.hwnd),
              title: window?.title ?? '',
              exe: window?.exe ?? window?.process_name ?? '',
              class: window?.class ?? window?.window_class ?? '',
              visible: booleanOrNull(window?.visible),
              minimized: booleanOrNull(window?.minimized ?? window?.iconic ?? window?.is_iconic),
            },
            actual_rect: actualRect,
            allocated_layout_rect: allocatedLayoutRect,
            reasons,
            recommended_action: {
              repair_tool: 'operator_surface_repair_phantom_tiled_windows',
              first_action: 'retile_current_workspace',
              dry_run_first: true,
              destructive_close_admitted: false,
            },
          });
        });
      });
    });
  });

  return {
    schema: 'narada.operator_surface.komorebi_phantom_tiled_windows.v0',
    status: findings.length > 0 ? 'phantom_tiled_window' : 'no_phantom_tiled_windows_detected',
    count: findings.length,
    findings,
  };
}

function phantomWindowReasons(window: any, actualRect: any, allocatedLayoutRect: any) : any{
  const reasons: any = [];
  if (booleanOrNull(window?.minimized ?? window?.iconic ?? window?.is_iconic) === true) reasons.push('window_minimized_or_iconic');
  if (booleanOrNull(window?.visible) === false) reasons.push('window_not_visible');
  if (rectHasOffscreenPlaceholder(actualRect)) reasons.push('offscreen_placeholder_rect');
  if (actualRect && allocatedLayoutRect && rectHasVisibleArea(allocatedLayoutRect) && !rectsOverlap(actualRect, allocatedLayoutRect)) {
    reasons.push('actual_rect_does_not_overlap_allocated_layout_slot');
  }
  return [...new Set(reasons)];
}

function collectionElements(value: any) : any{
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.elements)) return value.elements;
  if (Array.isArray(value.items)) return value.items;
  return Object.entries(value)
    .filter(([key]: any) => !['focused', 'focused_idx', 'focused_index'].includes(key))
    .map(([, item]: any) => item)
    .filter((item: any) => item && typeof item === 'object');
}

function normalizeRect(rect: any) : any{
  if (!rect || typeof rect !== 'object') return null;
  const left: any = numberOrNull(rect.left ?? rect.x);
  const top: any = numberOrNull(rect.top ?? rect.y);
  const right: any = numberOrNull(rect.right);
  const bottom: any = numberOrNull(rect.bottom);
  const width: any = numberOrNull(rect.width ?? rect.w);
  const height: any = numberOrNull(rect.height ?? rect.h);
  if (left === null || top === null) return null;
  if (right !== null && bottom !== null && (right < left || bottom < top)) {
    return { left, top, right: left + right, bottom: top + bottom, width: right, height: bottom };
  }
  if (right !== null && bottom !== null) return { left, top, right, bottom, width: right - left, height: bottom - top };
  if (width !== null && height !== null) return { left, top, right: left + width, bottom: top + height, width, height };
  return null;
}

function rectHasOffscreenPlaceholder(rect: any) : any{
  if (!rect) return false;
  return [rect.left, rect.top, rect.right, rect.bottom].some((value: any) => typeof value === 'number' && value <= -30000);
}

function rectHasVisibleArea(rect: any) : any{
  return rect && Number(rect.width) > 0 && Number(rect.height) > 0;
}

function rectsOverlap(a: any, b: any) : any{
  if (!a || !b) return false;
  return Math.max(a.left, b.left) < Math.min(a.right, b.right)
    && Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
}

function numberOrNull(value: any) : any{
  const number: any = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanOrNull(value: any) : any{
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

async function operatorKomorebiRestart(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const pcRepairScript: any = join(pcSiteRoot, 'tools', 'komorebi', 'Invoke-KomorebiRepairAuthority.ps1');
  const templateRepairScript: any = join(siteRoot, 'templates', 'pc-sites', 'windows-komorebi-yasb', 'tools', 'komorebi', 'Invoke-KomorebiRepairAuthority.ps1');
  const scriptPath: any = existsSync(pcRepairScript) ? pcRepairScript : templateRepairScript;
  if (!existsSync(scriptPath)) throw new Error('komorebi_repair_authority_script_not_found');
  const posture: any = dryRun ? 'dry_run' : 'live_mutating';
  const psArgs: any = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-Intent',
    'restart_komorebi',
    '-Posture',
    posture,
    '-UserSiteRoot',
    siteRoot,
    '-PcSiteRoot',
    pcSiteRoot,
    '-MutatingAuthorized',
    'operator_surface_mcp',
    '-PassThru',
  ];
  const stdout: any = await spawnPwsh(psArgs);
  return jsonToolResult({
    status: dryRun ? 'dry_run' : 'ok',
    authority: 'operator_surface_mcp',
    script_path: scriptPath,
    restart_event: safeJsonParse(stdout) ?? stdout,
  });
}

async function operatorKomorebiStop(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const timeoutMs: any = Math.max(5000, Math.min(numberField(args, 'timeout_ms') ?? 15000, 60000));
  const pre: any = await unwrapToolResult(await operatorKomorebiHealth()).catch((error: any) => ({
    status: 'diagnostic_failed',
    error: error instanceof Error ? error.message : String(error),
  }));
  const preState: any = summarizeKomorebiRuntime(pre);
  const base: any = {
    schema: 'narada.operator_surface.komorebi_stop.v0',
    authority: 'operator_surface_mcp',
    pc_site_root: pcSiteRoot,
    precheck: compactKomorebiHealth(pre),
  };
  if (dryRun) {
    return jsonToolResult({
      status: 'dry_run',
      ...base,
      mutation: 'none',
      planned_action: 'komorebic_stop_then_postcheck',
      precheck_state: preState,
      rationale: 'Explicit operator shutdown requests can use this governed MCP path; routine agents must not use a raw shell path.',
    });
  }

  const stopCommand: any = await spawnCapture('komorebic', ['stop'], { timeoutMs });
  const post: any = await unwrapToolResult(await operatorKomorebiHealth()).catch((error: any) => ({
    status: 'diagnostic_failed',
    error: error instanceof Error ? error.message : String(error),
  }));
  const postState: any = summarizeKomorebiRuntime(post);
  const operationStatus: any = stopCommand.exit_code === 0
    ? postState.process_alive
      ? 'stop_sent_postcheck_running_or_unknown'
      : 'stop_sent_postcheck_stopped'
    : 'stop_failed';
  return jsonToolResult({
    status: operationStatus,
    ...base,
    mutation: 'komorebic_stop_via_operator_surface_mcp',
    command_result: summarizeCapture(stopCommand),
    postcheck: compactKomorebiHealth(post),
    precheck_state: preState,
    postcheck_state: postState,
  });
}

function summarizeKomorebiRuntime(health: any) : any{
  const processCount: any = Number(health?.komorebi?.komorebi?.process_count ?? health?.komorebi?.process_count ?? 0);
  const stateProbeOk: any = health?.komorebi?.komorebi?.state_probe?.ok === true || health?.komorebi?.state_probe?.ok === true;
  return {
    state: processCount > 0 ? 'running' : 'stopped_or_not_detected',
    process_alive: processCount > 0,
    process_count: processCount,
    state_probe_ok: stateProbeOk,
    health_status: health?.status ?? 'unknown',
  };
}

function compactKomorebiHealth(health: any) : any{
  if (!health) return null;
  const summary: any = summarizeKomorebiRuntime(health);
  return {
    status: health.status ?? 'unknown',
    runtime_state: summary.state,
    process_count: summary.process_count,
    state_probe_ok: summary.state_probe_ok,
    capability_health: health?.komorebi?.capability_health ?? null,
    tiling_anomalies: health?.komorebi?.komorebi_tiling_anomalies ?? null,
    detail_available_in: 'operator_surface_komorebi_health',
  };
}

async function operatorWhkdRestart(args: any) : Promise<any>{
  const dryRun: any = booleanField(args, 'dry_run') === true;
  const mode: any = stringField(args, 'mode') ?? 'restart';
  if (!['status', 'start', 'restart'].includes(mode)) throw new Error(`unsupported_whkd_mode: ${mode}`);
  const scriptPath: any = join(carriersDir, 'Restart-WhkdDaemon.ps1');
  if (!existsSync(scriptPath)) throw new Error('restart_whkd_script_not_found');
  const psArgs: any = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-UserSiteRoot',
    siteRoot,
    '-PcSiteRoot',
    pcSiteRoot,
    '-Mode',
    mode,
    '-MutatingAuthorized',
    'operator_surface_mcp',
    '-PassThru',
  ];
  if (dryRun) psArgs.push('-DryRun');
  const stdout: any = await spawnPwsh(psArgs);
  return jsonToolResult({
    status: dryRun ? 'dry_run' : 'ok',
    authority: 'operator_surface_mcp',
    script_path: scriptPath,
    whkd_event: safeJsonParse(stdout) ?? stdout,
  });
}

/* ─── Tool schema ─── */
function tools() : any{
  return [
    { name: 'operator_surface_doctor', description: 'Inspect Operator Surface MCP readiness without mutating.', inputSchema: objectSchema({}) },
    { name: 'operator_surface_authority_status', description: 'Inspect operator-surface SQLite authority metadata, schema version, and projection boundaries.', inputSchema: objectSchema({}) },
    { name: 'operator_surface_backup_authority', description: 'Create an audited local backup/export of User Site operator-surface SQLite authority.', inputSchema: objectSchema({ reason: stringSchema('Reason for the backup/export.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_list_identities', description: 'List admitted identities with optional site/role filters.', inputSchema: objectSchema({ site_id: stringSchema('Filter by site_id.'), role: stringSchema('Filter by role: architect, builder, resident, observer, etc.') }) },
    { name: 'operator_surface_register_agent_profile', description: 'Register or update an admitted agent profile in SQLite authority.', inputSchema: objectSchema({ identity_name: stringSchema('Canonical identity name.'), role: stringSchema('Canonical role.'), site_id: stringSchema('Owning site id.'), agent_name: stringSchema('Short agent name.'), agent_kind: stringSchema('Agent kind.'), admitted_by: stringSchema('Principal admitting this profile.'), label: stringSchema('Display label.'), display_name: stringSchema('Human display name.'), site_kind: stringSchema('Site kind.'), relation: stringSchema('Site relation.'), site_affinity_color: stringSchema('Site affinity color.'), role_label: stringSchema('Role label.'), role_affinity_color: stringSchema('Role affinity color.'), narada_site_relation: anyObjectSchema('Site relation object.'), projection_intent: arraySchema('Projection intents.'), distinct_from: arraySchema('Identity names this profile must not be conflated with.'), carrier_projections: anyObjectSchema('Carrier projections.'), label_projection: anyObjectSchema('Label projection.'), input_capabilities: arraySchema('Input capabilities.'), submit_strategy: stringSchema('Submit strategy.'), authority_limits: arraySchema('Authority limits.'), allow_unrostered: boolSchema('Allow profiles not present in this site SQLite roster.'), dry_run: boolSchema('Plan only.') }, ['identity_name', 'role']) },
    { name: 'operator_surface_admit_identity', description: 'Create a new operator-surface identity with roster validation, admission logging, and JSON projection refresh.', inputSchema: objectSchema({ identity_name: stringSchema('Canonical identity name.'), role: stringSchema('Canonical role.'), site_id: stringSchema('Owning site id.'), agent_name: stringSchema('Short agent name.'), agent_kind: stringSchema('Agent kind.'), admitted_by: stringSchema('Principal admitting this identity.'), label: stringSchema('Display label.'), display_name: stringSchema('Human display name.'), carrier_projections: anyObjectSchema('Carrier projections.'), role_prompt: stringSchema('Role prompt or prompt reference.'), allow_unrostered: boolSchema('Allow identities not present in roster cache.'), dry_run: boolSchema('Plan only.') }, ['identity_name', 'role']) },
    { name: 'operator_surface_update_identity', description: 'Update an existing operator-surface identity with roster validation, mutation logging, and JSON projection refresh.', inputSchema: objectSchema({ identity_name: stringSchema('Canonical identity name.'), role: stringSchema('Canonical role.'), site_id: stringSchema('Owning site id.'), agent_name: stringSchema('Short agent name.'), agent_kind: stringSchema('Agent kind.'), admitted_by: stringSchema('Principal updating this identity.'), label: stringSchema('Display label.'), display_name: stringSchema('Human display name.'), carrier_projections: anyObjectSchema('Carrier projections.'), role_prompt: stringSchema('Role prompt or prompt reference.'), allow_unrostered: boolSchema('Allow identities not present in roster cache.'), dry_run: boolSchema('Plan only.') }, ['identity_name', 'role']) },
    { name: 'operator_surface_revoke_identity', description: 'Soft-delete an operator-surface identity with admission logging and JSON projection refresh.', inputSchema: objectSchema({ identity_name: stringSchema('Canonical identity name.'), revoked_by: stringSchema('Principal revoking this identity.'), reason: stringSchema('Reason for revocation.'), dry_run: boolSchema('Plan only.') }, ['identity_name']) },
    { name: 'operator_surface_list_agent_profiles', description: 'List admitted agent profiles from SQLite authority.', inputSchema: objectSchema({ site_id: stringSchema('Filter by site_id.'), role: stringSchema('Filter by role.'), include_deprecated: boolSchema('Include deprecated profiles.') }) },
    { name: 'operator_surface_show_agent_profile', description: 'Show one admitted agent profile from SQLite authority.', inputSchema: objectSchema({ identity_name: stringSchema('Canonical identity name.') }, ['identity_name']) },
    { name: 'operator_surface_register', description: 'Register or update an observed operator surface instance in PC-local SQLite runtime authority.', inputSchema: objectSchema({ surface_id: stringSchema('Stable surface id. Required unless hwnd is supplied.'), surface_kind: stringSchema('Surface kind, e.g. windows_hwnd.'), hwnd: numberSchema('Windows HWND.'), pid: numberSchema('Observed process id.'), process_name: stringSchema('Observed process name.'), window_class: stringSchema('Observed window class.'), window_title: stringSchema('Observed window title.'), observed_by: stringSchema('Observer principal.'), status: stringSchema('Surface status.'), evidence: anyObjectSchema('Observed evidence.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_list', description: 'List registered operator surface instances from PC-local SQLite runtime authority.', inputSchema: objectSchema({ status: stringSchema('Filter by status.') }) },
    { name: 'operator_surface_observe_current', description: 'Observe the current foreground window and register it as an operator surface instance.', inputSchema: objectSchema({ observed_by: stringSchema('Observer principal.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_bind_agent', description: 'Bind a registered agent profile to a registered operator surface instance.', inputSchema: objectSchema({ identity_name: stringSchema('Registered agent profile identity.'), surface_id: stringSchema('Registered operator surface id.'), hwnd: numberSchema('Windows HWND; registers the surface if missing.'), bound_by: stringSchema('Principal asserting the binding.'), assertion_method: stringSchema('Assertion method.'), liveness_policy: stringSchema('live_hwnd_required (default) or strict_guards.'), allow_guard_drift: arraySchema('Guard drift reasons allowed under strict_guards, e.g. pid_mismatch.'), allow_stale_surface: boolSchema('Compatibility escape hatch for binding despite dead/stale evidence.'), dry_run: boolSchema('Plan only.') }, ['identity_name']) },
    { name: 'operator_surface_unbind_agent', description: 'Unbind an active agent/profile to operator-surface binding.', inputSchema: objectSchema({ identity_name: stringSchema('Identity to unbind.'), surface_id: stringSchema('Surface to unbind.'), unbound_by: stringSchema('Principal unbinding.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_prune_stale_bindings', description: 'Mark active bindings stale when their HWND evidence no longer validates.', inputSchema: objectSchema({ stale_policy: stringSchema('dead_hwnd_only (default) or strict_guards.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_project_osl_bindings', description: 'Project SQLite runtime bindings into the legacy JSON file consumed by the current OSL renderer.', inputSchema: objectSchema({ refresh_live_evidence: boolSchema('Refresh HWND PID/process/class/title evidence before projecting. Default true.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_project_identity_registry', description: 'Project SQLite agent profiles into the legacy identities JSON consumed by older carriers.', inputSchema: objectSchema({ dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_project_window_labels', description: 'Project SQLite agent profiles into the current OSL window-label config.', inputSchema: objectSchema({ dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_project_osl_state', description: 'Project the complete SQLite-backed state required by the current OSL renderer.', inputSchema: objectSchema({ refresh_live_evidence: boolSchema('Refresh HWND PID/process/class/title evidence before projecting runtime bindings. Default true.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_focus_identity', description: 'Focus an identity carrier window.', inputSchema: objectSchema({ identity_name: stringSchema('Identity name to focus.'), dry_run: boolSchema('Plan only, do not activate.') }, ['identity_name']) },
    { name: 'operator_surface_send_message', description: 'Send text through the governed Operator Surface Message Bus carrier and record durable delivery evidence. Long text may be supplied through payload_ref.', inputSchema: objectSchema({ payload_ref: stringSchema('Optional immutable transient payload ref containing identity_name, text, and related send arguments.'), identity_name: stringSchema('Target identity name.'), text: stringSchema('Message text.'), from_identity: stringSchema('Sender identity.'), hwnd: numberSchema('Optional target HWND.'), message_posture: stringSchema('short_command or note. Default note.'), submit_strategy: stringSchema('type_only, operator_confirmed_submit, or known_surface_submit. Default known_surface_submit.'), asserted_by: stringSchema('Principal asserting the send.'), authority_basis: anyObjectSchema('Authority basis for the OSM send permission policy.'), explicit_operator_osm_request: boolSchema('True only when the operator explicitly requested this OSM/send/handoff.'), max_attempts: numberSchema('Maximum bus attempts. Default 2.'), backoff_ms: numberSchema('Backoff in milliseconds. Default 750.'), expires_after_ms: numberSchema('Expiry in milliseconds. Default 10000.'), dedupe_key: stringSchema('Optional explicit dedupe key.'), no_dedupe: boolSchema('Disable dedupe.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_message_bus_state', description: 'Read durable Operator Surface Message Bus delivery state.', inputSchema: objectSchema({ bus_event_id: stringSchema('Specific bus event id.'), dedupe_key: stringSchema('Specific dedupe key.'), latest: numberSchema('Latest event count. Default 10.') }) },
    { name: 'operator_surface_list_workspaces', description: 'List operator workspaces and their members.', inputSchema: objectSchema({}) },
    { name: 'operator_surface_register_workspace', description: 'Register or update an operator workspace in SQLite authority, then refresh the legacy JSON projection.', inputSchema: objectSchema({ workspace_id: stringSchema('Workspace id.'), display_name: stringSchema('Display name.'), surface_state: stringSchema('running, launchable, hidden, etc.'), state: stringSchema('Alias for surface_state.'), intent: stringSchema('Workspace intent.'), members: arraySchema('Workspace members.'), hidden_members: arraySchema('Hidden members.'), default_variant_id: stringSchema('Default topology variant.'), topology_variants: arraySchema('Topology variants.'), monitor_count: numberSchema('Monitor count.'), projection: anyObjectSchema('Workspace projection payload.'), workspace: anyObjectSchema('Full workspace object.'), admitted_by: stringSchema('Principal admitting this workspace.'), dry_run: boolSchema('Plan only.') }, ['workspace_id']) },
    { name: 'operator_surface_project_workspace_state', description: 'Project SQLite operator workspace authority into the legacy operator-workspaces JSON consumed by older carriers.', inputSchema: objectSchema({ dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_switch_workspace', description: 'Switch to a workspace by ID or direction.', inputSchema: objectSchema({ workspace_id: stringSchema('Target workspace ID.'), direction: stringSchema('Direction: next or previous.') }) },
    { name: 'operator_surface_binding_status', description: 'Read runtime HWND-to-identity bindings.', inputSchema: objectSchema({}) },
    { name: 'operator_surface_repair_bindings', description: 'Repair window bindings, styles, and Komorebi admission.', inputSchema: objectSchema({ dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_health', description: 'Evaluate operator surface health for all identities.', inputSchema: objectSchema({}) },
    { name: 'operator_surface_yasb_status', aliases: ['operator_yasb_status'], description: 'Inspect YASB runtime state (processes, instances, logs).', inputSchema: objectSchema({}) },
    { name: 'operator_surface_yasb_debug', aliases: ['operator_yasb_debug', 'yasb_debug'], description: 'Read-only YASB debug bundle: inspection script output plus named-pipe reachability.', inputSchema: objectSchema({ include_pipe_probe: boolSchema('Probe the YASB named pipe. Default true.') }) },
    { name: 'operator_surface_recover_yasb', aliases: ['operator_yasb_recover', 'yasb_recover'], description: 'Unified governed YASB recovery: inspect runtime, reload through the pipe when alive, escalate to materialize/restart when the pipe or process is missing, and return compact postcheck evidence.', inputSchema: objectSchema({ timeout_ms: numberSchema('Bounded recovery timeout in milliseconds for restart escalation. Clamped to 5000..120000; default 60000.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_reload_yasb', aliases: ['operator_yasb_reload', 'yasb_reload'], description: 'Send reload command to YASB via named pipe and return structured result/postcheck evidence.', inputSchema: objectSchema({ dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_stop_yasb', aliases: ['operator_yasb_stop', 'yasb_stop'], description: 'Send stop command to YASB via named pipe and return structured result/postcheck evidence.', inputSchema: objectSchema({ dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_materialize_yasb_projection', aliases: ['operator_yasb_materialize', 'materialize_yasb_projection', 'yasb_materialize_restart'], description: 'Materialize the User Site YASB template into the PC Site and generated live YASB config with explicit locus evidence. Returns completed, failed, timed_out_postcheck_healthy, or timed_out_postcheck_degraded_or_unknown without wedging the MCP server.', inputSchema: objectSchema({ restart_yasb: boolSchema('Restart YASB after materialization. Default false; drift is still checked with process check skipped.'), timeout_ms: numberSchema('Bounded PowerShell apply/restart timeout in milliseconds. Clamped to 5000..120000; default 45000.'), verbose: boolSchema('Include verbose stdout/stderr tails and full post-operation debug payload. Default false.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_materialize_komorebi_tools', description: 'Materialize the User Site Komorebi tools template into the PC Site with drift evidence and no restart.', inputSchema: objectSchema({ dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_materialize_display_tools', description: 'Materialize the User Site display tools template into the PC Site with drift evidence and no restart.', inputSchema: objectSchema({ dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_osl_status', description: 'Check if the window surface overlay (OSL) is running.', inputSchema: objectSchema({}) },
    { name: 'operator_surface_start_osl', description: 'Start the window surface overlay renderer.', inputSchema: objectSchema({}) },
    { name: 'operator_surface_stop_osl', description: 'Stop the window surface overlay renderer.', inputSchema: objectSchema({}) },
    { name: 'operator_surface_build_deploy_osl', description: 'Build, install, restart, and inspect the repaired window surface overlay through the sanctioned operator-surface MCP path.', inputSchema: objectSchema({ expected_commit: stringSchema('Expected git commit prefix for the repaired source.'), run_tests: boolSchema('Run cargo test before build. Default true.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_mcp_runtime_registry_status', description: 'Read PC-locus MCP runtime instance registry state for declared MCP surfaces without process mutation.', inputSchema: objectSchema({ target: stringSchema('Declared surface_id or generated server name.'), surface_id: stringSchema('Declared MCP surface id.'), server_name: stringSchema('Generated MCP server name.') }) },
    { name: 'operator_surface_mcp_restart_request', description: 'Coordinate a host-level MCP restart request from PC runtime registry evidence; returns restarted, skipped, failed, and external-carrier-required terminal evidence without arbitrary process killing.', inputSchema: objectSchema({ target: stringSchema('Declared surface_id or generated server name.'), surface_id: stringSchema('Declared MCP surface id.'), server_name: stringSchema('Generated MCP server name.'), stale_epoch: numberSchema('Optional source epoch threshold for affected instances.'), requested_by: stringSchema('Principal requesting coordination.'), mutating_authorized: stringSchema('Required token for admitted restartable stub path.'), dry_run: boolSchema('Plan only. Default true.') }) },
    { name: 'operator_surface_komorebi_health', description: 'Inspect Komorebi, WHKD, YASB, and foreground window health.', inputSchema: objectSchema({}) },
    { name: 'operator_surface_komorebi_debug', description: 'Read-only Komorebi debug bundle: health script output plus optional komorebic state.', inputSchema: objectSchema({ include_raw_state: boolSchema('Invoke komorebic state and include the captured runtime state. Default true.') }) },
    { name: 'operator_surface_repair_phantom_tiled_windows', description: 'Governed dry-run/live repair path for Komorebi phantom tiled offscreen windows. Dry-run is default; live path uses admitted retile_current_workspace and never closes windows.', inputSchema: objectSchema({ dry_run: boolSchema('Plan only. Default true.'), force: boolSchema('Run repair plan even if current health does not classify a phantom tiled window.'), mutating_authorized: stringSchema('Required authority token for live mutation.') }) },
    { name: 'operator_surface_stop_komorebi', aliases: ['operator_komorebi_stop', 'komorebi_stop'], description: 'Stop Komorebi through a governed operator-surface MCP path with postcheck evidence.', inputSchema: objectSchema({ timeout_ms: numberSchema('Bounded stop/postcheck timeout in milliseconds. Clamped to 5000..60000; default 15000.'), dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_restart_komorebi', description: 'Restart Komorebi through the admitted repair authority path.', inputSchema: objectSchema({ dry_run: boolSchema('Plan only.') }) },
    { name: 'operator_surface_restart_whkd', description: 'Restart or inspect WHKD through the sanctioned daemon supervision script.', inputSchema: objectSchema({ mode: stringSchema('status, start, or restart. Default restart.'), dry_run: boolSchema('Plan only.') }) },
  ];
}

/* ─── PowerShell helper ─── */
function spawnPwsh(args: any) : any{
  return new Promise((resolve: any, reject: any) => {
    const child: any = runGovernedCommand('pwsh', args, {
      cwd: siteRoot,
      env: {
        ...process.env,
        NARADA_YASB_SOURCE_ROOT: join(siteRoot, 'vendor', 'yasb'),
      },
    });
    let stdout: any = '';
    let stderr: any = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: any) => { stdout += d; });
    child.stderr.on('data', (d: any) => { stderr += d; });
    child.on('error', (err: any) => reject(err));
    child.on('close', (code: any) => {
      if (code !== 0) {
        const msg: any = stderr.trim() || stdout.trim() || `PowerShell exited ${code}`;
        reject(new Error(msg));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function spawnPwshBounded(args: any, { timeoutMs = 45000 }: any = {}) : any{
  return new Promise((resolve: any) => {
    const child: any = runGovernedCommand('pwsh', args, {
      cwd: siteRoot,
      env: {
        ...process.env,
        NARADA_YASB_SOURCE_ROOT: join(siteRoot, 'vendor', 'yasb'),
      },
    });
    let settled: any = false;
    let stdout: any = '';
    let stderr: any = '';
    const settle: any = (payload: any) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    const timer: any = setTimeout(() => {
      const childPid: any = child.pid;
      try {
        child.kill();
      } catch {
        // Best-effort cleanup; timeout diagnostics below keep the MCP surface responsive.
      }
      if (childPid) {
        const killer: any = runGovernedCommand('taskkill.exe', ['/PID', String(childPid), '/T', '/F'], {
          cwd: siteRoot,
          stdio: 'ignore',
        });
        killer.unref();
      }
      settle({
        command: 'pwsh',
        args,
        status: 'timed_out',
        timed_out: true,
        exit_code: null,
        stdout,
        stderr,
      });
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: any) => { stdout += d; });
    child.stderr.on('data', (d: any) => { stderr += d; });
    child.on('error', (error: any) => {
      clearTimeout(timer);
      settle({
        command: 'pwsh',
        args,
        status: 'failed',
        timed_out: false,
        exit_code: null,
        stdout,
        stderr,
        error: error.message,
      });
    });
    child.on('close', (code: any) => {
      clearTimeout(timer);
      settle({
        command: 'pwsh',
        args,
        status: code === 0 ? 'completed' : 'failed',
        timed_out: false,
        exit_code: code,
        stdout,
        stderr,
      });
    });
  });
}

function spawnCapture(command: any, args: any, { timeoutMs = 2000, cwd = siteRoot }: any = {}) : any{
  return new Promise((resolve: any) => {
    const child: any = runGovernedCommand(command, args, { cwd });
    let settled: any = false;
    let stdout: any = '';
    let stderr: any = '';
    const settle: any = (payload: any) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    const timer: any = setTimeout(() => {
      child.kill();
      settle({ command, args, exit_code: null, timed_out: true, stdout, stderr, parsed: safeJsonParse(stdout) });
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: any) => { stdout += d; });
    child.stderr.on('data', (d: any) => { stderr += d; });
    child.on('error', (error: any) => {
      clearTimeout(timer);
      settle({ command, args, exit_code: null, error: error.message, stdout, stderr, parsed: null });
    });
    child.on('close', (code: any) => {
      clearTimeout(timer);
      settle({ command, args, exit_code: code, timed_out: false, stdout: stdout.trim(), stderr: stderr.trim(), parsed: safeJsonParse(stdout) ?? null });
    });
  });
}

function summarizeCapture(result: any) : any{
  return {
    command: [result.command, ...(result.args ?? [])].join(' '),
    exit_code: result.exit_code,
    timed_out: result.timed_out,
    stdout_tail: tailText(result.stdout),
    stderr_tail: tailText(result.stderr),
    error: result.error ?? null,
  };
}

function tailText(value: any, max: any = 4000) : any{
  const text: any = String(value ?? '');
  return text.length > max ? text.slice(text.length - max) : text;
}

function sha256File(path: any) : any{
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function probeNamedPipe(pipePath: any, timeoutMs: any) : any{
  return new Promise((resolve: any) => {
    const client: any = net.connect(pipePath, () => {
      client.end();
      resolve({ pipe: pipePath, accessible: true });
    });
    client.on('error', (error: any) => resolve({ pipe: pipePath, accessible: false, error: error.message }));
    client.setTimeout(timeoutMs, () => {
      client.destroy();
      resolve({ pipe: pipePath, accessible: false, timed_out: true });
    });
  });
}

function openOperatorSurfaceDb() : any{
  if (operatorDb) return operatorDb;
  mkdirSync(join(siteRoot, '.ai', 'db'), { recursive: true });
  operatorDb = new Database(operatorSurfaceDbPath);
  operatorDb.pragma('journal_mode = WAL');
  operatorDb.pragma('foreign_keys = ON');
  operatorDb.exec(`
    CREATE TABLE IF NOT EXISTS operator_surface_metadata (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operator_surface_sites (
      site_id TEXT PRIMARY KEY,
      affinity_color TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operator_surface_roles (
      role TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      affinity_color TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operator_surface_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id TEXT NOT NULL UNIQUE,
      identity_name TEXT NOT NULL UNIQUE,
      agent_name TEXT NOT NULL,
      role TEXT NOT NULL,
      agent_kind TEXT NOT NULL,
      site_id TEXT NOT NULL,
      label TEXT,
      display_name TEXT,
      deprecated INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT,
      previous_identity_ids_json TEXT,
      migration_history_json TEXT,
      narada_site_relation_json TEXT NOT NULL,
      role_metadata_json TEXT NOT NULL,
      projection_intent_json TEXT,
      distinct_from_json TEXT,
      carrier_projections_json TEXT,
      label_projection_json TEXT,
      input_capabilities_json TEXT,
      submit_strategy TEXT,
      role_prompt TEXT,
      authority_limits_json TEXT,
      admitted_by TEXT NOT NULL,
      admitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT,
      revoked_by TEXT,
      FOREIGN KEY (site_id) REFERENCES operator_surface_sites(site_id),
      FOREIGN KEY (role) REFERENCES operator_surface_roles(role)
    );
    CREATE INDEX IF NOT EXISTS idx_identities_site_id ON operator_surface_identities(site_id);
    CREATE INDEX IF NOT EXISTS idx_identities_role ON operator_surface_identities(role);
    CREATE INDEX IF NOT EXISTS idx_identities_deprecated ON operator_surface_identities(deprecated);
    CREATE INDEX IF NOT EXISTS idx_identities_revoked ON operator_surface_identities(revoked_at);
    CREATE TABLE IF NOT EXISTS operator_surface_identity_admission_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id TEXT NOT NULL,
      event_kind TEXT NOT NULL CHECK(event_kind IN ('admitted','updated','deprecated','revoked','migrated','generated')),
      event_at TEXT NOT NULL,
      event_by TEXT NOT NULL,
      payload_json TEXT,
      source TEXT NOT NULL DEFAULT 'operator_surface_mcp',
      FOREIGN KEY (identity_id) REFERENCES operator_surface_identities(identity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_admission_log_identity ON operator_surface_identity_admission_log(identity_id);
    CREATE INDEX IF NOT EXISTS idx_admission_log_event_at ON operator_surface_identity_admission_log(event_at);
    CREATE TABLE IF NOT EXISTS operator_surface_workspaces (
      workspace_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      surface_state TEXT NOT NULL,
      intent TEXT,
      default_variant_id TEXT,
      monitor_count INTEGER,
      payload_json TEXT NOT NULL,
      admitted_by TEXT NOT NULL,
      admitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT,
      revoked_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_operator_surface_workspaces_state ON operator_surface_workspaces(surface_state);
    CREATE TABLE IF NOT EXISTS operator_surface_workspace_members (
      workspace_id TEXT NOT NULL,
      identity_name TEXT NOT NULL,
      role_in_workspace TEXT,
      desired_posture TEXT,
      preferred_locus_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, identity_name),
      FOREIGN KEY (workspace_id) REFERENCES operator_surface_workspaces(workspace_id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_surface_workspace_members_identity ON operator_surface_workspace_members(identity_name);
  `);
  ensureColumn(operatorDb, 'operator_surface_identities', 'role_prompt', 'TEXT');
  ensureOperatorSurfaceAuthorityMetadata(operatorDb);
  return operatorDb;
}

function openOperatorSurfaceRuntimeDb() : any{
  if (runtimeDb) return runtimeDb;
  mkdirSync(join(pcSiteRoot, 'runtime'), { recursive: true });
  runtimeDb = new Database(operatorSurfaceRuntimeDbPath);
  runtimeDb.pragma('journal_mode = WAL');
  runtimeDb.pragma('foreign_keys = ON');
  runtimeDb.exec(`
    CREATE TABLE IF NOT EXISTS operator_surface_instances (
      surface_id TEXT PRIMARY KEY,
      surface_kind TEXT NOT NULL,
      hwnd INTEGER,
      pid INTEGER,
      process_name TEXT,
      window_class TEXT,
      window_title TEXT,
      observed_at TEXT NOT NULL,
      observed_by TEXT NOT NULL,
      evidence_json TEXT,
      status TEXT NOT NULL DEFAULT 'observed'
    );
    CREATE INDEX IF NOT EXISTS idx_operator_surface_instances_hwnd ON operator_surface_instances(hwnd);
    CREATE INDEX IF NOT EXISTS idx_operator_surface_instances_status ON operator_surface_instances(status);
    CREATE TABLE IF NOT EXISTS operator_surface_bindings (
      binding_id TEXT PRIMARY KEY,
      surface_id TEXT NOT NULL,
      identity_id TEXT NOT NULL,
      identity_name TEXT NOT NULL,
      bound_at TEXT NOT NULL,
      bound_by TEXT NOT NULL,
      assertion_method TEXT NOT NULL,
      evidence_json TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      unbound_at TEXT,
      unbound_by TEXT,
      FOREIGN KEY (surface_id) REFERENCES operator_surface_instances(surface_id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_surface_bindings_surface ON operator_surface_bindings(surface_id, status);
    CREATE INDEX IF NOT EXISTS idx_operator_surface_bindings_identity ON operator_surface_bindings(identity_id, status);
    CREATE TABLE IF NOT EXISTS operator_surface_runtime_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_at TEXT NOT NULL,
      event_kind TEXT NOT NULL,
      surface_id TEXT,
      identity_id TEXT,
      payload_json TEXT,
      source TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_operator_surface_runtime_events_at ON operator_surface_runtime_events(event_at);
  `);
  return runtimeDb;
}

function ensureColumn(db: any, tableName: any, columnName: any, columnSpec: any) : any{
  const columns: any = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column: any) => column.name === columnName)) return;
  db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSpec}`).run();
}

function getAgentProfile(identityName: any) : any{
  const db: any = openOperatorSurfaceDb();
  const row: any = db.prepare(`
    SELECT * FROM operator_surface_identities
    WHERE identity_id = ? OR identity_name = ?
    LIMIT 1
  `).get(identityName, identityName);
  if (!row) return null;
  return {
    identity_id: row.identity_id,
    identity_name: row.identity_name,
    agent_name: row.agent_name,
    role: row.role,
    agent_kind: row.agent_kind,
    site_id: row.site_id,
    label: row.label,
    display_name: row.display_name,
    deprecated: row.deprecated === 1,
    superseded_by: row.superseded_by,
    previous_identity_ids: parseJson(row.previous_identity_ids_json, []),
    migration_history: parseJson(row.migration_history_json, []),
    narada_site_relation: parseJson(row.narada_site_relation_json, {}),
    role_metadata: parseJson(row.role_metadata_json, {}),
    projection_intent: parseJson(row.projection_intent_json, []),
    distinct_from: parseJson(row.distinct_from_json, []),
    carrier_projections: parseJson(row.carrier_projections_json, {}),
    label_projection: parseJson(row.label_projection_json, {}),
    input_capabilities: parseJson(row.input_capabilities_json, []),
    submit_strategy: row.submit_strategy,
    role_prompt: row.role_prompt ?? null,
    authority_limits: parseJson(row.authority_limits_json, []),
    admitted_by: row.admitted_by,
    admitted_at: row.admitted_at,
    updated_at: row.updated_at,
    revoked_at: row.revoked_at,
    revoked_by: row.revoked_by,
  };
}

function getRosterAgent(agentId: any) : any{
  if (existsSync(taskLifecycleDbPath)) {
    const db: any = new Database(taskLifecycleDbPath, { readonly: true });
    try {
      const row: any = db.prepare(`
        SELECT agent_id, role, capabilities_json, status, operator_identity
        FROM agent_roster
        WHERE agent_id = ?
        LIMIT 1
      `).get(agentId);
      if (row) {
        return {
          agent_id: row.agent_id,
          role: row.role,
          capabilities: parseJson(row.capabilities_json, []),
          status: row.status,
          operator_identity: row.operator_identity,
          roster_source: 'task_lifecycle_sqlite_agent_roster',
        };
      }
    } catch {
      // Fall back to authored roster below.
    } finally {
      db.close();
    }
  }

  return getStaticRosterAgent(agentId);
}

function getStaticRosterAgent(agentId: any) : any{
  const staticRosterPath: any = join(siteRoot, '.ai', 'agents', 'roster.json');
  if (!existsSync(staticRosterPath)) return null;
  try {
    const roster: any = JSON.parse(readFileSync(staticRosterPath, 'utf8'));
    const agents: any = Array.isArray(roster.agents) ? roster.agents : [];
    const agent: any = agents.find((entry: any) => entry && entry.agent_id === agentId);
    if (!agent) return null;
    return {
      agent_id: agent.agent_id,
      role: agent.role,
      capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
      status: agent.status ?? null,
      operator_identity: agent.operator_identity ?? null,
      roster_source: 'static_roster_config_source',
    };
  } catch {
    return null;
  }
}

async function getWindowEvidence(hwnd: any = null) : Promise<any>{
  const hwndLiteral: any = hwnd ? `[IntPtr]${Math.trunc(hwnd)}` : '[NaradaOperatorSurfaceMcpNative]::GetForegroundWindow()';
  const script: any = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NaradaOperatorSurfaceMcpNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$hwnd = ${hwndLiteral}
$pid = [uint32]0
$live = [NaradaOperatorSurfaceMcpNative]::IsWindow($hwnd)
if ($live) { [void][NaradaOperatorSurfaceMcpNative]::GetWindowThreadProcessId($hwnd, [ref]$pid) }
$process = if ($pid -gt 0) { Get-Process -Id $pid -ErrorAction SilentlyContinue } else { $null }
$class = [System.Text.StringBuilder]::new(256)
$title = [System.Text.StringBuilder]::new(512)
if ($live) {
  [void][NaradaOperatorSurfaceMcpNative]::GetClassName($hwnd, $class, $class.Capacity)
  [void][NaradaOperatorSurfaceMcpNative]::GetWindowText($hwnd, $title, $title.Capacity)
}
[pscustomobject][ordered]@{
  hwnd = $hwnd.ToInt64()
  live = $live
  pid = [int64]$pid
  process_name = if ($process) { $process.ProcessName } else { $null }
  window_class = $class.ToString()
  window_title = $title.ToString()
} | ConvertTo-Json -Depth 10 -Compress
`;
  const stdout: any = await spawnPwsh(['-NoProfile', '-Command', script]);
  const evidence: any = JSON.parse(stdout);
  if (!evidence.hwnd) throw new Error('foreground_hwnd_not_available');
  return evidence;
}

async function validateWindowLiveness(surface: any) : Promise<any>{
  if (!surface.hwnd) return { live: true, window_live: true, hard_failures: [], guard_drift: [], current: null };
  const current: any = await getWindowEvidence(surface.hwnd);
  const hardFailures: any = [];
  const guardDrift: any = [];
  if (!current.live) hardFailures.push('window_not_live');
  if (surface.pid && Number(surface.pid) !== Number(current.pid)) guardDrift.push('pid_mismatch');
  if (surface.process_name && surface.process_name !== current.process_name) guardDrift.push('process_mismatch');
  if (surface.window_class && surface.window_class !== current.window_class) guardDrift.push('class_mismatch');
  if (surface.window_title && surface.window_title !== current.window_title) guardDrift.push('title_mismatch');
  return {
    live: hardFailures.length === 0 && guardDrift.length === 0,
    window_live: hardFailures.length === 0,
    hard_failures: hardFailures,
    guard_drift: guardDrift,
    current,
  };
}

function surfaceRow(row: any) : any{
  return {
    surface_id: row.surface_id,
    surface_kind: row.surface_kind,
    hwnd: row.hwnd,
    pid: row.pid,
    process_name: row.process_name,
    window_class: row.window_class,
    window_title: row.window_title,
    observed_at: row.observed_at,
    observed_by: row.observed_by,
    status: row.status,
  };
}

function identityProjectionRow(row: any) : any{
  return {
    identity_id: row.identity_id,
    identity_name: row.identity_name,
    site_id: row.site_id,
    agent_name: row.agent_name,
    role: row.role,
    agent_kind: row.agent_kind,
    label: row.label,
    display_name: row.display_name,
    deprecated: row.deprecated === 1,
    superseded_by: row.superseded_by,
    previous_identity_ids: parseJson(row.previous_identity_ids_json, []),
    migration_history: parseJson(row.migration_history_json, []),
    narada_site_relation: parseJson(row.narada_site_relation_json, {}),
    role_metadata: parseJson(row.role_metadata_json, {}),
    projection_intent: parseJson(row.projection_intent_json, []),
    distinct_from: parseJson(row.distinct_from_json, []),
    carrier_projections: parseJson(row.carrier_projections_json, {}),
    label_projection: parseJson(row.label_projection_json, {}),
    input_capabilities: parseJson(row.input_capabilities_json, []),
    submit_strategy: row.submit_strategy,
    role_prompt: row.role_prompt ?? null,
    admitted_by: row.admitted_by,
    admitted_at: row.admitted_at,
    updated_at: row.updated_at,
    authority_limits: parseJson(row.authority_limits_json, []),
  };
}

function migrateWorkspacesFromProjectionIfNeeded() : any{
  const db: any = openOperatorSurfaceDb();
  const existing: any = db.prepare('SELECT COUNT(*) AS count FROM operator_surface_workspaces').get();
  if (existing.count > 0) return;
  if (!existsSync(operatorWorkspacesProjectionPath)) throw new Error('operator_workspaces_sqlite_empty_and_projection_missing');
  const state: any = JSON.parse(readFileSync(operatorWorkspacesProjectionPath, 'utf8').replace(/^\uFEFF/, ''));
  const now: any = new Date().toISOString();
  const workspaces: any = state.workspaces ?? [];
  db.transaction(() => {
    const insertWorkspace: any = db.prepare(`
      INSERT INTO operator_surface_workspaces (
        workspace_id, display_name, surface_state, intent, default_variant_id,
        monitor_count, payload_json, admitted_by, admitted_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'operator_surface_mcp_projection_migration', ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        display_name = excluded.display_name,
        surface_state = excluded.surface_state,
        intent = excluded.intent,
        default_variant_id = excluded.default_variant_id,
        monitor_count = excluded.monitor_count,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `);
    const deleteMembers: any = db.prepare('DELETE FROM operator_surface_workspace_members WHERE workspace_id = ?');
    const insertMember: any = db.prepare(`
      INSERT INTO operator_surface_workspace_members (
        workspace_id, identity_name, role_in_workspace, desired_posture,
        preferred_locus_json, sort_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const workspace of workspaces) {
      const workspaceId: any = workspace.workspace_id;
      if (!workspaceId) continue;
      insertWorkspace.run(
        workspaceId,
        workspace.display_name ?? workspaceId,
        workspace.surface_state ?? workspace.state ?? 'unknown',
        workspace.intent ?? null,
        workspace.default_variant_id ?? null,
        workspace.monitor_count ?? null,
        JSON.stringify(workspace),
        now,
        now,
      );
      deleteMembers.run(workspaceId);
      (workspace.members ?? []).forEach((member: any, index: any) => {
        if (!member.identity_name) return;
        insertMember.run(
          workspaceId,
          member.identity_name,
          member.role_in_workspace ?? member.role ?? null,
          member.desired_posture ?? null,
          JSON.stringify(member.preferred_locus ?? {}),
          index,
          now,
        );
      });
    }
  })();
}

function workspaceRecordFromPayload(payload: any, now: any, admittedBy: any) : any{
  return {
    workspace_id: payload.workspace_id,
    display_name: payload.display_name ?? payload.workspace_id,
    surface_state: payload.surface_state ?? payload.state ?? 'running',
    intent: payload.intent ?? null,
    default_variant_id: payload.default_variant_id ?? null,
    monitor_count: payload.monitor_count ?? null,
    payload,
    admitted_by: admittedBy,
    admitted_at: payload.admitted_at ?? now,
    updated_at: now,
    members: (payload.members ?? []).map((member: any, index: any) => ({
      identity_name: member.identity_name,
      role_in_workspace: member.role_in_workspace ?? member.role ?? null,
      desired_posture: member.desired_posture ?? null,
      preferred_locus: member.preferred_locus ?? {},
      sort_order: index,
    })).filter((member: any) => member.identity_name),
  };
}

function writeWorkspaceToDb(db: any, record: any) : any{
  db.transaction(() => {
    db.prepare(`
      INSERT INTO operator_surface_workspaces (
        workspace_id, display_name, surface_state, intent, default_variant_id,
        monitor_count, payload_json, admitted_by, admitted_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        display_name = excluded.display_name,
        surface_state = excluded.surface_state,
        intent = excluded.intent,
        default_variant_id = excluded.default_variant_id,
        monitor_count = excluded.monitor_count,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at,
        revoked_at = NULL,
        revoked_by = NULL
    `).run(
      record.workspace_id,
      record.display_name,
      record.surface_state,
      record.intent,
      record.default_variant_id,
      record.monitor_count,
      JSON.stringify(record.payload),
      record.admitted_by,
      record.admitted_at,
      record.updated_at,
    );
    db.prepare('DELETE FROM operator_surface_workspace_members WHERE workspace_id = ?').run(record.workspace_id);
    const insertMember: any = db.prepare(`
      INSERT INTO operator_surface_workspace_members (
        workspace_id, identity_name, role_in_workspace, desired_posture,
        preferred_locus_json, sort_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const member of record.members) {
      insertMember.run(
        record.workspace_id,
        member.identity_name,
        member.role_in_workspace,
        member.desired_posture,
        JSON.stringify(member.preferred_locus),
        member.sort_order,
        record.updated_at,
      );
    }
  })();
}

function workspaceById(workspaceId: any) : any{
  const db: any = openOperatorSurfaceDb();
  const row: any = db.prepare(`
    SELECT workspace_id, display_name, surface_state, intent, default_variant_id,
           monitor_count, payload_json, updated_at
    FROM operator_surface_workspaces
    WHERE workspace_id = ? AND revoked_at IS NULL
  `).get(workspaceId);
  if (!row) return null;
  const members: any = db.prepare(`
    SELECT identity_name, role_in_workspace, desired_posture, preferred_locus_json
    FROM operator_surface_workspace_members
    WHERE workspace_id = ?
    ORDER BY sort_order, identity_name
  `).all(workspaceId).map((member: any) => ({
    identity_name: member.identity_name,
    role_in_workspace: member.role_in_workspace,
    desired_posture: member.desired_posture,
    preferred_locus: parseJson(member.preferred_locus_json, {}),
  }));
  return {
    ...parseJson(row.payload_json, {}),
    workspace_id: row.workspace_id,
    display_name: row.display_name,
    surface_state: row.surface_state,
    intent: row.intent,
    default_variant_id: row.default_variant_id,
    monitor_count: row.monitor_count,
    updated_at: row.updated_at,
    members,
  };
}

function stampWindowLabelsProjection() : any{
  if (!existsSync(windowLabelsProjectionPath)) return;
  const state: any = JSON.parse(readFileSync(windowLabelsProjectionPath, 'utf8'));
  state.generated_from = 'sqlite:operator_surface_identities';
  state.description = 'Generated overlay label registry. Identity/profile authority lives in User Site SQLite; live HWND binding authority lives in PC Site SQLite. JSON files are compatibility projections for the current OSL renderer.';
  state.projection_authority = 'sqlite';
  state.projection_source = operatorSurfaceDbPath;
  state.runtime_binding_projection_source = operatorSurfaceRuntimeDbPath;
  state.runtime_binding_path = runtimeBindingsPath;
  state.projection_note = 'Do not edit this file as authority. Regenerate through operator_surface_project_window_labels or operator_surface_project_osl_state.';
  writeJsonFile(windowLabelsProjectionPath, state);
}

async function unwrapToolResult(result: any) : Promise<any>{
  const text: any = result?.content?.[0]?.text;
  if (!text) return result;
  return JSON.parse(text);
}

function unwrapSync(result: any) : any{
  const text: any = result?.content?.[0]?.text;
  if (!text) return result;
  return JSON.parse(text);
}

/* ─── JSON utilities ─── */
function safeJsonParse(text: any) : any{
  try { return JSON.parse(text); } catch { return undefined; }
}

function extractLastJsonObject(text: any) : any{
  for (let start = text.lastIndexOf('{'); start >= 0; start = text.lastIndexOf('{', start - 1)) {
    const candidate: any = text.slice(start).trim();
    try { return JSON.parse(candidate); } catch {}
  }
  return null;
}

function parseJson(text: any, fallback: any) : any{
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

function writeJsonFile(path: any, value: any) : any{
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}

function countFiles(root: any) : any{
  if (!existsSync(root)) return 0;
  let count: any = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path: any = join(root, entry.name);
    if (entry.isDirectory()) count += countFiles(path);
    else if (entry.isFile() || statSync(path).isFile()) count += 1;
  }
  return count;
}

function listRelativeFiles(root: any) : any{
  if (!existsSync(root)) return [];
  const files: any = [];
  function visit(dir: any) : any{
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path: any = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() || statSync(path).isFile()) files.push(relative(root, path).replace(/\\/g, '/'));
    }
  }
  visit(root);
  return files.sort();
}

function hashFile(path: any) : any{
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function compareTemplateTree(templateRoot: any, targetRoot: any) : any{
  const templateFiles: any = listRelativeFiles(templateRoot);
  const pcFiles: any = listRelativeFiles(targetRoot);
  const pcFileSet: any = new Set(pcFiles);
  const templateFileSet: any = new Set(templateFiles);
  const missing: any = [];
  const changed: any = [];
  const unchanged: any = [];

  for (const file of templateFiles) {
    const templatePath: any = join(templateRoot, ...file.split('/'));
    const targetPath: any = join(targetRoot, ...file.split('/'));
    const templateHash: any = hashFile(templatePath);
    if (!existsSync(targetPath)) {
      missing.push({ path: file, template_hash: templateHash });
      continue;
    }
    const pcHash: any = hashFile(targetPath);
    if (templateHash === pcHash) unchanged.push({ path: file, hash: templateHash });
    else changed.push({ path: file, template_hash: templateHash, pc_hash: pcHash });
  }

  const pcOnly: any = pcFiles.filter((file: any) => !templateFileSet.has(file)).map((file: any) => ({ path: file, pc_hash: hashFile(join(targetRoot, ...file.split('/'))) }));
  return {
    template_file_count: templateFiles.length,
    pc_file_count: pcFiles.length,
    template_files: templateFiles,
    missing,
    changed,
    unchanged_count: unchanged.length,
    unchanged_sample: unchanged.slice(0, 20),
    pc_only: pcOnly,
    pc_only_count: pcOnly.length,
    drift_detected: missing.length > 0 || changed.length > 0 || pcOnly.length > 0,
    template_drift_detected: missing.length > 0 || changed.length > 0,
    target_exists: existsSync(targetRoot),
    comparable_pc_files: pcFiles.filter((file: any) => templateFileSet.has(file)).length,
  };
}

function parseArgs(argv: any) : any{
  const parsed: any = { help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg: any = argv[i];
    const next: any = argv[i + 1];
    if (arg === '--site-root' && next) { parsed.siteRoot = next; i += 1; }
    else if (arg === '--pc-site-root' && next) { parsed.pcSiteRoot = next; i += 1; }
    else if (arg === '--invoke-tool' && next) { parsed.invokeTool = next; i += 1; }
    else if (arg === '--arguments-file' && next) { parsed.argumentsFile = next; i += 1; }
    else if (arg === '--help' || arg === '-h') { parsed.help = true; }
  }
  return parsed;
}

function drainJsonRpcFrames(input: any) : any{
  const requests: any = [];
  let cursor: any = 0;
  while (cursor < input.length) {
    const headerEnd: any = input.indexOf('\r\n\r\n', cursor);
    if (headerEnd < 0) break;
    const header: any = input.slice(cursor, headerEnd);
    const match: any = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error('mcp_stdio_frame_missing_content_length');
    const length: any = Number(match[1]);
    const bodyStart: any = headerEnd + 4;
    const bodyEnd: any = bodyStart + length;
    if (input.length < bodyEnd) break;
    requests.push(JSON.parse(input.slice(bodyStart, bodyEnd)));
    cursor = bodyEnd;
    while (input[cursor] === '\r' || input[cursor] === '\n') cursor += 1;
  }
  return { requests, remaining: input.slice(cursor) };
}

function parseJsonRpcInput(input: any) : any{
  const trimmed: any = input.trim();
  if (!trimmed) return [];
  if (/^Content-Length:/im.test(trimmed)) {
    const parsed: any = drainJsonRpcFrames(input);
    if (parsed.remaining.trim().length > 0) throw new Error('mcp_stdio_trailing_frame_bytes');
    return parsed.requests;
  }
  return trimmed.split(/\r?\n/).filter((line: any) => line.trim().length > 0).map((line: any) => JSON.parse(line));
}

function objectSchema(properties: any, required: any = []) : any{
  return { type: 'object', properties, additionalProperties: false, ...(required.length > 0 ? { required } : {}) };
}
function stringSchema(description: any) : any{ return { type: 'string', description }; }
function numberSchema(description: any) : any{ return { type: 'number', description }; }
function boolSchema(description: any) : any{ return { type: 'boolean', description }; }
function anyObjectSchema(description: any) : any{ return { type: 'object', description, additionalProperties: true }; }
function arraySchema(description: any) : any{ return { type: 'array', description, items: {} }; }
function jsonToolResult(value: any, isError: any = false, toolName: any = null) : any{
  return buildOutputRefToolContent({ siteRoot, toolName: toolName ?? activeOutputToolName, value, isError });
}
function asRecord(value: any) : any{ return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function stringField(record: any, key: any) : any{ const value: any = record[key]; return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined; }
function numberField(record: any, key: any) : any{ const value: any = record[key]; if (typeof value === 'number') return value; if (typeof value === 'string') { const parsed: any = Number(value); if (!Number.isNaN(parsed)) return parsed; } return undefined; }
function booleanField(record: any, key: any) : any{ const value: any = record[key]; return typeof value === 'boolean' ? value : undefined; }
function objectField(record: any, key: any) : any{ const value: any = record[key]; return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined; }
function arrayField(record: any, key: any, fallback: any = []) : any{ const value: any = record[key]; return Array.isArray(value) ? value : fallback; }
