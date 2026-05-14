#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRootDir = join(__dirname, '..', '..');
const require = createRequire(import.meta.url);
const RESULT_SCHEMA = 'narada.agent_start.result.v0';
const DEFAULT_PC_SITE_ROOT = process.env.NARADA_PC_SITE_ROOT ?? 'C:/ProgramData/Narada/sites/pc/desktop-sunroom-2';
const NARADA_PROPER_MCP_SERVER_NAME = 'narada-proper';
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
function parseArgs(argv) {
  const result = {};
  let i = 0;
  if (argv.length > 0 && !argv[0].startsWith('--')) {
    result.identity = argv[0];
    i = 1;
  }
  for (; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runtime') result.runtime = argv[++i];
    else if (arg === '--json') result.json = true;
    else if (arg === '--dry-run') result.dry_run = true;
    else if (arg === '--exec') result.exec = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  return result;
}

function stableTimestampToken(now) {
  return now.replace(/[-:.]/g, '').replace('T', '_').replace('Z', '');
}

function identityToken(identity) {
  return identity.replace(/[^A-Za-z0-9]+/g, '_');
}

function startEvent(identity, runtime, dryRun, now = new Date().toISOString(), siteRoot = defaultRootDir, role = resolveAgentRole({ siteRoot, identity }).role) {
  const eventId = `agent_start_${stableTimestampToken(now)}_${identityToken(identity)}`;
  return {
    schema: 'narada.agent_start.event.v0',
    event_id: eventId,
    site_id: 'narada-proper',
    site_root: siteRoot,
    identity,
    role,
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

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function readJsonFile(path) {
  if (!existsSync(path)) return {};
  return asRecord(JSON.parse(readFileSync(path, 'utf8')));
}


function readTrackedMcpPolicy(siteRoot = defaultRootDir) {
  return readJsonFile(join(siteRoot, 'tools', 'agent-start', 'narada-proper.mcp-policy.json'));
}

function siteMcpConfig(siteRoot) {
  const policyPath = join(siteRoot, 'tools', 'agent-start', 'narada-proper.mcp-policy.json');
  const trackedPolicy = readTrackedMcpPolicy(siteRoot);
  if (Object.keys(trackedPolicy).length === 0) throw new Error('mcp_policy_source_missing:' + policyPath);
  return { config: trackedPolicy, source: policyPath };
}

function readRoster(siteRoot) {
  return readJsonFile(join(siteRoot, '.ai', 'agents', 'roster.json'));
}

function resolveAgentRole({ siteRoot, identity }) {
  const roster = readRoster(siteRoot);
  const agents = Array.isArray(roster.agents) ? roster.agents : [];
  const rosterEntry = agents.find((agent) => asRecord(agent).agent_id === identity);
  if (rosterEntry && typeof asRecord(rosterEntry).role === 'string') {
    return { role: asRecord(rosterEntry).role, source: join(siteRoot, '.ai', 'agents', 'roster.json') };
  }
  const trackedPolicy = siteMcpConfig(siteRoot).config;
  const admitted = asRecord(trackedPolicy.admitted_agents);
  const fallback = asRecord(admitted[identity]);
  if (typeof fallback.role === 'string') {
    return { role: fallback.role, source: join(siteRoot, 'tools', 'agent-start', 'narada-proper.mcp-policy.json#admitted_agents') };
  }
  throw new Error('agent_role_unresolved:' + identity);
}

function resolveTemplate(value, siteRoot) {
  return String(value).replaceAll('${siteRoot}', siteRoot.replaceAll('\\', '/'));
}

function localNaradaMcpCommand(siteRoot) {
  return join(siteRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'narada-mcp.cmd' : 'narada-mcp');
}

function resolveServerCommand(serverConfig, siteRoot) {
  const configured = typeof serverConfig.command === 'string'
    ? resolveTemplate(serverConfig.command, siteRoot)
    : localNaradaMcpCommand(siteRoot);
  if (/^[A-Za-z]:[\\/]/.test(configured) || configured.startsWith('/') || configured.startsWith('\\')) return configured;
  return join(siteRoot, configured);
}

function resolveServerArgs(serverConfig, siteRoot) {
  const configured = stringArray(serverConfig.args) ?? ['--site-root', '${siteRoot}', '--site-id', 'narada-proper'];
  return configured.map((arg) => resolveTemplate(arg, siteRoot));
}

function normalizeAllowedTools(serverName, allowedTools, knownTools) {
  if (allowedTools === '*') return '*';
  const tools = stringArray(allowedTools);
  if (!tools) throw new Error(`mcp_policy_invalid_allowed_tools:${serverName}`);
  if (serverName === NARADA_PROPER_MCP_SERVER_NAME) {
    const knownToolList = stringArray(asRecord(knownTools)[serverName]);
    if (!knownToolList) throw new Error(`mcp_policy_known_tools_missing:${serverName}`);
    const known = new Set(knownToolList);
    const unknown = tools.filter((tool) => !known.has(tool));
    if (unknown.length > 0) throw new Error(`mcp_policy_unknown_tool:${serverName}:${unknown.join(',')}`);
  }
  return tools;
}

function resolveMcpLaunchPolicy({ siteRoot, identity, role }) {
  const policySource = siteMcpConfig(siteRoot);
  const config = policySource.config;
  const catalog = asRecord(config.servers);
  const rolePolicies = asRecord(config.role_policies ?? config.role_mcp_policies);
  const knownTools = asRecord(config.known_tools);
  const policy = asRecord(rolePolicies[identity] ?? rolePolicies[role]);
  const policyServers = asRecord(policy.servers);
  if (Object.keys(policyServers).length === 0) throw new Error(`mcp_policy_missing:${identity}:${role}`);

  const resolvedServers = [];
  const toolPolicyServers = {};
  for (const [serverName, policyConfigValue] of Object.entries(policyServers)) {
    const serverConfig = asRecord(catalog[serverName]);
    if (Object.keys(serverConfig).length === 0) throw new Error(`mcp_policy_unknown_server:${serverName}`);
    const policyConfig = asRecord(policyConfigValue);
    const allowedTools = normalizeAllowedTools(serverName, policyConfig.allowed_tools, knownTools);
    const resolved = {
      name: serverName,
      command: resolveServerCommand(serverConfig, siteRoot),
      args: resolveServerArgs(serverConfig, siteRoot),
      provider_locus: typeof serverConfig.provider_locus === 'string' ? serverConfig.provider_locus : 'target_site_mcp',
      target_locus: typeof serverConfig.target_locus === 'string' ? serverConfig.target_locus : 'narada_proper',
      purpose: typeof serverConfig.purpose === 'string' ? serverConfig.purpose : 'Site-declared MCP server',
      allowed_tools: allowedTools,
    };
    resolvedServers.push(resolved);
    toolPolicyServers[serverName] = { allowed_tools: allowedTools };
  }

  return {
    schema: 'narada.site_mcp.launch_policy.v0',
    policy_source: policySource.source,
    agent_id: identity,
    role,
    servers: resolvedServers,
    tool_policy: {
      schema: 'narada.mcp.tool_policy.v0',
      policy_source: `${policySource.source}#role_policies`,
      agent_id: identity,
      role,
      default_server: NARADA_PROPER_MCP_SERVER_NAME,
      servers: toolPolicyServers,
    },
  };
}

function codexConfigArg(key, value) {
  return ['-c', `${key}=${value}`];
}

function codexString(value) {
  return JSON.stringify(value);
}

function codexArrayArgs(key, values) {
  return values.flatMap((value, index) => codexConfigArg(`${key}[${index}]`, codexString(value)));
}

function codexHomePath(siteRoot) {
  return join(siteRoot, '.narada', 'crew', 'codex-home', 'narada-architect');
}

function codexConfigPath(siteRoot) {
  return join(codexHomePath(siteRoot), 'config.toml');
}

function codexTomlString(value) {
  return JSON.stringify(value).replaceAll('\\', '/');
}

function codexHomeConfigContent(siteRoot, launchPolicy = resolveMcpLaunchPolicy({ siteRoot, identity: 'narada.architect', role: 'architect' })) {
  const lines = [
    '# Generated by tools/agent-start/start-agent.mjs.',
    '# Narada proper carriers must not inherit User Site MCP servers.',
    '',
  ];
  for (const server of launchPolicy.servers) {
    lines.push(
      `[mcp_servers."${server.name}"]`,
      `command = ${codexTomlString(server.command)}`,
      `args = [${server.args.map(codexTomlString).join(', ')}]`,
      'default_tools_approval_mode = "approve"',
      '',
    );
  }
  return lines.join('\n');
}

function materializeCodexHome(siteRoot, launchPolicy) {
  const homePath = codexHomePath(siteRoot);
  const configPath = codexConfigPath(siteRoot);
  mkdirSync(homePath, { recursive: true });
  writeFileSync(configPath, codexHomeConfigContent(siteRoot, launchPolicy), 'utf8');
  return { homePath, configPath };
}

function codexMcpServerArgs({ launchPolicy }) {
  return launchPolicy.servers.flatMap((server) => {
    const prefix = `mcp_servers."${server.name}"`;
    return [
      ...codexConfigArg(`${prefix}.command`, codexString(server.command)),
      ...codexArrayArgs(`${prefix}.args`, server.args),
      ...codexConfigArg(`${prefix}.default_tools_approval_mode`, codexString('approve')),
    ];
  });
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

function codexArgs({ launchPolicy }) {
  return [
    '--ask-for-approval',
    'never',
    ...codexMcpServerArgs({ launchPolicy }),
    '--disable',
    'shell_tool',
  ];
}
function startupSequence() {
  return [
    {
      tool: 'narada_site_context',
      arguments: {},
      purpose: 'verify the launched carrier is using the target-local Narada proper MCP facade',
    },
  ];
}

function startupCommand() {
  return {
    name: 'narada_site_context',
    arguments: {},
    display: 'narada_site_context({})',
  };
}

function buildLaunchPlanFromArgs(args, options = {}) {
  const identity = args.identity;
  const runtime = args.runtime ?? 'codex';
  const dryRun = args.dry_run === true;
  const exec = args.exec === true;
  if (!identity) throw new Error('identity_required');
  if (runtime !== 'codex') throw new Error(`runtime_not_admitted:${runtime}`);

  const siteRoot = options.siteRoot ?? defaultRootDir;
  const pcSiteRoot = options.pcSiteRoot ?? DEFAULT_PC_SITE_ROOT;
  const now = options.now ?? new Date().toISOString();
  const roleResolution = resolveAgentRole({ siteRoot, identity });
  const role = roleResolution.role;
  const launchPolicy = resolveMcpLaunchPolicy({ siteRoot, identity, role });
  const event = startEvent(identity, runtime, dryRun, now, siteRoot, role);
  const session = carrierSession(identity, runtime, event.event_id, dryRun, now, siteRoot);
  const eventPath = dryRun ? null : writeEvent(event, siteRoot);
  const dbPath = dryRun ? agentContextDbPath(siteRoot) : materializeAgentContext({ event, session, cwd: siteRoot, siteRoot });
  const pcCarrierSession = materializePcCarrierSession({ event, session, cwd: siteRoot, siteRoot, pcSiteRoot, dryRun });
  const codexHome = dryRun
    ? { homePath: codexHomePath(siteRoot), configPath: codexConfigPath(siteRoot) }
    : materializeCodexHome(siteRoot, launchPolicy);
  const runtimeArgs = codexArgs({ launchPolicy });
  const plannedEnvironment = {
    NARADA_AGENT_ID: identity,
    NARADA_AGENT_START_EVENT_ID: event.event_id,
    NARADA_CARRIER_SESSION_ID: session.carrier_session_id,
    NARADA_SITE_ROOT: siteRoot,
    NARADA_AGENT_CONTEXT_DB: dbPath,
    NARADA_PC_SITE_ROOT: pcSiteRoot,
    CODEX_HOME: codexHome.homePath,
    NARADA_MCP_TOOL_POLICY: JSON.stringify(launchPolicy.tool_policy),
  };
  const launchEnvironment = dryRun ? null : plannedEnvironment;
  const result = {
    schema: RESULT_SCHEMA,
    status: exec && !dryRun ? 'launching' : 'planned',
    identity,
    runtime,
    agent_start_event: event.event_id,
    carrier_session_id: session.carrier_session_id,
    event_path: eventPath,
    agent_context_db_path: dbPath,
    codex_home_path: codexHome.homePath,
    codex_config_path: codexHome.configPath,
    codex_config_authoritative: !dryRun,
    pc_carrier_session: pcCarrierSession,
    agent_start_event_authoritative: !dryRun,
    carrier_session_authoritative: !dryRun,
    exec,
    dry_run: dryRun,
    runtime_args: runtimeArgs,
    exec_command: exec ? ['codex', ...runtimeArgs].join(' ') : null,
    mcp_tool_approval: mcpToolApprovalPacket({
      approved: launchPolicy.servers.map(({ name, provider_locus, target_locus, purpose, allowed_tools }) => ({ name, provider_locus, target_locus, purpose, allowed_tools })),
      withheld: NARADA_PROPER_WITHHELD_MCP_SERVERS,
      note: 'Approves only the Narada proper target-local MCP server bound to this launch site root. Native Codex shell_tool remains disabled. narada-andrey User Site MCP servers are explicitly not approved for this Narada proper carrier.',
    }),
    mcp_config_isolation: {
      status: dryRun ? 'planned' : 'materialized',
      mechanism: 'CODEX_HOME',
      codex_home_path: codexHome.homePath,
      codex_config_path: codexHome.configPath,
      allowed_servers: launchPolicy.servers.map((server) => server.name),
      denied_inherited_servers: NARADA_PROPER_WITHHELD_MCP_SERVERS,
      rule: 'Spawned Codex must load the target-local config home so global/User Site MCP servers are not present.',
    },
    agent_role_source: roleResolution.source,
    mcp_policy_source: launchPolicy.policy_source,
    resolved_mcp_servers: launchPolicy.servers,
    resolved_tool_policy: launchPolicy.tool_policy,
    mcp_policy_enforcement: { launch: 'hard_fail', runtime: 'mcp_server' },
    planned_environment: plannedEnvironment,
    launch_environment: launchEnvironment,
    required_environment: launchEnvironment ?? plannedEnvironment,
    startup_command: startupCommand({ identity }),
    startup_command_name: startupCommand({ identity }).name,
    startup_sequence: startupSequence({ identity }),
    dry_run_notice: dryRun
      ? 'planned_environment is non-authoritative; no agent_start_events or carrier_sessions row was created.'
      : null,
    mcp_child_environment_inheritance: {
      expected: [
        'NARADA_AGENT_ID',
        'NARADA_AGENT_START_EVENT_ID',
        'NARADA_CARRIER_SESSION_ID',
        'NARADA_SITE_ROOT',
        'NARADA_AGENT_CONTEXT_DB',
        'NARADA_PC_SITE_ROOT',
        'CODEX_HOME',
        'NARADA_MCP_TOOL_POLICY',
      ],
      mechanism: 'stdio_mcp_children_inherit_from_codex_carrier_process_environment',
    },
    not_claimed: [
      'exact Codex resume binding',
      'operator-surface runtime binding',
      'operator-surface runtime copying',
      'source Site runtime state import',
      'secret or credential access',
    ],
  };
  return { args, event, session, runtimeArgs, result, launchEnvironment };
}

function writeLaunchResult(result, siteRoot = defaultRootDir) {
  const outDir = join(siteRoot, '.narada', 'crew', 'agent-start-results');
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${result.agent_start_event}.result.json`);
  result.launch_result_path = path;
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeJsonResult(result) {
  const payload = `${JSON.stringify(result, null, 2)}\nagent_start_result_end: ${result.agent_start_event}\n\n\n`;
  return new Promise((resolve, reject) => {
    process.stdout.write(payload, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main(argv = process.argv.slice(2)) {
  const { result, launchEnvironment, runtimeArgs } = buildLaunchPlanFromArgs(parseArgs(argv));

  if (!result.dry_run) writeLaunchResult(result);
  await writeJsonResult(result);
  if (!result.exec || result.dry_run) return;
  await delay(750);

  const child = spawn('codex', runtimeArgs, {
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
  try {
    await main();
  } catch (error) {
    console.error(JSON.stringify({ schema: RESULT_SCHEMA, status: 'refused', refusals: [error instanceof Error ? error.message : String(error)] }, null, 2));
    process.exit(2);
  }
}

export {
  agentContextDbPath,
  buildLaunchPlanFromArgs,
  carrierSession,
  codexConfigPath,
  codexHomeConfigContent,
  codexHomePath,
  ensureAgentContextSchema,
  loadSqliteDriver,
  materializeCodexHome,
  resolveAgentRole,
  resolveMcpLaunchPolicy,
  materializeAgentContext,
  readAgentStartEvent,
  startEvent,
  startupSequence,
  writeLaunchResult,
  writeJsonResult,
};
