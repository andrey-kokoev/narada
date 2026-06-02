#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { formatAgentStartResult } from '../../packages/agent-start-renderer/src/agent-start-renderer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRootDir = join(__dirname, '..', '..');
const require = createRequire(import.meta.url);
const AGENT_TUI_MCP_RUNTIME_CONTRACT_EXPECTED = Object.freeze({
  schema: 'narada.agent_tui.mcp_runtime_contract.v0',
  mcp_fabric_env_var: 'NARADA_AGENT_TUI_ENABLE_MCP_FABRIC',
  mcp_config_env_var: 'NARADA_AGENT_TUI_MCP_CONFIG',
  site_mcp_fabric_env_var: 'NARADA_SITE_MCP_FABRIC',
  mcp_config_path_policy: 'inside_site_mcp_fabric_without_parent_traversal',
});
const AGENT_TUI_PROVIDER_ADAPTER_CONTRACT_EXPECTED = Object.freeze({
  schema: 'narada.agent_tui.provider_adapter_contract.v0',
  provider_execution_env_var: 'NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION',
  provider_adapter_kind_env_var: 'NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND',
  intelligence_provider_env_var: 'NARADA_INTELLIGENCE_PROVIDER',
  ai_model_env_var: 'NARADA_AI_MODEL',
  ai_thinking_env_var: 'NARADA_AI_THINKING',
  ai_stream_env_var: 'NARADA_AI_STREAM',
  admitted_providers: Object.freeze(['codex-subscription', 'openai-api', 'anthropic-api']),
  scripted_provider_adapter_kind: 'scripted_provider_adapter',
  production_provider_adapter_kind: 'codex_subscription_adapter',
  production_provider_adapter_implemented: true,
});
const AGENT_TUI_TERMINAL_RUNTIME_CONTRACT_EXPECTED = Object.freeze({
  schema: 'narada.agent_tui.terminal_runtime_contract.v0',
  terminal_rendering_env_var: 'NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING',
  terminal_mode_env_var: 'NARADA_AGENT_TUI_TERMINAL_MODE',
  required_terminal_mode: 'interactive_loop',
});
const AGENT_TUI_LAUNCH_SLICE_CONTRACT_EXPECTED = Object.freeze({
  schema: 'narada.agent_tui.launch_slice_contract.v0',
  admitted_runtime_slice: 'terminal_interactive_loop',
  carrier_flag: '--interactive-loop',
  tool_fabric_adapter_kind: 'narada-agent-tui-terminal-interactive-loop',
  capability_policy_terminal_session: 'interactive_terminal_control_jsonl_session_jsonl',
  terminal_mode: true,
});
const AGENT_TUI_MCP_RUNTIME_CONTRACT = parseAgentTuiMcpRuntimeContract(readFileSync(
  join(defaultRootDir, 'packages', 'agent-tui', 'contracts', 'mcp-runtime.json'),
  'utf8',
));
const AGENT_TUI_PROVIDER_ADAPTER_CONTRACT = parseAgentTuiProviderAdapterContract(readFileSync(
  join(defaultRootDir, 'packages', 'agent-tui', 'contracts', 'provider-adapters.json'),
  'utf8',
));
const AGENT_TUI_TERMINAL_RUNTIME_CONTRACT = parseAgentTuiTerminalRuntimeContract(readFileSync(
  join(defaultRootDir, 'packages', 'agent-tui', 'contracts', 'terminal-runtime.json'),
  'utf8',
));
const AGENT_TUI_LAUNCH_SLICE_CONTRACT = parseAgentTuiLaunchSliceContract(readFileSync(
  join(defaultRootDir, 'packages', 'agent-tui', 'contracts', 'launch-slice.json'),
  'utf8',
));
const RESULT_SCHEMA = 'narada.agent_start.result.v0';
const DEFAULT_PC_SITE_ROOT = process.env.NARADA_PC_SITE_ROOT ?? 'C:/ProgramData/Narada/sites/pc/desktop-sunroom-2';
const ADMITTED_AGENTS = new Set(['narada.architect', 'narada.builder', 'narada.builder2', 'narada.resident']);
const AGENT_RUNTIME_SERVER_RUNTIME = 'agent-runtime-server';
const AGENT_TUI_RUNTIME = 'agent-tui';
const LEGACY_NARS_RUNTIME = 'nars';
const ADMITTED_RUNTIMES = new Set(['codex', 'agent-cli', 'claude-code', 'narada-native', AGENT_RUNTIME_SERVER_RUNTIME, AGENT_TUI_RUNTIME, LEGACY_NARS_RUNTIME]);
const NARADA_PROPER_MCP_SERVER_NAME = 'narada-proper';
const NARADA_PROPER_APPROVED_MCP_SERVERS = [
  {
    name: NARADA_PROPER_MCP_SERVER_NAME,
    provider_locus: 'target_site_mcp',
    target_locus: 'narada_proper',
    purpose: 'target-local Narada proper MCP facade bound to this launch site root',
  },
];
const NARADA_PROPER_WITHHELD_MCP_SERVERS = [
  'narada-andrey-agent-context',
  'narada-andrey-task-lifecycle',
  'narada-andrey-shell',
  'narada-andrey-inbox',
  'narada-andrey-operator-surface',
  'narada-andrey-site-lift-catalog',
  'narada-andrey-adoptable-deltas',
  'narada-andrey-filesystem',
  'narada-andrey-test',
  'narada-andrey-adr',
];
const CLAUDE_CODE_EXECUTION_POLICY_RELATIVE_PATH = join('.narada', 'agent-carriers', 'claude-code-execution-policy.v0.json');
const CLAUDE_CODE_WITHHELD_AUTHORITIES = [
  'task_lifecycle_mutation_authority',
  'inbox_mutation_authority',
  'outbox_transport_authority',
  'repository_publication_authority',
  'site_mutation_authority',
  'credential_access',
  'native_shell_authority',
  'external_site_authority',
];
export function parseAgentTuiMcpRuntimeContract(jsonText) {
  let contract;
  try {
    contract = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`mcp_runtime_contract_parse_failed:${error.message}`);
  }
  const expected = AGENT_TUI_MCP_RUNTIME_CONTRACT_EXPECTED;
  if (contract?.schema !== expected.schema) {
    throw new Error('mcp_runtime_contract_invalid:schema');
  }
  if (contract?.mcp_fabric_env_var !== expected.mcp_fabric_env_var) {
    throw new Error('mcp_runtime_contract_invalid:mcp_fabric_env_var');
  }
  if (contract?.mcp_config_env_var !== expected.mcp_config_env_var) {
    throw new Error('mcp_runtime_contract_invalid:mcp_config_env_var');
  }
  if (contract?.site_mcp_fabric_env_var !== expected.site_mcp_fabric_env_var) {
    throw new Error('mcp_runtime_contract_invalid:site_mcp_fabric_env_var');
  }
  if (contract?.mcp_config_path_policy !== expected.mcp_config_path_policy) {
    throw new Error('mcp_runtime_contract_invalid:mcp_config_path_policy');
  }
  return contract;
}

export function parseAgentTuiProviderAdapterContract(jsonText) {
  let contract;
  try {
    contract = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`provider_adapter_contract_parse_failed:${error.message}`);
  }
  const expected = AGENT_TUI_PROVIDER_ADAPTER_CONTRACT_EXPECTED;
  if (contract?.schema !== expected.schema) {
    throw new Error('provider_adapter_contract_invalid:schema');
  }
  if (contract?.provider_execution_env_var !== expected.provider_execution_env_var) {
    throw new Error('provider_adapter_contract_invalid:provider_execution_env_var');
  }
  if (contract?.provider_adapter_kind_env_var !== expected.provider_adapter_kind_env_var) {
    throw new Error('provider_adapter_contract_invalid:provider_adapter_kind_env_var');
  }
  if (contract?.intelligence_provider_env_var !== expected.intelligence_provider_env_var) {
    throw new Error('provider_adapter_contract_invalid:intelligence_provider_env_var');
  }
  if (contract?.ai_model_env_var !== expected.ai_model_env_var) {
    throw new Error('provider_adapter_contract_invalid:ai_model_env_var');
  }
  if (contract?.ai_thinking_env_var !== expected.ai_thinking_env_var) {
    throw new Error('provider_adapter_contract_invalid:ai_thinking_env_var');
  }
  if (contract?.ai_stream_env_var !== expected.ai_stream_env_var) {
    throw new Error('provider_adapter_contract_invalid:ai_stream_env_var');
  }
  if (JSON.stringify(contract?.admitted_providers) !== JSON.stringify(expected.admitted_providers)) {
    throw new Error('provider_adapter_contract_invalid:admitted_providers');
  }
  if (contract?.scripted_provider_adapter_kind !== expected.scripted_provider_adapter_kind) {
    throw new Error('provider_adapter_contract_invalid:scripted_provider_adapter_kind');
  }
  if (contract?.production_provider_adapter_kind !== expected.production_provider_adapter_kind) {
    throw new Error('provider_adapter_contract_invalid:production_provider_adapter_kind');
  }
  if (contract?.production_provider_adapter_implemented !== expected.production_provider_adapter_implemented) {
    throw new Error('provider_adapter_contract_invalid:production_provider_adapter_implemented');
  }
  return contract;
}
export function parseAgentTuiTerminalRuntimeContract(jsonText) {
  let contract;
  try {
    contract = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`terminal_runtime_contract_parse_failed:${error.message}`);
  }
  const expected = AGENT_TUI_TERMINAL_RUNTIME_CONTRACT_EXPECTED;
  if (contract?.schema !== expected.schema) {
    throw new Error('terminal_runtime_contract_invalid:schema');
  }
  if (contract?.terminal_rendering_env_var !== expected.terminal_rendering_env_var) {
    throw new Error('terminal_runtime_contract_invalid:terminal_rendering_env_var');
  }
  if (contract?.terminal_mode_env_var !== expected.terminal_mode_env_var) {
    throw new Error('terminal_runtime_contract_invalid:terminal_mode_env_var');
  }
  if (contract?.required_terminal_mode !== expected.required_terminal_mode) {
    throw new Error('terminal_runtime_contract_invalid:required_terminal_mode');
  }
  return contract;
}

export function parseAgentTuiLaunchSliceContract(jsonText) {
  let contract;
  try {
    contract = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`launch_slice_contract_parse_failed:${error.message}`);
  }
  const expected = AGENT_TUI_LAUNCH_SLICE_CONTRACT_EXPECTED;
  if (contract?.schema !== expected.schema) {
    throw new Error('launch_slice_contract_invalid:schema');
  }
  if (contract?.admitted_runtime_slice !== expected.admitted_runtime_slice) {
    throw new Error('launch_slice_contract_invalid:admitted_runtime_slice');
  }
  if (contract?.carrier_flag !== expected.carrier_flag) {
    throw new Error('launch_slice_contract_invalid:carrier_flag');
  }
  if (contract?.tool_fabric_adapter_kind !== expected.tool_fabric_adapter_kind) {
    throw new Error('launch_slice_contract_invalid:tool_fabric_adapter_kind');
  }
  if (contract?.capability_policy_terminal_session !== expected.capability_policy_terminal_session) {
    throw new Error('launch_slice_contract_invalid:capability_policy_terminal_session');
  }
  if (contract?.terminal_mode !== expected.terminal_mode) {
    throw new Error('launch_slice_contract_invalid:terminal_mode');
  }
  return contract;
}

