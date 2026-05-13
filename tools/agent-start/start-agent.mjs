#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRootDir = join(__dirname, '..', '..');
const require = createRequire(import.meta.url);
const RESULT_SCHEMA = 'narada.agent_start.result.v0';
const ADMITTED_AGENTS = new Set(['narada.architect']);

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

function startEvent(identity, runtime, dryRun, now = new Date().toISOString(), siteRoot = defaultRootDir) {
  const eventId = `agent_start_${stableTimestampToken(now)}_${identityToken(identity)}`;
  return {
    schema: 'narada.agent_start.event.v0',
    event_id: eventId,
    site_id: 'narada-proper',
    site_root: siteRoot,
    identity,
    role: identity === 'narada.architect' ? 'architect' : 'unknown',
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

function codexArgs() {
  return ['--ask-for-approval', 'never', '--disable', 'shell_tool'];
}

function startupSequence() {
  return [
    {
      tool: 'agent_context_hydrate_current',
      arguments: {},
      purpose: 'hydrate the launched carrier session from inherited NARADA_* environment before operational work',
    },
  ];
}

function startupCommand() {
  return {
    name: 'agent_context_hydrate_current',
    arguments: {},
    display: 'agent_context_hydrate_current({})',
  };
}

function buildLaunchPlanFromArgs(args, options = {}) {
  const identity = args.identity;
  const runtime = args.runtime ?? 'codex';
  const dryRun = args.dry_run === true;
  const exec = args.exec === true;
  if (!identity) throw new Error('identity_required');
  if (!ADMITTED_AGENTS.has(identity)) throw new Error(`agent_not_admitted:${identity}`);
  if (runtime !== 'codex') throw new Error(`runtime_not_admitted:${runtime}`);

  const siteRoot = options.siteRoot ?? defaultRootDir;
  const now = options.now ?? new Date().toISOString();
  const event = startEvent(identity, runtime, dryRun, now, siteRoot);
  const session = carrierSession(identity, runtime, event.event_id, dryRun, now, siteRoot);
  const eventPath = dryRun ? null : writeEvent(event, siteRoot);
  const dbPath = dryRun ? agentContextDbPath(siteRoot) : materializeAgentContext({ event, session, cwd: siteRoot, siteRoot });
  const runtimeArgs = codexArgs();
  const plannedEnvironment = {
    NARADA_AGENT_ID: identity,
    NARADA_AGENT_START_EVENT_ID: event.event_id,
    NARADA_CARRIER_SESSION_ID: session.carrier_session_id,
    NARADA_SITE_ROOT: siteRoot,
    NARADA_AGENT_CONTEXT_DB: dbPath,
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
    agent_start_event_authoritative: !dryRun,
    carrier_session_authoritative: !dryRun,
    exec,
    dry_run: dryRun,
    runtime_args: runtimeArgs,
    exec_command: exec ? ['codex', ...runtimeArgs].join(' ') : null,
    planned_environment: plannedEnvironment,
    launch_environment: launchEnvironment,
    required_environment: launchEnvironment ?? plannedEnvironment,
    startup_command: startupCommand(),
    startup_command_name: startupCommand().name,
    startup_sequence: startupSequence(),
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
  ensureAgentContextSchema,
  loadSqliteDriver,
  materializeAgentContext,
  readAgentStartEvent,
  startEvent,
  startupSequence,
  writeLaunchResult,
  writeJsonResult,
};
