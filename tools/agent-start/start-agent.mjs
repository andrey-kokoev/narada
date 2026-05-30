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
const RESULT_SCHEMA = 'narada.agent_start.result.v0';
const DEFAULT_PC_SITE_ROOT = process.env.NARADA_PC_SITE_ROOT ?? 'C:/ProgramData/Narada/sites/pc/desktop-sunroom-2';
const ADMITTED_AGENTS = new Set(['narada.architect', 'narada.builder', 'narada.builder2']);
const ADMITTED_RUNTIMES = new Set(['codex', 'agent-cli', 'claude-code', 'narada-native', 'nars']);
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
    else if (arg === '--enable-native-shell') result.enable_native_shell = true;
    else if (arg === '--startup-task') result.startup_task_number = parsePositiveInteger(argv[++i], '--startup-task');
    else throw new Error(`unsupported_argument:${arg}`);
  }
  return result;
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

function identityRole(identity) {
  if (identity === 'narada.architect') return 'architect';
  if (identity === 'narada.builder' || identity === 'narada.builder2') return 'builder';
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

function naradaNativeArgs() {
  return [];
}

function narsSessionDir(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'nars-sessions', carrierSessionId);
}

function narsEntrypoint(siteRoot) {
  return join(siteRoot, 'packages', 'agent-cli', 'bin', 'narada-agent-cli.mjs');
}

function narsArgs({ siteRoot, startupEvidence }) {
  return [
    narsEntrypoint(siteRoot),
    '--server',
    '--identity', startupEvidence.agentId,
    '--session', startupEvidence.carrierSessionId,
  ];
}

function agentCliArgs({ siteRoot, startupEvidence }) {
  const controlPath = join(narsSessionDir(siteRoot, startupEvidence.carrierSessionId), 'control.jsonl');
  return [
    narsEntrypoint(siteRoot),
    '--identity', startupEvidence.agentId,
    '--session', startupEvidence.carrierSessionId,
    '--control-jsonl', controlPath,
  ];
}

function runtimeArgsFor({ runtime, siteRoot, startupEvidence, enableNativeShell = false }) {
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
  if (runtime === 'nars') {
    return narsArgs({ siteRoot, startupEvidence });
  }
  throw new Error(`runtime_not_admitted:${runtime}`);
}

function runtimeCommand(runtime) {
  if (runtime === 'codex') return 'codex';
  if (runtime === 'claude-code') return 'claude';
  if (runtime === 'narada-native') return 'narada-native-carrier';
  if (runtime === 'agent-cli') return process.execPath;
  if (runtime === 'nars') return process.execPath;
  throw new Error(`runtime_not_admitted:${runtime}`);
}