function parseArgs(argv) {
  const result = {};
  let i = 0;
  if (argv.length > 0 && !argv[0].startsWith('--')) {
    result.identity = argv[0];
    i = 1;
  }
  for (; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runtime') result.runtime = parseRequiredString(argv[++i], '--runtime');
    else if (arg === '--json') result.json = true;
    else if (arg === '--dry-run') result.dry_run = true;
    else if (arg === '--exec') result.exec = true;
    else if (arg === '--enable-native-shell') result.enable_native_shell = true;
    else if (arg === '--agent-tui-interactive-loop') result.agent_tui_interactive_loop = true;
    else if (arg === '--agent-tui-provider-execution') result.agent_tui_provider_execution = true;
    else if (arg === '--agent-tui-mcp-fabric') result.agent_tui_mcp_fabric = true;
    else if (arg === '--agent-tui-max-steps') result.agent_tui_max_steps = parsePositiveInteger(argv[++i], '--agent-tui-max-steps');
    else if (arg === '--agent-tui-starting-directive') result.agent_tui_starting_directive = parseRequiredString(argv[++i], '--agent-tui-starting-directive');
    else if (arg === '--agent-tui-starting-directive-file') result.agent_tui_starting_directive_file = parseRequiredString(argv[++i], '--agent-tui-starting-directive-file');
    else throw new Error(`unsupported_argument:${arg}`);
  }
  return result;
}

function parseRequiredString(value, flagName) {
  if (value === undefined) throw new Error(`missing_value:${flagName}`);
  const parsed = String(value);
  if (parsed.trim().length === 0) throw new Error(`empty_value:${flagName}`);
  return parsed;
}

function parsePositiveInteger(value, flagName) {
  if (value === undefined) throw new Error(`missing_value:${flagName}`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`invalid_positive_integer:${flagName}`);
  return parsed;
}

function stableTimestampToken(now) {
  return now.replace(/[-:.]/g, '').replace('T', '_').replace('Z', '');
}

function identityToken(identity) {
  return identity.replace(/[^A-Za-z0-9]+/g, '_');
}

function canonicalRuntime(runtime) {
  return runtime === LEGACY_NARS_RUNTIME ? AGENT_RUNTIME_SERVER_RUNTIME : runtime;
}

function identityRole(identity) {
  if (identity === 'narada.architect') return 'architect';
  if (identity === 'narada.builder' || identity === 'narada.builder2') return 'builder';
  if (identity === 'narada.resident') return 'resident';
  return 'unknown';
}

function startEvent(identity, runtime, dryRun, now = new Date().toISOString(), siteRoot = defaultRootDir) {
  const eventId = `agent_start_${stableTimestampToken(now)}_${identityToken(identity)}`;
  return {
    schema: 'narada.agent_start.event.v0',
    event_id: eventId,
    site_id: 'narada-proper',
    site_root: siteRoot,
    identity,
    role: identityRole(identity),
    runtime,
    status: dryRun ? 'planned' : 'materialized',
    materialized_at: now,
    source_state_imported: false,
    operator_surface_runtime_copied: false,
    native_shell_fallback_allowed: false,
  };
}

function carrierSession(identity, runtime, agentStartEventId, dryRun, now = new Date().toISOString(), siteRoot = defaultRootDir) {
  const carrierSessionId = `carrier_session_${stableTimestampToken(now)}_${identityToken(identity)}`;
  return {
    schema: 'narada.carrier_session.event.v0',
    carrier_session_id: carrierSessionId,
    site_id: 'narada-proper',
    site_root: siteRoot,
    identity,
    runtime,
    agent_start_event_id: agentStartEventId,
    status: dryRun ? 'planned' : 'materialized',
    created_at: now,
    parent_carrier_session_ref: null,
    parent_carrier_session_explanation: 'root_carrier_session_for_agent_start',
  };
}

function writeEvent(event, siteRoot = defaultRootDir) {
  const outDir = join(siteRoot, '.narada', 'crew', 'agent-start-events');
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${event.event_id}.json`);
  writeFileSync(path, `${JSON.stringify(event, null, 2)}\n`, 'utf8');
  return path;
}

function agentContextDbPath(siteRoot = defaultRootDir) {
  return join(siteRoot, '.ai', 'state', 'agent-context.sqlite');
}

function ensureAgentContextSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_start_events (
      event_id TEXT PRIMARY KEY,
      identity TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT,
      runtime TEXT NOT NULL,
      substrate TEXT NOT NULL,
      site_id TEXT NOT NULL,
      site_root TEXT NOT NULL,
      cwd TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      materialized_at TEXT NOT NULL,
      event_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS carrier_sessions (
      carrier_session_id TEXT PRIMARY KEY,
      agent_start_event_id TEXT NOT NULL,
      identity TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      runtime TEXT NOT NULL,
      site_id TEXT NOT NULL,
      site_root TEXT NOT NULL,
      cwd TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      parent_carrier_session_ref TEXT,
      parent_carrier_session_explanation TEXT,
      session_json TEXT NOT NULL
    );
  `);
  ensureColumns(db, 'agent_start_events', {
    event_id: 'TEXT',
    identity: 'TEXT',
    agent_id: 'TEXT',
    role: 'TEXT',
    runtime: 'TEXT',
    substrate: 'TEXT',
    site_id: 'TEXT',
    site_root: 'TEXT',
    cwd: 'TEXT',
    status: 'TEXT',
    created_at: 'TEXT',
    materialized_at: 'TEXT',
    event_json: 'TEXT',
  });
  ensureColumns(db, 'carrier_sessions', {
    carrier_session_id: 'TEXT',
    agent_start_event_id: 'TEXT',
    identity: 'TEXT',
    agent_id: 'TEXT',
    runtime: 'TEXT',
    site_id: 'TEXT',
    site_root: 'TEXT',
    cwd: 'TEXT',
    status: 'TEXT',
    created_at: 'TEXT',
    parent_carrier_session_ref: 'TEXT',
    parent_carrier_session_explanation: 'TEXT',
    session_json: 'TEXT',
  });
}

function ensureColumns(db, tableName, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name));
  for (const [columnName, columnType] of Object.entries(columns)) {
    if (!existing.has(columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
    }
  }
}

function materializeAgentContext({ event, session, cwd, siteRoot = defaultRootDir }) {
  const dbPath = agentContextDbPath(siteRoot);
  mkdirSync(dirname(dbPath), { recursive: true });
  const Database = loadSqliteDriver(siteRoot);
  const db = new Database(dbPath);
  try {
    ensureAgentContextSchema(db);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO agent_start_events (
          event_id, identity, agent_id, role, runtime, substrate, site_id, site_root,
          cwd, status, created_at, materialized_at, event_json
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `).run(
        event.event_id,
        event.identity,
        event.identity,
        event.role,
        event.runtime,
        event.runtime,
        event.site_id,
        event.site_root,
        cwd,
        event.status,
        event.materialized_at,
        event.materialized_at,
        JSON.stringify(event),
      );
      db.prepare(`
        INSERT INTO carrier_sessions (
          carrier_session_id, agent_start_event_id, identity, agent_id, runtime,
          site_id, site_root, cwd, status, created_at, parent_carrier_session_ref,
          parent_carrier_session_explanation, session_json
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?
        )
      `).run(
        session.carrier_session_id,
        session.agent_start_event_id,
        session.identity,
        session.identity,
        session.runtime,
        session.site_id,
        session.site_root,
        cwd,
        session.status,
        session.created_at,
        session.parent_carrier_session_ref,
        session.parent_carrier_session_explanation,
        JSON.stringify(session),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
  return dbPath;
}

function pcCarrierSessionRecord({ event, session, cwd, siteRoot = defaultRootDir, pcSiteRoot = DEFAULT_PC_SITE_ROOT }) {
  return {
    schema: 'narada.pc_runtime.carrier_session.v0',
    carrier_session_id: session.carrier_session_id,
    status: session.status === 'planned' ? 'planned' : 'registered',
    declared_agent_identity: event.identity,
    verified_agent_identity: event.identity,
    verification_source: 'agent_start_event',
    verification_state: 'verified',
    agent_start_event_id: event.event_id,
    substrate: event.runtime,
    carrier_kind: event.runtime,
    workspace: cwd,
    launch_source: 'narada.ps1 agent-start',
    user_site_root: siteRoot,
    pc_site_root: pcSiteRoot,
    started_at: session.created_at,
    parent_process: {
      pid: process.pid,
      evidence_kind: 'launcher_process',
    },
    operator_surface_window_evidence: null,
    restart_handle: {
      class: 'operator_manual_only_with_handle',
      handle: session.carrier_session_id,
      authority_owner: 'pc_site_runtime',
      semantics: 'Restart this launcher-bound carrier session through the operator-visible launch surface or explicit operator action.',
    },
    authority_basis: {
      kind: 'agent_launch_path',
      summary: 'Carrier session registration materialized by Narada proper agent-start before spawning the substrate child.',
    },
  };
}

function materializePcCarrierSession({ event, session, cwd, siteRoot = defaultRootDir, pcSiteRoot = DEFAULT_PC_SITE_ROOT, dryRun = false }) {
  const record = pcCarrierSessionRecord({ event, session, cwd, siteRoot, pcSiteRoot });
  const recordPath = join(pcSiteRoot, 'runtime', 'carrier-sessions', `${session.carrier_session_id}.json`);
  if (!dryRun) {
    mkdirSync(dirname(recordPath), { recursive: true });
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  }
  return {
    schema: 'narada.pc_runtime.carrier_session.registration.v0',
    status: dryRun ? 'planned' : 'registered',
    carrier_session_id: session.carrier_session_id,
    record_path: recordPath,
    record,
  };
}

function readAgentStartEvent(dbPath, eventId) {
  const Database = loadSqliteDriver(defaultRootDir);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare('SELECT event_id, identity, agent_id, runtime, substrate, site_root, cwd, status FROM agent_start_events WHERE event_id = ?').get(eventId) ?? null;
  } finally {
    db.close();
  }
}

function loadSqliteDriver() {
  try {
    return require('better-sqlite3');
  } catch (firstError) {
    const fallbackPath = join(defaultRootDir, 'node_modules', '.pnpm', 'better-sqlite3@12.9.0', 'node_modules', 'better-sqlite3');
    try {
      return require(fallbackPath);
    } catch {
      throw new Error(`sqlite_driver_unavailable: install better-sqlite3 or expose the workspace pnpm package (${firstError.message})`);
    }
  }
}

function codexMcpApprovalArgs(serverNames) {
  return serverNames.flatMap((serverName) => [
    '-c',
    `mcp_servers."${serverName}".default_tools_approval_mode="approve"`,
  ]);
}

function mcpToolApprovalPacket({ approved, withheld, note }) {
  return {
    status: 'approved_by_launcher_config',
    provider_locus: 'target_site_mcp',
    target_locus: 'narada_proper',
    approved_servers: approved,
    explicitly_not_approved: withheld,
    note,
  };
}

function naradaProperMcpCommand() {
  return 'node';
}

function naradaProperMcpEntrypoint(siteRoot) {
  return join(siteRoot, 'packages', 'narada-proper-mcp', 'src', 'main.ts');
}

function codexHomeName(identity) {
  return identity.replaceAll('.', '-');
}

function codexHomePath(siteRoot, identity = process.env.NARADA_AGENT_ID ?? 'narada.architect') {
  return join(siteRoot, '.narada', 'crew', 'codex-home', codexHomeName(identity));
}

function codexConfigPath(siteRoot, identity = process.env.NARADA_AGENT_ID ?? 'narada.architect') {
  return join(codexHomePath(siteRoot, identity), 'config.toml');
}

function codexTomlString(value) {
  return JSON.stringify(value).replaceAll('\\', '/');
}

function naradaMcpArgs(siteRoot, startupEvidence) {
  return [
    '--site-root', siteRoot,
    '--site-id', 'narada-proper',
    '--agent-id', startupEvidence.agentId,
    '--agent-role', startupEvidence.agentRole,
    '--agent-start-event-id', startupEvidence.agentStartEventId,
    '--carrier-session-id', startupEvidence.carrierSessionId,
    '--agent-context-db', startupEvidence.agentContextDb,
  ];
}

function codexHomeConfigContent(siteRoot, startupEvidence) {
  return [
    '# Generated by tools/agent-start/start-agent.mjs.',
    '# Narada proper carriers must not inherit User Site MCP servers.',
    '',
    '[mcp_servers."narada-proper"]',
    'command = ' + codexTomlString(naradaProperMcpCommand()),
    'args = ' + JSON.stringify([
      '--import',
      'tsx',
      naradaProperMcpEntrypoint(siteRoot),
      ...naradaMcpArgs(siteRoot, startupEvidence),
    ].map((value) => String(value).replaceAll('\\', '/'))),
    'default_tools_approval_mode = "approve"',
    '',
  ].join('\n');
}

function codexMcpServerArgs(siteRoot, startupEvidence) {
  return [];
}

function codexArgs({ siteRoot, startupEvidence, enableNativeShell = false }) {
  const args = [
    '--ask-for-approval',
    'never',
    ...codexMcpServerArgs(siteRoot, startupEvidence),
  ];
  if (!enableNativeShell) {
    args.push('--disable', 'shell_tool');
  }
  return args;
}
function claudeCodeArgs() {
  return [];
}

function agentRuntimeServerSessionDir(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'nars-sessions', carrierSessionId);
}

function agentRuntimeServerEntrypoint(siteRoot) {
  return join(siteRoot, 'packages', 'agent-cli', 'bin', 'agent-runtime-server.mjs');
}

function agentRuntimeServerArgs({ siteRoot, startupEvidence }) {
  return [
    agentRuntimeServerEntrypoint(siteRoot),
    '--identity', startupEvidence.agentId,
    '--session', startupEvidence.carrierSessionId,
  ];
}

function agentCliEntrypoint(siteRoot) {
  return join(siteRoot, 'packages', 'agent-cli', 'bin', 'narada-agent-cli.mjs');
}

function agentCliArgs({ siteRoot, startupEvidence }) {
  const controlPath = join(agentRuntimeServerSessionDir(siteRoot, startupEvidence.carrierSessionId), 'control.jsonl');
  return [
    agentCliEntrypoint(siteRoot),
    '--identity', startupEvidence.agentId,
    '--session', startupEvidence.carrierSessionId,
    '--control-jsonl', controlPath,
  ];
}

function agentTuiArgs({ siteRoot, startupEvidence, maxSteps = null }) {
  const sessionDir = agentRuntimeServerSessionDir(siteRoot, startupEvidence.carrierSessionId);
  const runtimeModeArgs = [AGENT_TUI_LAUNCH_SLICE_CONTRACT.carrier_flag, '--max-steps', String(maxSteps ?? 100000)];
  return [
    'run',
    '--manifest-path', join(siteRoot, 'packages', 'agent-tui', 'Cargo.toml'),
    '--bin', 'narada-agent-tui',
    '--',
    '--identity', startupEvidence.agentId,
    '--session', startupEvidence.carrierSessionId,
    '--site-root', siteRoot,
    '--control-jsonl', join(sessionDir, 'control.jsonl'),
    '--session-jsonl', join(sessionDir, 'session.jsonl'),
    ...runtimeModeArgs,
  ];
}

function agentTuiPromotionChecklist() {
  return [
    {
      id: 'rust_tests_available',
      status: 'partial',
      required_evidence: 'pnpm agent-tui:test passes in CI or documented local Rust toolchain',
      current_evidence: 'pnpm agent-tui:test passes through the quiet documented VS DevCmd wrapper; plain-shell preflight remains diagnostic until link.exe and Windows SDK libs are loaded',
    },
    {
      id: 'terminal_interactive_loop_acceptance',
      status: 'satisfied',
      required_evidence: 'scripted terminal-frame acceptance covers no blank frame, stable layout, preserved composer draft, and clean leave',
      current_evidence: 'TestBackend frame, lifecycle harness, injected-loop acceptance, terminal runtime config gates, live-composer rendering acceptance, and real terminal interactive-loop launch evidence exist; provider and MCP launch admission are separate governed-session gates.',
    },
    {
      id: 'carrier_command_acceptance',
      status: 'satisfied',
      required_evidence: '/queue, /queue clear, /queue drop <index>, and //literal slash input acceptance with session evidence for carrier-local mutations',
      current_evidence: 'Carrier command parser, runtime coordinator evidence, and Rust unit tests cover queue show/clear/drop and literal slash submission',
      source_contract: 'target-functionality.md queue commands and literal slash input',
    },
    {
      id: 'rendering_diagnostic_boundary_acceptance',
      status: 'satisfied',
      required_evidence: 'provider stderr, MCP stderr, known-noise suppression, payload threshold policy, and resize behavior are mediated without corrupting transcript or composer',
      current_evidence: 'Rendering boundary tests cover provider stderr, known-noise suppression, payload threshold policy, resize behavior, and stable renderer frames',
      source_contract: 'target-functionality.md rendering contract and carrier-protocol.md MCP/provider boundaries',
    },
    {
      id: 'payload_reference_policy_acceptance',
      status: 'satisfied',
      required_evidence: 'large or sensitive tool/provider payloads use deterministic payload references with recorded policy metadata',
      current_evidence: 'Provider output constructors, transcript projection, and payload policy tests enforce payload refs for large or sensitive provider/tool payloads',
      source_contract: 'carrier-protocol.md payload references',
    },
    {
      id: 'provider_adapter_admission',
      status: 'partial',
      required_evidence: 'production provider adapter implementation/admission, provider boundary evidence, streaming output, and tool-call boundary contracts',
      current_evidence: `Provider boundary records disabled/refused/configured posture, centralized adapter construction preserves withheld dispatch, provider request evidence records explicit streaming contract status, ${AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.scripted_provider_adapter_kind} remains available for deterministic proof, ordered text deltas project as one agent message, provider-origin tool-call bridge exists, and ${AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.production_provider_adapter_kind} is implemented behind explicit governed-session admission`,
    },
    {
      id: 'mcp_fabric_client_admission',
      status: 'partial',
      required_evidence: 'production Site MCP exposure admission, Site policy visibility, tool request/response, and tool evidence contracts',
      current_evidence: 'Policy-bound visibility model, valid tool request/result evidence, carrier MCP config parsing, JSON-RPC tools/call framing, response classification, one-shot stdio process I/O, supervisor handshake/recovery contracts, runtime session-evidence bridge, provider tool-call bridge, TurnCoordinator/RuntimeStep/interactive runtime bridge wiring, reusable per-server process executor, initialize/initialized execution, runtime-config executor construction, and preemptive timeout cancellation exist; production Site MCP exposure remains withheld by launch admission',
    },
    {
      id: 'site_rollout_acceptance',
      status: 'satisfied',
      required_evidence: 'agent-tui launches cleanly side by side with agent-cli on known sites before default carrier promotion',
      current_evidence: 'All launcher-registry Sites have accepted side-by-side agent-cli and agent-tui terminal interactive-loop launch evidence in .narada/crew/agent-tui-rollout-acceptance/latest.json',
      source_contract: 'target-functionality.md migration policy',
    },
    {
      id: 'launch_metadata_runtime_slice',
      status: 'satisfied',
      required_evidence: 'agent-start launch metadata names terminal interactive loop, provider gate, MCP gate, and toolchain readiness preflight',
    },
  ];
}

function agentTuiKnownSiteRolloutMatrix(siteRoot) {
  return [
    {
      site_id: 'narada-proper',
      site_kind: 'proper',
      launch_root: siteRoot,
      required_agent_cli_evidence: 'agent-cli launch reaches prompt with target-local narada-proper MCP tools visible',
      required_agent_tui_evidence: 'agent-tui terminal interactive-loop launch records control/session JSONL and exits cleanly',
      status: 'pending_live_acceptance',
    },
    {
      site_id: 'narada-andrey',
      site_kind: 'user',
      launch_root: null,
      required_agent_cli_evidence: 'agent-cli launch reaches prompt with User Site MCP fabric visible',
      required_agent_tui_evidence: 'agent-tui terminal interactive-loop launch records control/session JSONL without importing Narada proper authority',
      status: 'pending_live_acceptance',
    },
    {
      site_id: 'narada-staccato',
      site_kind: 'client',
      launch_root: null,
      required_agent_cli_evidence: 'agent-cli launch reaches prompt for the Staccato Site without local carrier drift',
      required_agent_tui_evidence: 'agent-tui terminal interactive-loop launch records Site-local control/session JSONL for Staccato',
      status: 'pending_live_acceptance',
    },
    {
      site_id: 'narada-revolution',
      site_kind: 'client',
      launch_root: null,
      required_agent_cli_evidence: 'agent-cli launch reaches prompt for the Revolution Site without local carrier drift',
      required_agent_tui_evidence: 'agent-tui terminal interactive-loop launch records Site-local control/session JSONL for Revolution',
      status: 'pending_live_acceptance',
    },
    {
      site_id: 'narada-timour-marketing-agent',
      site_kind: 'client',
      launch_root: null,
      required_agent_cli_evidence: 'agent-cli launch reaches prompt for the Timour Marketing Agent Site without local carrier drift',
      required_agent_tui_evidence: 'agent-tui terminal interactive-loop launch records Site-local control/session JSONL for Timour Marketing Agent',
      status: 'pending_live_acceptance',
    },
    {
      site_id: 'narada-utz',
      site_kind: 'client',
      launch_root: null,
      required_agent_cli_evidence: 'agent-cli launch reaches prompt for the Utz Site without local carrier drift',
      required_agent_tui_evidence: 'agent-tui terminal interactive-loop launch records Site-local control/session JSONL for Utz',
      status: 'pending_live_acceptance',
    },
    {
      site_id: 'narada-sonar',
      site_kind: 'project',
      launch_root: null,
      required_agent_cli_evidence: 'agent-cli launch reaches resident prompt with Site operating-loop MCP tools visible',
      required_agent_tui_evidence: 'agent-tui terminal interactive-loop launch preserves Site MCP timeout/recovery evidence boundaries',
      status: 'pending_live_acceptance',
    },
    {
      site_id: 'smart-scheduling',
      site_kind: 'project',
      launch_root: null,
      required_agent_cli_evidence: 'agent-cli launch reaches prompt using packaged agent-cli without local copy drift',
      required_agent_tui_evidence: 'agent-tui terminal interactive-loop launch uses packaged Narada proper carrier contracts without local copy drift',
      status: 'pending_live_acceptance',
    },
    {
      site_id: 'thoughts-project',
      site_kind: 'project',
      launch_root: null,
      required_agent_cli_evidence: 'agent-cli launch reaches prompt for the Thoughts Project Site without local carrier drift',
      required_agent_tui_evidence: 'agent-tui terminal interactive-loop launch records Site-local control/session JSONL for Thoughts Project',
      status: 'pending_live_acceptance',
    },
  ];
}
function agentTuiSiteRolloutAcceptance(siteRoot) {
  return {
    schema: 'narada.agent_tui.site_rollout_acceptance.v0',
    status: 'defined_not_executed',
    promotion_gate: 'agent_tui_site_rollout_acceptance_gate',
    acceptance_mode: 'side_by_side_agent_cli_then_agent_tui',
    default_promotion_allowed: true,
    known_sites: agentTuiKnownSiteRolloutMatrix(siteRoot),
    required_common_evidence: [
      'agent-tui terminal interactive-loop launch result',
      'session JSONL evidence path',
      'session JSONL evidence path',
      'control JSONL evidence path',
      'MCP fabric visibility or explicit withheld posture',
      'timeout/recovery diagnostic evidence for failed MCP startup',
    ],
    not_admitted_until: [
      'each known Site has current acceptance evidence',
      'failures are recorded as Site-specific rollout blockers',
      'Site-specific rollout blockers are recorded without changing the canonical terminal runtime slice',
    ],
  };
}

function agentTuiPromotionGate() {
  return {
    status: 'terminal_rendering_admitted',
    checklist: agentTuiPromotionChecklist(),
    reason: 'Production agent-tui launch now uses the terminal interactive-loop slice by default; provider execution and Site MCP fabric remain separately gated.',
  };
}

function agentTuiTerminalRenderingEnvironmentGate({ admitted = false } = {}) {
  return {
    variable: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.terminal_rendering_env_var,
    value: admitted ? 'yes' : 'no',
    mode_variable: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.terminal_mode_env_var,
    required_mode: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.required_terminal_mode,
    ...(admitted ? { mode_value: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.required_terminal_mode } : {}),
    operator_override_admitted: admitted,
  };
}

function agentTuiTerminalRenderingGate({ admitted = false } = {}) {
  return {
    status: admitted ? 'admitted_for_explicit_terminal_loop' : 'not_admitted_for_runtime_slice',
    admitted,
    gated_modes: ['--render-once', '--interactive-loop'],
    environment_gate: agentTuiTerminalRenderingEnvironmentGate({ admitted }),
    required_before_admission: admitted ? [] : [
      'provider_adapter_admission',
      'mcp_fabric_client_admission',
      'explicit_terminal_mode_promotion',
    ],
    current_evidence: 'Renderer frame, lifecycle, injected interactive loop, live composer, and terminal runtime config acceptance are implemented and tested.',
    reason: admitted
      ? 'Explicit operator launch requested gated terminal interactive loop; provider execution and MCP fabric remain separately withheld.'
      : 'Smoke step runs without alternate screen or interactive terminal handoff.',
    promotion_gate: 'agent_tui_terminal_rendering_promotion_gate',
  };
}

function agentTuiInteractiveLoopGate({ admitted = false, maxSteps = null } = {}) {
  return {
    mode: 'interactive_loop',
    admitted,
    required_flag: '--interactive-loop',
    max_steps: admitted ? maxSteps : null,
    environment_gate: agentTuiTerminalRenderingEnvironmentGate({ admitted }),
    promotion_gate: 'agent_tui_terminal_interactive_loop_promotion_gate',
  };
}
function agentTuiProviderExecutionGate({ admitted = false } = {}) {
  return {
    status: admitted ? 'admitted_by_explicit_governed_session_flag' : 'not_admitted_for_runtime_slice',
    adapter_contract: admitted ? 'production_adapter_admitted_for_governed_session' : 'implemented_but_not_admitted_for_production_runtime_slice',
    dispatch_authority: admitted ? 'explicitly_admitted' : 'withheld',
    environment_gate: {
      variable: AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.provider_execution_env_var,
      value: admitted ? 'yes' : 'no',
      operator_override_admitted: admitted,
    },
    promotion_gate: 'agent_tui_provider_adapter_promotion_gate',
    required_before_admission: [
      'production_provider_adapter_implementation_and_admission',
      'provider_boundary_evidence_contract',
      'streaming_turn_output_contract',
      'tool_call_boundary_contract',
    ],
    scripted_provider_adapter_kind: AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.scripted_provider_adapter_kind,
    production_provider_adapter_kind: AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.production_provider_adapter_kind,
    production_provider_adapter_implemented: AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.production_provider_adapter_implemented,
    current_evidence: `Runtime construction uses the provider adapter factory, provider request evidence records explicit streaming contract status, provider-adapters.json keeps ${AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.scripted_provider_adapter_kind} available for deterministic proof, and ${AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.production_provider_adapter_kind} is implemented behind explicit admission.`,
    reason: admitted ? 'Explicit governed-session launch admits provider dispatch for this carrier session.' : 'Terminal interactive-loop launch records provider boundary evidence without dispatching provider work unless governed-session provider execution is admitted.',
  };
}

function agentTuiMcpFabricAccessGate(siteRoot, { admitted = false } = {}) {
  return {
    status: admitted ? 'admitted_by_explicit_governed_session_flag' : 'not_admitted_for_runtime_slice',
    client_contract: admitted ? 'site_mcp_fabric_admitted_for_governed_session' : 'implemented_but_not_admitted_for_production_runtime_slice',
    tool_visibility_authority: admitted ? 'policy_bound_site_mcp' : 'withheld',
    environment_gate: {
      variable: AGENT_TUI_MCP_RUNTIME_CONTRACT.mcp_fabric_env_var,
      value: admitted ? 'yes' : 'no',
      operator_override_admitted: admitted,
    },
    promotion_gate: 'agent_tui_rust_mcp_fabric_client_promotion_gate',
    required_before_admission: [
      'production_site_mcp_exposure_admission',
      'site_mcp_policy_visibility_contract',
      'tool_call_request_response_contract',
      'tool_call_evidence_contract',
    ],
    site_mcp_fabric: join(siteRoot, '.ai', 'mcp'),
    mcp_config_path_policy: AGENT_TUI_MCP_RUNTIME_CONTRACT.mcp_config_path_policy,
    current_evidence: 'Rust MCP config parsing, policy-bound visibility, config path containment without parent traversal, JSON-RPC tools/call framing, supervised stdio execution, timeout recovery, provider tool-call bridge, and runtime-config executor construction are implemented and tested.',
    reason: admitted ? 'Explicit governed-session launch admits Site MCP fabric through policy-bound visibility for this carrier session.' : 'Terminal interactive-loop launch still withholds Site MCP tool exposure until live Site MCP execution is admitted for the carrier session.',
  };
}

function agentTuiRustToolchainReadiness(siteRoot) {
  return {
    schema: 'narada.agent_tui.rust_toolchain_readiness.command.v0',
    status: 'operator_preflight_available',
    command: 'node',
    argv: [
      join(siteRoot, 'tools', 'agent-start', 'check-agent-tui-rust-toolchain.mjs'),
    ],
    working_directory: siteRoot,
    expected_blocker: 'missing_msvc_link_exe_or_windows_sdk_lib_not_loaded',
    success_exit_code: 0,
    blocked_exit_code: 1,
  };
}

function naradaNativeArgs() {
  return [];
}
function runtimeArgsFor({ runtime, siteRoot, startupEvidence, enableNativeShell = false, agentTuiInteractiveLoop = false, agentTuiMaxSteps = null }) {
  if (runtime === 'codex') {
    return codexArgs({ siteRoot, startupEvidence, enableNativeShell });
  }
  if (runtime === 'claude-code') {
    return claudeCodeArgs();
  }
  if (runtime === 'narada-native') {
    return naradaNativeArgs();
  }
  if (runtime === 'agent-cli') {
    return agentCliArgs({ siteRoot, startupEvidence });
  }
  if (runtime === AGENT_RUNTIME_SERVER_RUNTIME) {
    return agentRuntimeServerArgs({ siteRoot, startupEvidence });
  }
  if (runtime === AGENT_TUI_RUNTIME) {
    return agentTuiArgs({ siteRoot, startupEvidence, maxSteps: agentTuiMaxSteps });
  }
  throw new Error(`runtime_not_admitted:${runtime}`);
}

function runtimeCommand(runtime) {
  if (runtime === 'codex') return 'codex';
  if (runtime === 'claude-code') return 'claude';
  if (runtime === 'narada-native') return 'narada-native-carrier';
  if (runtime === 'agent-cli') return process.execPath;
  if (runtime === AGENT_RUNTIME_SERVER_RUNTIME) return process.execPath;
  if (runtime === AGENT_TUI_RUNTIME) return 'cargo';
  throw new Error(`runtime_not_admitted:${runtime}`);
}

function runtimeKind(runtime) {
  if (runtime === 'codex') return 'codex_carrier';
  if (runtime === 'claude-code') return 'claude_code_carrier';
  if (runtime === 'narada-native') return 'narada_native_carrier';
  if (runtime === 'agent-cli') return 'agent_cli_carrier';
  if (runtime === AGENT_RUNTIME_SERVER_RUNTIME) return 'agent_runtime_server_carrier';
  if (runtime === AGENT_TUI_RUNTIME) return 'agent_tui_carrier';
  throw new Error(`runtime_not_admitted:${runtime}`);
}

function nativeShellExceptionStatus({ enableNativeShell = false, identity, siteRoot }) {
  if (!enableNativeShell) {
    return {
      status: 'disabled',
      runtime: 'codex',
      reason: 'Default Narada proper Codex posture disables the native shell_tool.',
    };
  }

  return {
    status: 'enabled_by_break_glass_flag',
    runtime: 'codex',
    authority_basis: process.env.NARADA_NATIVE_SHELL_AUTHORITY_REF ?? null,
    scope: {
      identity,
      workspace: siteRoot,
      duration: 'this launched session',
      destructive_operations: 'separately_prohibited',
    },
    note: 'This flag only prevents the launcher from passing --disable shell_tool. Codex must still expose the native shell tool in this runtime build/config.',
  };
}

function nativeExecutionPolicy({ runtime, enableNativeShell = false, identity, siteRoot }) {
  if (runtime === 'codex') {
    return {
      native_shell: nativeShellExceptionStatus({ enableNativeShell, identity, siteRoot }),
      native_scripts: {
        status: enableNativeShell ? 'not_separately_admitted' : 'disabled',
        reason: 'Native script execution is not granted by carrier launch alone.',
      },
      policy_aware_shell_mcp: {
        status: 'withheld',
        reason: 'Narada policy-aware shell MCP is a separate capability and is not mounted by this carrier launch.',
      },
    };
  }
  if (runtime === 'claude-code') {
    return {
      native_shell: {
        status: 'not_admitted_for_runtime_slice',
        runtime,
        reason: 'This first Claude Code carrier slice represents the Carrier Session and startup context without granting Claude Code native shell/tool execution.',
      },
      native_scripts: {
        status: 'not_admitted_for_runtime_slice',
        reason: 'No Claude Code native script execution policy is admitted in this slice.',
      },
      policy_aware_shell_mcp: {
        status: 'withheld',
        reason: 'Narada policy-aware shell MCP remains a separate capability and is not mounted by this carrier launch.',
      },
    };
  }
  if (runtime === 'narada-native') {
    return {
      native_shell: {
        status: 'not_admitted_for_runtime_slice',
        runtime,
        reason: 'The first Narada-native carrier slice plans Narada-owned session lifecycle and policy mediation without granting native shell execution.',
      },
      native_scripts: {
        status: 'not_admitted_for_runtime_slice',
        reason: 'Narada-native script/process execution requires a separate admitted execution carrier and command policy.',
      },
      policy_aware_shell_mcp: {
        status: 'withheld',
        reason: 'Policy-aware shell MCP remains a separate capability; the native carrier does not gain it by existing.',
      },
    };
  }
  if (runtime === 'agent-cli') {
    return {
      native_shell: {
        status: 'not_admitted_for_runtime_slice',
        runtime,
        reason: 'Interactive agent-cli mediates local tools through Site MCP fabric and does not grant native shell execution.',
      },
      native_scripts: {
        status: 'not_admitted_for_runtime_slice',
        reason: 'Interactive agent-cli process launch does not admit arbitrary script execution.',
      },
      policy_aware_shell_mcp: {
        status: 'site_fabric_only',
        reason: 'Interactive agent-cli reads only the target Site .ai/mcp fabric; shell MCP must be declared and admitted there to be visible.',
      },
    };
  }
  if (runtime === AGENT_RUNTIME_SERVER_RUNTIME) {
    return {
      native_shell: {
        status: 'not_admitted_for_runtime_slice',
        runtime,
        reason: 'Agent Runtime Server mediates local tools through Site MCP fabric and does not grant native shell execution.',
      },
      native_scripts: {
        status: 'not_admitted_for_runtime_slice',
        reason: 'Agent Runtime Server process launch does not admit arbitrary script execution.',
      },
      policy_aware_shell_mcp: {
        status: 'site_fabric_only',
        reason: 'Agent Runtime Server reads only the target Site .ai/mcp fabric; shell MCP must be declared and admitted there to be visible.',
      },
    };
  }
  if (runtime === AGENT_TUI_RUNTIME) {
    return {
      native_shell: {
        status: 'not_admitted_for_runtime_slice',
        runtime,
        reason: 'Agent TUI runtime loop scaffold mediates input through control JSONL and does not grant native shell execution.',
      },
      native_scripts: {
        status: 'not_admitted_for_runtime_slice',
        reason: 'Agent TUI process launch does not admit arbitrary script execution.',
      },
      policy_aware_shell_mcp: {
        status: 'site_fabric_only_when_admitted',
        reason: 'Agent TUI can execute policy-bound Site MCP tools only when the Site MCP fabric gate is explicitly admitted; this does not grant native shell authority.',
      },
    };
  }
  return {
    native_shell: { status: 'not_admitted_for_runtime_slice', runtime, reason: 'Runtime slice does not admit native shell execution.' },
    native_scripts: { status: 'not_admitted_for_runtime_slice', reason: 'Runtime slice does not admit arbitrary script execution.' },
    policy_aware_shell_mcp: { status: 'withheld', reason: 'Policy-aware shell MCP remains a separate capability.' },
  };
}

function claudeCodeExecutionPolicyPath(siteRoot = defaultRootDir) {
  return join(siteRoot, CLAUDE_CODE_EXECUTION_POLICY_RELATIVE_PATH);
}

function readClaudeCodeExecutionPolicy(siteRoot = defaultRootDir) {
  const path = claudeCodeExecutionPolicyPath(siteRoot);
  if (!existsSync(path)) {
    return {
      path,
      admitted: false,
      reason: 'policy_file_missing',
      repair: `Create ${CLAUDE_CODE_EXECUTION_POLICY_RELATIVE_PATH} with schema narada.agent_start.claude_code_execution_policy.v0 and process_launch_admitted=true.`,
      record: null,
    };
  }

  let record;
  try {
    record = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return {
      path,
      admitted: false,
      reason: 'policy_file_unreadable',
      repair: error instanceof Error ? error.message : String(error),
      record: null,
    };
  }

  const withheld = Array.isArray(record.withheld_authorities) ? record.withheld_authorities : [];
  const missingWithheld = CLAUDE_CODE_WITHHELD_AUTHORITIES.filter((authority) => !withheld.includes(authority));
  const admitted = record.schema === 'narada.agent_start.claude_code_execution_policy.v0'
    && record.carrier_kind === 'claude_code_carrier'
    && record.target_locus === 'narada_proper'
    && record.process_launch_admitted === true
    && missingWithheld.length === 0;

  return {
    path,
    admitted,
    reason: admitted ? 'process_launch_policy_admitted' : 'policy_file_not_admitted',
    repair: admitted
      ? null
      : 'Policy must be target-local to narada_proper, name claude_code_carrier, admit only process launch, and list every withheld authority.',
    missing_withheld_authorities: missingWithheld,
    record,
  };
}

function claudeCodeExecutionPolicyReadback(policy) {
  return {
    schema: 'narada.agent_start.claude_code_execution_policy.readback.v0',
    policy_path: policy.path,
    target_locus: policy.record?.target_locus ?? 'narada_proper',
    process_launch: {
      admitted: policy.admitted,
      reason: policy.reason,
    },
    effectful_narada_authority: {
      admitted: false,
      withheld_authorities: CLAUDE_CODE_WITHHELD_AUTHORITIES,
      rule: 'Claude Code process launch admission does not admit task, inbox, outbox, publication, Site mutation, credential, native shell, or external Site authority.',
    },
    source_site_runtime_imported: false,
    pc_runtime_authority_imported: false,
    repair: policy.repair,
    missing_withheld_authorities: policy.missing_withheld_authorities ?? [],
  };
}

function firstWorkOrientation({ identity, role, startupTaskNumber = null }) {
  const base = {
    schema: 'narada.agent_start.first_work_orientation.v0',
    target_locus: 'narada_proper',
    agent_id: identity,
    role,
    advisory_only: true,
    mutation_attempted: false,
    claim_attempted: false,
    publish_or_deploy_authority_admitted: false,
    authority_limits: [
      'startup_orientation_does_not_claim_task',
      'startup_orientation_does_not_publish_or_deploy',
      'startup_orientation_does_not_grant_credential_access',
    ],
  };

  if (startupTaskNumber !== null && startupTaskNumber !== undefined) {
    return {
      ...base,
      mode: 'explicit_task_handoff',
      task_number: startupTaskNumber,
      read_tool: {
        name: 'narada_task_read',
        arguments: {
          task_number: startupTaskNumber,
        },
      },
      claim_guidance: {
        command: `narada task claim ${startupTaskNumber} --agent ${identity} --reason "startup explicit handoff"`,
        rule: 'Claim only after reading the task and confirming it is still the intended governed work.',
      },
    };
  }

  return {
    ...base,
    mode: 'work_next_peek',
    read_tool: {
      name: 'narada_task_work_next',
      arguments: {
        agent: identity,
        claim: false,
      },
    },
    claim_guidance: {
      command: `narada task work-next --agent ${identity} --claim`,
      rule: 'Use only when the peeked governed next work remains appropriate for this role and no explicit handoff target was provided.',
    },
  };
}

function startupFirstWorkStep({ identity, role, startupTaskNumber = null }) {
  const orientation = firstWorkOrientation({ identity, role, startupTaskNumber });
  if (orientation.mode === 'explicit_task_handoff') {
    return {
      tool: 'narada_task_read',
      arguments: {
        task_number: startupTaskNumber,
      },
      purpose: 'read explicit startup task handoff for launched agent',
      depends_on: 'agent_context_memory.plan_hydration',
      output_key: 'first_work_orientation',
      first_work_orientation: orientation,
      explicit_handoff_target: true,
      mutation_attempted: false,
      claim_attempted: false,
      advisory_only: true,
    };
  }

  return {
    tool: 'narada_task_work_next',
    arguments: {
      agent: {
        from_step: 'hydrate_current',
        field: 'agent_id',
        rule: 'use verified agent_id returned by agent_context_hydrate_current',
      },
      claim: false,
    },
    purpose: 'peek governed next work for launched agent without claiming',
    depends_on: 'agent_context_memory.plan_hydration',
    output_key: 'first_work_orientation',
    first_work_orientation: orientation,
    explicit_handoff_target: false,
    mutation_attempted: false,
    claim_attempted: false,
    advisory_only: true,
  };
}

function startupSequence({ identity, role, startupTaskNumber = null } = {}) {
  const sequence = [
    {
      tool: 'agent_context_hydrate_current',
      arguments: {},
      purpose: 'hydrate launcher/site/identity evidence',
      output_key: 'hydrate_current',
      authority_posture: 'launcher_evidence_only',
      runtime_hydration_attempted: false,
    },
    {
      tool: 'agent_context_memory.plan_hydration',
      arguments: {
        named_agent_id: {
          from_step: 'hydrate_current',
          field: 'agent_id',
          rule: 'use verified agent_id returned by agent_context_hydrate_current',
        },
        requested_by: 'startup-sequence',
      },
      purpose: 'plan checkpoint continuity without mutating runtime',
      depends_on: 'hydrate_current',
      checkpoint_hydration_planned: true,
      checkpoint_summary_loaded: false,
      runtime_hydration_attempted: false,
      advisory_only: true,
      optional_next: {
        tool: 'agent_context_memory.read_checkpoint_summary',
        arguments: {
          checkpoint_id: {
            from_step: 'agent_context_memory.plan_hydration',
            field: 'selectedCheckpoint.checkpointId',
            rule: 'read only when a local checkpoint candidate is selected',
          },
        },
        purpose: 'load compact advisory continuity summary',
        advisory_only: true,
        runtime_hydration_attempted: false,
      },
    },
  ];
  if (identity && role) {
    sequence.push(startupFirstWorkStep({ identity, role, startupTaskNumber }));
  }
  return sequence;
}

function startupCommand() {
  return {
    name: 'agent_context_startup_sequence',
    arguments: {},
    display: 'agent_context_startup_sequence({})',
  };
}

function mcpToolApprovalNote(runtime, enableNativeShell, { agentTuiInteractiveLoop = false } = {}) {
  if (runtime === 'codex') {
    return enableNativeShell
      ? 'Approves only the Narada proper target-local MCP server bound to this launch site root. Native Codex shell_tool was explicitly left enabled by break-glass launcher flag. narada-andrey User Site MCP servers are not approved for this Narada proper carrier.'
      : 'Approves only the Narada proper target-local MCP server bound to this launch site root. Native Codex shell_tool remains disabled. narada-andrey User Site MCP servers are not approved for this Narada proper carrier.';
  }
  if (runtime === 'claude-code') {
    return 'Approves only the Narada proper target-local MCP server bound to this launch site root for startup/context continuity. Claude Code native execution and tool permissions are not admitted by this first carrier representation slice. narada-andrey User Site MCP servers are not approved for this Narada proper carrier.';
  }
  if (runtime === 'narada-native') {
    return 'Approves only the Narada proper target-local MCP server bound to this launch site root for startup/context continuity. Narada-native effect execution, shell, inbox, outbox, task lifecycle mutation, and publication authority remain withheld unless separately admitted.';
  }
  if (runtime === 'agent-cli') {
    return 'Interactive agent-cli reads only the target Site .ai/mcp fabric through its own MCP client. User Site MCP servers are not injected, and model-selected tool calls remain requests rather than authority.';
  }
  if (runtime === AGENT_RUNTIME_SERVER_RUNTIME) {
    return 'Agent Runtime Server reads only the target Site .ai/mcp fabric through its own MCP client. User Site MCP servers are not injected, and model-selected tool calls remain requests rather than authority.';
  }
  if (runtime === AGENT_TUI_RUNTIME) {
    return 'Agent TUI is admitted here for terminal interactive-loop rendering. It reads control JSONL and writes session JSONL; provider execution and Site MCP execution remain separately gated.';
  }
  throw new Error(`runtime_not_admitted:${runtime}`);
}
function nativeCarrierLifecyclePlan() {
  return {
    schema: 'narada.agent_start.narada_native_carrier.lifecycle_plan.v0',
    minimum_vertical: [
      { phase: 'start', status: 'planned', evidence: 'agent_start_event_id' },
      { phase: 'hydrate', status: 'planned', affordance: startupCommand() },
      { phase: 'project_capabilities', status: 'planned', posture: 'facade_only' },
      { phase: 'record_evidence', status: 'planned', evidence: 'launch_result_packet' },
      { phase: 'close', status: 'planned', posture: 'closeout_evidence_required_before_terminal_claim' },
    ],
  };
}

function claudeCodeProcessAttemptPath(result, siteRoot = defaultRootDir) {
  return join(siteRoot, '.narada', 'crew', 'agent-process-attempts', `${result.agent_start_event}.claude-code.process-attempt.json`);
}

function latestJsonPath(dir, suffix) {
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => {
      const path = join(dir, name);
      return { path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.path ?? null;
}

function claudeCodeProcessAttempt({ result, runtimeArgs, launchEnvironment, siteRoot = defaultRootDir }) {
  const environment = launchEnvironment ?? result.required_environment;
  const naradaEnvironment = Object.fromEntries(
    Object.entries(environment).filter(([key]) => key.startsWith('NARADA_')),
  );
  return {
    schema: 'narada.agent_start.claude_code_process_attempt.v0',
    status: result.dry_run ? 'planned_not_spawned' : 'ready_to_spawn',
    agent_start_event_id: result.agent_start_event,
    carrier_session_id: result.carrier_session_id,
    runtime: result.runtime,
    runtime_kind: result.runtime_kind,
    command: runtimeCommand(result.runtime),
    argv: runtimeArgs,
    cwd: siteRoot,
    policy_path: result.claude_code_launch.execution_policy.policy_path,
    process_launch_admitted: result.claude_code_launch.execution_policy.process_launch.admitted,
    startup_command: result.startup_command,
    mcp_runtime: result.mcp_runtime,
    environment_projection: {
      recorded_keys: Object.keys(naradaEnvironment),
      values: naradaEnvironment,
      raw_secret_values_recorded: false,
      non_narada_environment_inherited_at_spawn: true,
      inherited_environment_not_authority: true,
    },
    withheld_authorities: result.claude_code_launch.execution_policy.effectful_narada_authority.withheld_authorities,
    authority_non_claims: result.not_claimed,
  };
}

function writeClaudeCodeProcessAttempt(result, siteRoot = defaultRootDir) {
  if (result.runtime !== 'claude-code' || !result.exec) return null;
  const path = claudeCodeProcessAttemptPath(result, siteRoot);
  mkdirSync(dirname(path), { recursive: true });
  const attempt = {
    ...result.claude_code_process_attempt,
    status: 'recorded_before_spawn',
    recorded_at: new Date().toISOString(),
    launch_result_path: result.launch_result_path ?? null,
  };
  writeFileSync(path, `${JSON.stringify(attempt, null, 2)}\n`, 'utf8');
  result.claude_code_process_attempt = attempt;
  result.claude_code_process_attempt_path = path;
  return path;
}

function claudeCodeReadiness({ result, siteRoot = defaultRootDir }) {
  const latestLaunchResultPath = latestJsonPath(join(siteRoot, '.narada', 'crew', 'agent-start-results'), '.result.json');
  const latestProcessAttemptPath = latestJsonPath(join(siteRoot, '.narada', 'crew', 'agent-process-attempts'), '.claude-code.process-attempt.json');
  const executionPolicy = result.claude_code_launch.execution_policy;
  return {
    schema: 'narada.agent_start.claude_code_readiness.v0',
    readiness_state: executionPolicy.process_launch.admitted
      ? 'process_launch_policy_admitted'
      : 'represented_only',
    direct_sqlite_inspection_required: false,
    policy_posture: executionPolicy,
    latest_launch_evidence_path: latestLaunchResultPath,
    latest_process_attempt_evidence_path: latestProcessAttemptPath,
    current_launch_result_path: result.launch_result_path ?? null,
    current_process_attempt_path: result.claude_code_process_attempt_path ?? null,
    smoke_proof_commands: [
      'node --test tools\\agent-start\\start-agent.test.mjs',
      'node tools\\agent-start\\start-agent.mjs narada.builder --runtime claude-code --dry-run --json',
      'node tools\\agent-start\\start-agent.mjs narada.builder --runtime claude-code --exec --dry-run --json',
    ],
    withheld_authorities: executionPolicy.effectful_narada_authority.withheld_authorities,
    process_launch_is_not_authority: 'Process launch readiness does not admit task, inbox, outbox, publication, Site mutation, credential, native shell, or external Site authority.',
  };
}

function buildLaunchPlanFromArgs(args, options = {}) {
  const identity = args.identity;
  const requestedRuntime = args.runtime ?? 'codex';
  const runtime = canonicalRuntime(requestedRuntime);
  const dryRun = args.dry_run === true;
  const exec = args.exec === true;
  const enableNativeShell = args.enable_native_shell === true;
  const startupTaskNumber = args.startup_task_number ?? null;
  const agentTuiInteractiveLoop = runtime === AGENT_TUI_RUNTIME ? true : args.agent_tui_interactive_loop === true;
  const agentTuiProviderExecution = args.agent_tui_provider_execution === true;
  const agentTuiMcpFabric = args.agent_tui_mcp_fabric === true;
  const agentTuiMaxSteps = args.agent_tui_max_steps ?? null;
  const agentTuiStartingDirective = resolveAgentTuiStartingDirective(args);
  if (!ADMITTED_RUNTIMES.has(requestedRuntime)) throw new Error(`runtime_not_admitted:${requestedRuntime}`);
  if (!ADMITTED_AGENTS.has(identity)) throw new Error(`agent_not_admitted:${identity}`);
  if (!ADMITTED_RUNTIMES.has(runtime)) throw new Error(`runtime_not_admitted:${runtime}`);
  if (startupTaskNumber !== null && (!Number.isInteger(startupTaskNumber) || startupTaskNumber <= 0)) {
    throw new Error('startup_task_number_invalid');
  }
  if (agentTuiInteractiveLoop && runtime !== AGENT_TUI_RUNTIME) {
    throw new Error('agent_tui_interactive_loop_requires_agent_tui_runtime');
  }
  if (agentTuiProviderExecution && runtime !== AGENT_TUI_RUNTIME) {
    throw new Error('agent_tui_provider_execution_requires_agent_tui_runtime');
  }
  if (agentTuiMcpFabric && runtime !== AGENT_TUI_RUNTIME) {
    throw new Error('agent_tui_mcp_fabric_requires_agent_tui_runtime');
  }
  if (agentTuiMaxSteps !== null && (!Number.isInteger(agentTuiMaxSteps) || agentTuiMaxSteps <= 0)) {
    throw new Error('agent_tui_max_steps_invalid');
  }
  if (agentTuiStartingDirective !== null && runtime !== AGENT_TUI_RUNTIME) {
    throw new Error('agent_tui_starting_directive_requires_agent_tui_runtime');
  }
  const siteRoot = options.siteRoot ?? defaultRootDir;
  const claudeCodePolicy = runtime === 'claude-code' ? readClaudeCodeExecutionPolicy(siteRoot) : null;
  if (runtime === 'claude-code' && exec && !claudeCodePolicy?.admitted) throw new Error('runtime_exec_not_admitted:claude-code');
  if (runtime === 'narada-native' && exec) throw new Error('runtime_exec_not_admitted:narada-native');

  const pcSiteRoot = options.pcSiteRoot ?? DEFAULT_PC_SITE_ROOT;
  const now = options.now ?? new Date().toISOString();
  const event = startEvent(identity, runtime, dryRun, now, siteRoot);
  const session = carrierSession(identity, runtime, event.event_id, dryRun, now, siteRoot);
  const eventPath = dryRun ? null : writeEvent(event, siteRoot);
  const dbPath = dryRun ? agentContextDbPath(siteRoot) : materializeAgentContext({ event, session, cwd: siteRoot, siteRoot });
  const pcCarrierSession = materializePcCarrierSession({ event, session, cwd: siteRoot, siteRoot, pcSiteRoot, dryRun });
  const startupEvidence = {
    agentId: identity,
    agentRole: event.role,
    agentStartEventId: event.event_id,
    carrierSessionId: session.carrier_session_id,
    agentContextDb: dbPath,
  };
  const runtimeArgs = runtimeArgsFor({
    runtime,
    siteRoot,
    startupEvidence,
    enableNativeShell,
    agentTuiInteractiveLoop,
    agentTuiMaxSteps,
  });
  const runtimeUsesAgentCliMcp = runtime === 'agent-cli' || runtime === AGENT_RUNTIME_SERVER_RUNTIME;
  const runtimeUsesAgentTuiScaffold = runtime === AGENT_TUI_RUNTIME;
  const codexConfig = runtime === 'codex'
    ? (dryRun ? codexConfigPath(siteRoot, identity) : writeCodexHomeConfig(siteRoot, identity, startupEvidence))
    : null;
  const plannedEnvironment = {
    NARADA_AGENT_ID: identity,
    NARADA_AGENT_START_EVENT_ID: event.event_id,
    NARADA_CARRIER_SESSION_ID: session.carrier_session_id,
    NARADA_SITE_ROOT: siteRoot,
    NARADA_WORKSPACE_ROOT: siteRoot,
    NARADA_AGENT_CONTEXT_DB: dbPath,
    NARADA_PC_SITE_ROOT: pcSiteRoot,
    ...(runtime === AGENT_RUNTIME_SERVER_RUNTIME ? { NARADA_AGENT_RUNTIME_SERVER_SESSION_DIR: agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id) } : {}),
    ...(runtime === AGENT_TUI_RUNTIME ? {
      NARADA_AGENT_TUI_SESSION_DIR: agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id),
      [AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.provider_execution_env_var]: agentTuiProviderExecution ? 'true' : 'false',
      ...(agentTuiProviderExecution ? {
        [AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.provider_adapter_kind_env_var]: AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.production_provider_adapter_kind,
        [AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.intelligence_provider_env_var]: process.env.NARADA_INTELLIGENCE_PROVIDER ?? 'codex-subscription',
        [AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.ai_model_env_var]: process.env.NARADA_AI_MODEL ?? 'gpt-5.5',
        [AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.ai_thinking_env_var]: process.env.NARADA_AI_THINKING ?? 'medium',
        [AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.ai_stream_env_var]: process.env.NARADA_AI_STREAM ?? 'false',
      } : {}),
      [AGENT_TUI_MCP_RUNTIME_CONTRACT.mcp_fabric_env_var]: agentTuiMcpFabric ? 'true' : 'false',
      ...(agentTuiMcpFabric ? {
        [AGENT_TUI_MCP_RUNTIME_CONTRACT.mcp_config_env_var]: join(siteRoot, '.ai', 'mcp', 'config.json'),
        [AGENT_TUI_MCP_RUNTIME_CONTRACT.site_mcp_fabric_env_var]: join(siteRoot, '.ai', 'mcp'),
      } : {}),
      [AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.terminal_rendering_env_var]: agentTuiInteractiveLoop ? 'yes' : 'no',
      ...(agentTuiInteractiveLoop ? {
        [AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.terminal_mode_env_var]: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.required_terminal_mode,
      } : {}),
    } : {}),
    ...(runtime === 'codex' ? { CODEX_HOME: codexHomePath(siteRoot, identity) } : {}),
  };
  const launchEnvironment = dryRun ? null : plannedEnvironment;
  const result = {
    schema: RESULT_SCHEMA,
    status: exec && !dryRun ? 'launching' : 'planned',
    identity,
    role: event.role,
    runtime,
    runtime_aliases: requestedRuntime !== runtime ? [requestedRuntime] : [],
    tool_fabric_adapter_kind: runtime === 'codex' ? 'codex-native-mcp' : (runtimeUsesAgentCliMcp ? 'narada-agent-cli-mcp-client' : (runtimeUsesAgentTuiScaffold ? AGENT_TUI_LAUNCH_SLICE_CONTRACT.tool_fabric_adapter_kind : null)),
    resume_command: runtime,
    capability_policy: runtimeUsesAgentCliMcp
      ? {
        direct_substrate_script_execution: 'forbidden',
        script_execution_surface: 'mcp_only',
        shell_access: 'mcp_only',
        lifecycle_mutations: 'mcp_only',
      }
      : (runtimeUsesAgentTuiScaffold
          ? {
              direct_substrate_script_execution: 'forbidden',
              script_execution_surface: 'not_admitted',
              shell_access: 'not_admitted',
              lifecycle_mutations: 'not_admitted',
              terminal_session: AGENT_TUI_LAUNCH_SLICE_CONTRACT.capability_policy_terminal_session,
            }
          : null),
    agent_start_event: event.event_id,
    carrier_session_id: session.carrier_session_id,
    event_path: eventPath,
    agent_context_db_path: dbPath,
    pc_carrier_session: pcCarrierSession,
    agent_start_event_authoritative: !dryRun,
    carrier_session_authoritative: !dryRun,
    exec,
    dry_run: dryRun,
    result_sentinel: `agent_start_result_end: ${event.event_id}`,
    runtime_kind: runtimeKind(runtime),
    runtime_substrate_kind: runtime,
    runtime_args: runtimeArgs,
    transport: runtime === AGENT_RUNTIME_SERVER_RUNTIME
      ? 'jsonl_stdio'
      : (runtime === AGENT_TUI_RUNTIME
        ? (agentTuiInteractiveLoop ? 'interactive_terminal_control_jsonl_session_jsonl' : 'control_jsonl_session_jsonl')
        : null),
    agent_cli_session_dir: runtime === 'agent-cli' ? agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id) : null,
    agent_runtime_server_session_dir: runtime === AGENT_RUNTIME_SERVER_RUNTIME ? agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id) : null,
    agent_tui_session_dir: runtime === AGENT_TUI_RUNTIME ? agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id) : null,
    mcp_runtime: {
      schema: 'narada.agent_start.mcp_runtime.v0',
      server_name: NARADA_PROPER_MCP_SERVER_NAME,
      command: naradaProperMcpCommand(),
      entrypoint: naradaProperMcpEntrypoint(siteRoot),
      package_name: '@narada2/narada-proper-mcp',
      surface_id: 'narada-proper.surface.agent-facing-mcp.v1',
      transport: 'stdio',
      replaces_compatibility_facade: 'narada-mcp',
      depends_on_cli_dist: false,
      source_site_runtime_imported: false,
    },
    codex_config_path: runtime === 'codex' ? codexConfig : null,
    claude_code_launch: runtime === 'claude-code'
      ? {
          schema: 'narada.agent_start.claude_code_carrier.v0',
          status: claudeCodePolicy?.admitted ? 'process_launch_policy_admitted' : 'represented_not_executed',
          command: runtimeCommand(runtime),
          carrier_relation: 'wraps_claude_code_cli',
          startup_hydration: startupCommand(),
          execution_admitted: claudeCodePolicy?.admitted === true,
          execution_blocker: claudeCodePolicy?.admitted ? null : 'runtime_exec_not_admitted:claude-code',
          execution_policy: claudeCodeExecutionPolicyReadback(claudeCodePolicy),
      }
      : null,
    narada_native_launch: runtime === 'narada-native'
      ? {
          schema: 'narada.agent_start.narada_native_carrier.v0',
          status: 'planned_not_executed',
          command: runtimeCommand(runtime),
          carrier_relation: 'narada_owned_harness_with_pluggable_model_or_executor_adapters',
          session_identity_model: {
            agent_id: identity,
            carrier_session_id: session.carrier_session_id,
            agent_start_event_id: event.event_id,
            identity_mutable_after_start: false,
          },
          startup_hydration: startupCommand(),
          lifecycle_plan: nativeCarrierLifecyclePlan(),
          startup_hydration: startupCommand(),
          capability_posture: {
            status: 'facade_only',
            withheld_capabilities: [
              'task_lifecycle_mutation_authority',
              'inbox_authority',
              'outbox_authority',
              'repository_publication_authority',
              'native_shell_execution',
            ],
          },
          readiness: {
            direct_sqlite_inspection_required: false,
            source_state_import_required: false,
            separate_execution_carrier_required_for_exec: true,
          },
          execution_blocker: 'runtime_exec_not_admitted:narada-native',
        }
      : null,
    agent_cli_launch: runtime === 'agent-cli'
      ? {
          schema: 'narada.agent_start.agent_cli.v0',
          status: exec && !dryRun ? 'ready_to_spawn' : 'planned',
          command: runtimeCommand(runtime),
          argv: runtimeArgs,
          transport: 'interactive_stdio',
          control_transport: 'jsonl_sideband_file',
          carrier_relation: 'interactive_agent_cli',
          session_dir: agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id),
          session_path: join(agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id), 'session.jsonl'),
          control_path: join(agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id), 'control.jsonl'),
          site_mcp_fabric: join(siteRoot, '.ai', 'mcp'),
          reads_only_target_site_mcp_fabric: true,
          user_site_mcp_injected: false,
          native_shell_authority_admitted: false,
        }
      : null,
    agent_runtime_server_launch: runtime === AGENT_RUNTIME_SERVER_RUNTIME
      ? {
          schema: 'narada.agent_start.agent_runtime_server.v0',
          status: exec && !dryRun ? 'ready_to_spawn' : 'planned',
          command: runtimeCommand(runtime),
          argv: runtimeArgs,
          transport: 'jsonl_stdio',
          exec_stdout_contract: 'agent_runtime_server_protocol_only',
          launch_packet_stream_when_exec: 'stderr',
          session_dir: agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id),
          session_path: join(agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id), 'session.jsonl'),
          events_path: join(agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id), 'events.jsonl'),
          site_mcp_fabric: join(siteRoot, '.ai', 'mcp'),
          reads_only_target_site_mcp_fabric: true,
          user_site_mcp_injected: false,
          native_shell_authority_admitted: false,
        }
      : null,
    agent_tui_launch: runtime === AGENT_TUI_RUNTIME
      ? {
          schema: 'narada.agent_start.agent_tui.v0',
          status: exec && !dryRun ? 'ready_to_spawn' : 'planned',
          command: runtimeCommand(runtime),
          argv: runtimeArgs,
          transport: 'interactive_terminal_control_jsonl_session_jsonl',
          carrier_relation: 'terminal_agent_tui_interactive_loop',
          session_dir: agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id),
          session_path: join(agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id), 'session.jsonl'),
          admitted_runtime_slice: AGENT_TUI_LAUNCH_SLICE_CONTRACT.admitted_runtime_slice,
          control_path: join(agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id), 'control.jsonl'),
          starting_directive: agentTuiStartingDirective === null ? null : agentTuiStartingDirectiveLaunchPacket({
            resultIdentity: identity,
            agentStartEventId: event.event_id,
            carrierSessionId: session.carrier_session_id,
            siteRoot,
            controlPath: join(agentRuntimeServerSessionDir(siteRoot, session.carrier_session_id), 'control.jsonl'),
            text: agentTuiStartingDirective,
            createdAt: now,
          }),
          rust_toolchain_readiness: agentTuiRustToolchainReadiness(siteRoot),
          smoke_step: null,
          interactive_loop: agentTuiInteractiveLoopGate({ admitted: true, maxSteps: agentTuiMaxSteps ?? 100000 }),
          promotion_gate: agentTuiPromotionGate(),
          tui_rendering_enabled: true,
          terminal_rendering: agentTuiTerminalRenderingGate({ admitted: true }),
          provider_execution_enabled: agentTuiProviderExecution,
          provider_execution: agentTuiProviderExecutionGate({ admitted: agentTuiProviderExecution }),
          mcp_fabric_access_enabled: agentTuiMcpFabric,
          mcp_fabric_access: agentTuiMcpFabricAccessGate(siteRoot, { admitted: agentTuiMcpFabric }),
          site_rollout_acceptance: agentTuiSiteRolloutAcceptance(siteRoot),
          native_shell_authority_admitted: false,
        }
      : null,
    exec_command: exec ? [runtimeCommand(runtime), ...runtimeArgs].join(' ') : null,
    native_shell_exception: runtime === 'codex'
      ? nativeShellExceptionStatus({ enableNativeShell, identity, siteRoot })
      : nativeExecutionPolicy({ runtime, enableNativeShell, identity, siteRoot }).native_shell,
    native_execution_policy: nativeExecutionPolicy({ runtime, enableNativeShell, identity, siteRoot }),
    mcp_tool_approval: mcpToolApprovalPacket({
      approved: NARADA_PROPER_APPROVED_MCP_SERVERS,
      withheld: NARADA_PROPER_WITHHELD_MCP_SERVERS,
      note: mcpToolApprovalNote(runtime, enableNativeShell, { agentTuiInteractiveLoop }),
    }),
    planned_environment: plannedEnvironment,
    launch_environment: launchEnvironment,
    required_environment: launchEnvironment ?? plannedEnvironment,
    startup_command: startupCommand(),
    startup_command_name: startupCommand().name,
    startup_sequence: startupSequence({ identity, role: event.role, startupTaskNumber }),
    startup_first_work_orientation: firstWorkOrientation({ identity, role: event.role, startupTaskNumber }),
    dry_run_notice: dryRun
      ? 'planned_environment is non-authoritative; no agent_start_events or carrier_sessions row was created.'
      : null,
    mcp_child_environment_inheritance: {
      expected: [
        'narada-proper-mcp --agent-id',
        'narada-proper-mcp --agent-start-event-id',
        'narada-proper-mcp --carrier-session-id',
        'narada-proper-mcp --agent-context-db',
        'NARADA_AGENT_ID',
        'NARADA_AGENT_START_EVENT_ID',
        'NARADA_CARRIER_SESSION_ID',
        'NARADA_SITE_ROOT',
        'NARADA_AGENT_CONTEXT_DB',
        'NARADA_PC_SITE_ROOT',
      ],
      mechanism: 'explicit_narada_proper_mcp_arguments_with_carrier_environment_fallback',
    },
    not_claimed: [
      'task_activation_authority',
      'startup_sequence_claim_authority',
      'inbox_authority',
      'outbox_authority',
      'repository_publication_authority',
      'exact Codex resume binding',
      'operator-surface runtime binding',
      'operator-surface runtime copying',
      'source Site runtime state import',
      'secret or credential access',
    ],
  };
  if (runtime === 'claude-code') {
    result.claude_code_process_adapter = {
      schema: 'narada.agent_start.claude_code_process_adapter.v0',
      status: claudeCodePolicy?.admitted ? 'ready' : 'blocked_by_policy',
      command: runtimeCommand(runtime),
      argv: runtimeArgs,
      environment_source: 'canonical_launch_packet_required_environment',
      startup_affordance: startupCommand(),
      admits_only: 'claude_code_runtime_process_launch',
      effectful_narada_authority_admitted: false,
    };
    result.claude_code_process_attempt_path = exec ? claudeCodeProcessAttemptPath(result, siteRoot) : null;
    result.claude_code_process_attempt = exec
      ? claudeCodeProcessAttempt({ result, runtimeArgs, launchEnvironment, siteRoot })
      : null;
    result.claude_code_readiness = claudeCodeReadiness({ result, siteRoot });
  }
  return { args, event, session, runtimeArgs, result, launchEnvironment };
}

function writeCodexHomeConfig(siteRoot, identity, startupEvidence) {
  const path = codexConfigPath(siteRoot, identity);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${codexHomeConfigContent(siteRoot, startupEvidence)}\n`, 'utf8');
  return path;
}

function resolveAgentTuiStartingDirective(args) {
  const inline = args.agent_tui_starting_directive;
  const file = args.agent_tui_starting_directive_file;
  if (inline !== undefined && file !== undefined) {
    throw new Error('agent_tui_starting_directive_source_ambiguous');
  }
  if (inline === undefined && file === undefined) return null;
  const text = file !== undefined ? readFileSync(file, 'utf8') : String(inline ?? '');
  if (text.trim().length === 0) throw new Error('agent_tui_starting_directive_empty');
  return text.trimEnd();
}

function agentTuiStartingDirectiveLaunchPacket({ resultIdentity, agentStartEventId, carrierSessionId, siteRoot, controlPath, text, createdAt }) {
  const token = identityToken(`${carrierSessionId}_starting_directive`);
  return {
    schema: 'narada.agent_start.agent_tui.starting_directive.v0',
    status: 'pending_control_jsonl_materialization',
    source: 'operator_launch_argument',
    source_kind: 'system',
    source_id: 'agent-start.starting_directive',
    transport: 'startup_injection',
    delivery_mode: 'admit_for_current_turn',
    control_path: controlPath,
    control_event_id: `control_${token}`,
    input_event_id: `input_${token}`,
    directive_id: `directive_${token}`,
    authority_ref: `agent_start_event:${agentStartEventId}`,
    agent_id: resultIdentity,
    carrier_session_id: carrierSessionId,
    site_root: siteRoot,
    created_at: createdAt,
    text,
  };
}

function agentTuiStartingDirectiveControlRecord(startingDirective) {
  return {
    schema: 'narada.carrier.control.input_event.v1',
    control_event_id: startingDirective.control_event_id,
    input_event_id: startingDirective.input_event_id,
    written_at: startingDirective.created_at,
    input: {
      schema: 'narada.carrier.input_event.v1',
      event_id: startingDirective.input_event_id,
      source_kind: 'system',
      source_id: startingDirective.source_id,
      transport: 'startup_injection',
      delivery_mode: 'admit_for_current_turn',
      hold_condition: null,
      content: startingDirective.text,
      created_at: startingDirective.created_at,
      authority_ref: startingDirective.authority_ref,
      directive_id: startingDirective.directive_id,
      metadata: {
        agent_start_event_id: startingDirective.authority_ref.replace('agent_start_event:', ''),
        carrier_session_id: startingDirective.carrier_session_id,
        startup_injection: true,
        directive_provenance: {
          kind: 'operator_authorized_system_starting_directive',
          authorized_by: 'operator_launch_argument',
          emitted_by: 'agent-start',
        },
      },
    },
  };
}
function writeLaunchResult(result, siteRoot = defaultRootDir) {
  const outDir = join(siteRoot, '.narada', 'crew', 'agent-start-results');
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${result.agent_start_event}.result.json`);
  result.launch_result_path = path;
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path;
}

function materializeAgentTuiLaunchFiles(result) {
  if (result.runtime !== AGENT_TUI_RUNTIME || !result.exec || result.dry_run) return null;
  const launch = result.agent_tui_launch;
  if (!launch?.session_dir || !launch?.control_path || !launch?.session_path) {
    throw new Error('agent_tui_launch_paths_missing');
  }
  mkdirSync(launch.session_dir, { recursive: true });
  for (const path of [launch.control_path, launch.session_path]) {
    if (!existsSync(path)) writeFileSync(path, '', 'utf8');
  }
  let startingDirective = null;
  if (launch.starting_directive) {
    const existingControl = readFileSync(launch.control_path, 'utf8');
    if (existingControl.trim().length === 0) {
      const controlRecord = agentTuiStartingDirectiveControlRecord(launch.starting_directive);
      writeFileSync(launch.control_path, `${JSON.stringify(controlRecord)}\n`, 'utf8');
      startingDirective = { status: 'written', control_event_id: controlRecord.control_event_id, input_event_id: controlRecord.input_event_id };
    } else {
      startingDirective = { status: 'preserved_existing_control_jsonl' };
    }
  }
  return {
    schema: 'narada.agent_start.agent_tui_launch_files.v0',
    status: 'materialized',
    session_dir: launch.session_dir,
    control_path: launch.control_path,
    session_path: launch.session_path,
    starting_directive: startingDirective,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeJsonResult(result, output = process.stdout) {
  const payload = `${JSON.stringify(result, null, 2)}\nagent_start_result_end: ${result.agent_start_event}\n\n\n`;
  return new Promise((resolve, reject) => {
    output.write(payload, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function compactLaunchSummary(result) {
  return formatAgentStartResult(result, {
    colorEnabled: process.stdout.isTTY,
    runtime: result.runtime,
    dryRun: result.dry_run,
  });
}

function writeCompactResult(result, output = process.stdout) {
  return new Promise((resolve, reject) => {
    output.write(compactLaunchSummary(result), (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main(argv = process.argv.slice(2)) {
  const parsedArgs = parseArgs(argv);
  const jsonOutput = parsedArgs.json === true;
  const { result, launchEnvironment, runtimeArgs } = buildLaunchPlanFromArgs(parsedArgs);
  if (!result.dry_run) writeLaunchResult(result);
  if (jsonOutput) {
    const launchPacketOutput = result.runtime === AGENT_RUNTIME_SERVER_RUNTIME && result.exec && !result.dry_run
      ? process.stderr
      : process.stdout;
    await writeJsonResult(result, launchPacketOutput);
  } else if (result.runtime === AGENT_RUNTIME_SERVER_RUNTIME) {
    await writeJsonResult(result, process.stderr);
  } else {
    await writeCompactResult(result, process.stdout);
  }
  if (!result.exec || result.dry_run) return;
  if (result.runtime === 'claude-code') writeClaudeCodeProcessAttempt(result);
  materializeAgentTuiLaunchFiles(result);
  await delay(750);

  const child = spawn(runtimeCommand(result.runtime), runtimeArgs, {
    stdio: 'inherit',
    cwd: defaultRootDir,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...launchEnvironment,
    },
  });
  child.on('error', (error) => {
    console.error(`[FAIL] Failed to spawn runtime: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ schema: RESULT_SCHEMA, status: 'refused', refusals: [error instanceof Error ? error.message : String(error)] }, null, 2));
    process.exit(2);
  });
}

export {
  agentContextDbPath,
  buildLaunchPlanFromArgs,
  carrierSession,
  ensureAgentContextSchema,
  loadSqliteDriver,
  materializeAgentContext,
  readAgentStartEvent,
  readClaudeCodeExecutionPolicy,
  startEvent,
  startupSequence,
  agentTuiSiteRolloutAcceptance,
  compactLaunchSummary,
  naradaProperMcpEntrypoint,
  naradaProperMcpCommand,
  materializeAgentTuiLaunchFiles,
  writeClaudeCodeProcessAttempt,
  writeCompactResult,
  writeLaunchResult,
  writeJsonResult,
};