function runtimeKind(runtime) {
  if (runtime === 'codex') return 'codex_carrier';
  if (runtime === 'claude-code') return 'claude_code_carrier';
  if (runtime === 'narada-native') return 'narada_native_carrier';
  if (runtime === 'agent-cli') return 'agent_cli_carrier';
  if (runtime === 'nars') return 'nars';
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
  if (runtime === 'nars') {
    return {
      native_shell: {
        status: 'not_admitted_for_runtime_slice',
        runtime,
        reason: 'NARS first slice mediates local tools through Site MCP fabric and does not grant native shell execution.',
      },
      native_scripts: {
        status: 'not_admitted_for_runtime_slice',
        reason: 'NARS process launch does not admit arbitrary script execution.',
      },
      policy_aware_shell_mcp: {
        status: 'site_fabric_only',
        reason: 'NARS reads only the target Site .ai/mcp fabric; shell MCP must be declared and admitted there to be visible.',
      },
    };
  }
  throw new Error(`runtime_not_admitted:${runtime}`);
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

function mcpToolApprovalNote(runtime, enableNativeShell) {
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
  if (runtime === 'nars') {
    return 'NARS reads only the target Site .ai/mcp fabric through its own MCP client. User Site MCP servers are not injected, and model-selected tool calls remain requests rather than authority.';
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
  const runtime = args.runtime ?? 'codex';
  const dryRun = args.dry_run === true;
  const exec = args.exec === true;
  const enableNativeShell = args.enable_native_shell === true;
  const startupTaskNumber = args.startup_task_number ?? null;
  if (!identity) throw new Error('identity_required');
  if (!ADMITTED_AGENTS.has(identity)) throw new Error(`agent_not_admitted:${identity}`);
  if (!ADMITTED_RUNTIMES.has(runtime)) throw new Error(`runtime_not_admitted:${runtime}`);
  if (startupTaskNumber !== null && (!Number.isInteger(startupTaskNumber) || startupTaskNumber <= 0)) {
    throw new Error('startup_task_number_invalid');
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
  const runtimeArgs = runtimeArgsFor({ runtime, siteRoot, startupEvidence, enableNativeShell });
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
    ...(runtime === 'nars' ? { NARADA_NARS_SESSION_DIR: narsSessionDir(siteRoot, session.carrier_session_id) } : {}),
    ...(runtime === 'codex' ? { CODEX_HOME: codexHomePath(siteRoot, identity) } : {}),
  };
  const launchEnvironment = dryRun ? null : plannedEnvironment;
  const result = {
    schema: RESULT_SCHEMA,
    status: exec && !dryRun ? 'launching' : 'planned',
    identity,
    role: event.role,
    runtime,
    tool_fabric_adapter_kind: runtime === 'agent-cli' ? 'narada-agent-cli-mcp-client' : null,
    resume_command: runtime,
    capability_policy: runtime === 'agent-cli'
      ? {
        direct_substrate_script_execution: 'forbidden',
        script_execution_surface: 'mcp_only',
        shell_access: 'mcp_only',
        lifecycle_mutations: 'mcp_only',
      }
      : null,
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
    transport: runtime === 'nars' ? 'jsonl_stdio' : null,
    agent_cli_session_dir: runtime === 'agent-cli' ? narsSessionDir(siteRoot, session.carrier_session_id) : null,
    nars_session_dir: runtime === 'nars' ? narsSessionDir(siteRoot, session.carrier_session_id) : null,
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
          capability_posture: {
            status: 'facade_only',
            approved_mcp_servers: NARADA_PROPER_APPROVED_MCP_SERVERS.map((server) => server.name),
            withheld_capabilities: [
              'task_lifecycle_mutation_authority',
              'inbox_admission_authority',
              'outbox_transport_authority',
              'repository_publication_authority',
              'native_shell_execution',
              'credential_access',
            ],
          },
          readiness: {
            status: 'ready_for_planned_carrier_session',
            runtime_execution_attempted: false,
            direct_sqlite_inspection_required: false,
            readback_surface: 'agent-start dry-run result packet',
          },
          lifecycle_plan: nativeCarrierLifecyclePlan(),
          execution_admitted: false,
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
          session_dir: narsSessionDir(siteRoot, session.carrier_session_id),
          session_path: join(narsSessionDir(siteRoot, session.carrier_session_id), 'session.jsonl'),
          control_path: join(narsSessionDir(siteRoot, session.carrier_session_id), 'control.jsonl'),
          site_mcp_fabric: join(siteRoot, '.ai', 'mcp'),
          reads_only_target_site_mcp_fabric: true,
          user_site_mcp_injected: false,
          native_shell_authority_admitted: false,
        }
      : null,
    nars_launch: runtime === 'nars'
      ? {
          schema: 'narada.agent_start.nars.v0',
          status: exec && !dryRun ? 'ready_to_spawn' : 'planned',
          command: runtimeCommand(runtime),
          argv: runtimeArgs,
          transport: 'jsonl_stdio',
          exec_stdout_contract: 'nars_protocol_only',
          launch_packet_stream_when_exec: 'stderr',
          session_dir: narsSessionDir(siteRoot, session.carrier_session_id),
          session_path: join(narsSessionDir(siteRoot, session.carrier_session_id), 'session.jsonl'),
          events_path: join(narsSessionDir(siteRoot, session.carrier_session_id), 'events.jsonl'),
          site_mcp_fabric: join(siteRoot, '.ai', 'mcp'),
          reads_only_target_site_mcp_fabric: true,
          user_site_mcp_injected: false,
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
      note: mcpToolApprovalNote(runtime, enableNativeShell),
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
  const { result, launchEnvironment, runtimeArgs } = buildLaunchPlanFromArgs(parsedArgs);

  if (!result.dry_run) writeLaunchResult(result);
  const jsonOutput = !!parsedArgs.json || result.dry_run || !result.exec;
  if (jsonOutput) {
    const launchPacketOutput = result.runtime === 'nars' && result.exec && !result.dry_run
      ? process.stderr
      : process.stdout;
    await writeJsonResult(result, launchPacketOutput);
  } else if (result.runtime === 'nars') {
    await writeJsonResult(result, process.stderr);
  } else {
    await writeCompactResult(result, process.stdout);
  }
  if (!result.exec || result.dry_run) return;
  if (result.runtime === 'claude-code') writeClaudeCodeProcessAttempt(result);
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
  readClaudeCodeExecutionPolicy,
  startEvent,
  startupSequence,
  compactLaunchSummary,
  naradaProperMcpEntrypoint,
  naradaProperMcpCommand,
  writeClaudeCodeProcessAttempt,
  writeCompactResult,
  writeLaunchResult,
  writeJsonResult,
};
