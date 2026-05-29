#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { resolveDeprecatedNaradaAndreySiteLocus } from '../site-locus-shim.mjs';
import { buildOutputRefToolContent } from '../mcp-payload-file.mjs';

const require = createRequire(new URL('../agent-context/agent-context-mcp-server.mjs', import.meta.url));
const Database = require('better-sqlite3');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'narada-adoptable-deltas-mcp';
const SERVER_VERSION = '0.1.0';
const KINDS = new Set(['package', 'code', 'governance', 'capability', 'policy', 'schema', 'site_lift', 'crossing_surface']);
const STATES = new Set(['observed', 'available', 'applicable', 'admitted', 'blocked', 'rejected', 'superseded']);
const ACTIONABLE_STATES = new Set(['observed', 'available', 'applicable', 'admitted', 'blocked']);
const CREATE_STATES = new Set(['observed', 'available']);

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write('Usage: node tools/adoptable-deltas/adoptable-deltas-mcp-server.mjs --site-root <path>\n');
  process.exit(0);
}

const siteRoot = resolve(options.siteRoot ?? process.cwd());
const dbPath = join(siteRoot, '.ai', 'state', 'adoptable-deltas.sqlite');
let db;
let activeOutputToolName = null;

runStdioServer().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function runStdioServer() {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;
    let requests = [];
    if (buffer.includes('Content-Length:')) {
      const drained = drainJsonRpcFrames(buffer);
      buffer = drained.remaining;
      requests = drained.requests;
    } else {
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      requests = lines.filter((line) => line.trim()).map((line) => JSON.parse(line));
    }
    for (const request of requests) {
      const response = handleRequest(request);
      if (response) writeMcpFrame(response);
    }
  }
}

function writeMcpFrame(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function handleRequest(request) {
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  try {
    return { jsonrpc: '2.0', id: request.id ?? null, result: dispatchMethod(request.method, request.params ?? {}) };
  } catch (error) {
    return { jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } };
  }
}

function dispatchMethod(method, params) {
  switch (method) {
    case 'initialize':
      return { protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } };
    case 'tools/list':
      return { tools: tools() };
    case 'tools/call':
      return callTool(params);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function callTool(params) {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');
  activeOutputToolName = name;
  switch (name) {
    case 'adoptable_delta_doctor':
      return jsonToolResult(doctor());
    case 'adoptable_delta_record':
      return jsonToolResult(recordEvent(args));
    case 'adoptable_delta_list':
      return jsonToolResult(listDeltas(args));
    case 'adoptable_delta_show':
      return jsonToolResult(showDelta(args));
    case 'adoptable_delta_history':
      return jsonToolResult(history(args));
    case 'adoptable_delta_next':
      return jsonToolResult(nextDelta(args));
    default:
      throw new Error(`adoptable_delta_refused_unknown_tool: ${name}`);
  }
}

function tools() {
  return [
    { name: 'adoptable_delta_doctor', description: 'Inspect Adoptable Delta MCP readiness and SQLite authority status. Read-only.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'adoptable_delta_record', description: 'Append one adoptable-delta event and update the projection transactionally.', inputSchema: { type: 'object', additionalProperties: true } },
    { name: 'adoptable_delta_list', description: 'List current adoptable-delta projections with optional filters. Read-only.', inputSchema: { type: 'object', additionalProperties: false, properties: filterSchema() } },
    { name: 'adoptable_delta_show', description: 'Show one current adoptable-delta projection. Read-only.', inputSchema: { type: 'object', required: ['delta_id'], additionalProperties: false, properties: { delta_id: { type: 'string' } } } },
    { name: 'adoptable_delta_history', description: 'Show append-only event history for one delta. Read-only.', inputSchema: { type: 'object', required: ['delta_id'], additionalProperties: false, properties: { delta_id: { type: 'string' }, limit: { type: 'integer' } } } },
    { name: 'adoptable_delta_next', description: 'Return a read-only next adoptable-delta signal. Does not create tasks or claims.', inputSchema: { type: 'object', additionalProperties: false, properties: { target_site: { type: 'string' }, linked_task_number: { type: 'integer' }, limit: { type: 'integer' } } } },
  ];
}

function filterSchema() {
  return {
    kind: { type: 'string' },
    state: { type: 'string' },
    source_site: { type: 'string' },
    target_site: { type: 'string' },
    linked_task_number: { type: 'integer' },
    limit: { type: 'integer' },
  };
}

function doctor() {
  const database = ensureDb();
  return {
    status: 'ok',
    schema: 'narada.adoptable_delta.doctor.v0',
    authority: 'adoptable_delta_sqlite',
    db_path: dbPath,
    db_exists: existsSync(dbPath),
    append_only_events: true,
    event_count: database.prepare('SELECT COUNT(*) AS count FROM available_delta_events').get().count,
    current_count: database.prepare('SELECT COUNT(*) AS count FROM available_delta_current_state').get().count,
    canonical_tools: tools().map((tool) => tool.name),
    supported_kinds: [...KINDS],
    supported_states: [...STATES],
  };
}

function recordEvent(args) {
  const database = ensureDb();
  const event = validateAndBuildEvent(database, args);
  const current = {
    schema: 'narada.adoptable_delta.current_state.v0',
    delta_id: event.delta_id,
    kind: event.kind,
    state_after: event.state_after,
    title: event.title,
    summary: event.summary,
    source_site: event.source_site,
    target_site: event.target_site,
    actor_agent_id: event.actor_agent_id,
    authority_basis: event.authority_basis,
    authority_required: event.authority_required,
    next_surface: event.next_surface,
    risk: event.risk,
    artifact_refs: event.artifact_refs,
    evidence_refs: event.evidence_refs,
    linked_task_number: event.linked_task_number,
    last_event_id: event.event_id,
    last_event_at: event.created_at,
    projection_not_authority: true,
    authority: 'available_delta_events',
  };

  database.transaction(() => {
    database.prepare(`
      INSERT INTO available_delta_events (
        event_id, delta_id, kind, state_after, title, summary, source_site, target_site,
        actor_agent_id, authority_basis_json, authority_required, next_surface, risk,
        artifact_refs_json, evidence_refs_json, linked_task_number, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(event.event_id, event.delta_id, event.kind, event.state_after, event.title, event.summary, event.source_site, event.target_site, event.actor_agent_id, JSON.stringify(event.authority_basis), event.authority_required, event.next_surface, event.risk, JSON.stringify(event.artifact_refs), JSON.stringify(event.evidence_refs), event.linked_task_number, event.created_at, JSON.stringify(event));
    database.prepare(`
      INSERT INTO available_delta_current_state (
        delta_id, kind, state_after, title, summary, source_site, target_site, actor_agent_id,
        authority_basis_json, authority_required, next_surface, risk, artifact_refs_json,
        evidence_refs_json, linked_task_number, last_event_id, last_event_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(delta_id) DO UPDATE SET
        kind = excluded.kind, state_after = excluded.state_after, title = excluded.title,
        summary = excluded.summary, source_site = excluded.source_site, target_site = excluded.target_site,
        actor_agent_id = excluded.actor_agent_id, authority_basis_json = excluded.authority_basis_json,
        authority_required = excluded.authority_required, next_surface = excluded.next_surface, risk = excluded.risk,
        artifact_refs_json = excluded.artifact_refs_json, evidence_refs_json = excluded.evidence_refs_json,
        linked_task_number = excluded.linked_task_number, last_event_id = excluded.last_event_id,
        last_event_at = excluded.last_event_at, payload_json = excluded.payload_json
    `).run(event.delta_id, event.kind, event.state_after, event.title, event.summary, event.source_site, event.target_site, event.actor_agent_id, JSON.stringify(event.authority_basis), event.authority_required, event.next_surface, event.risk, JSON.stringify(event.artifact_refs), JSON.stringify(event.evidence_refs), event.linked_task_number, event.event_id, event.created_at, JSON.stringify(current));
  })();

  return { status: 'recorded', schema: 'narada.adoptable_delta.record_result.v0', authority: 'adoptable_delta_sqlite', no_task_creation: true, no_task_claim: true, event, current_state_projection: current };
}

function validateAndBuildEvent(database, args) {
  const kind = requiredString(args, 'kind');
  const stateAfter = requiredString(args, 'state_after');
  if (!KINDS.has(kind)) throw new Error(`invalid_adoptable_delta_kind: ${kind}`);
  if (!STATES.has(stateAfter)) throw new Error(`invalid_adoptable_delta_state: ${stateAfter}`);
  const actorAgentId = requiredString(args, 'actor_agent_id');
  assertBoundIdentity(actorAgentId);
  const suppliedDeltaId = stringField(args, 'delta_id');
  if (suppliedDeltaId) validateDeltaId(suppliedDeltaId);
  const existing = suppliedDeltaId ? database.prepare('SELECT 1 FROM available_delta_current_state WHERE delta_id = ?').get(suppliedDeltaId) : null;
  if (!existing && !CREATE_STATES.has(stateAfter)) throw new Error(`adoptable_delta_state_requires_existing_delta: ${stateAfter}`);
  const authorityBasis = objectField(args, 'authority_basis');
  validateAuthorityBasis(authorityBasis);
  const evidenceRefs = arrayField(args, 'evidence_refs');
  validateRefs('evidence_refs', evidenceRefs, true);
  const artifactRefs = arrayField(args, 'artifact_refs');
  validateRefs('artifact_refs', artifactRefs, false);
  const sourceSite = resolveDeprecatedNaradaAndreySiteLocus(requiredString(args, 'source_site'), {
    resolvedSiteLocus: 'narada-user-site',
    resolutionBasis: 'adoptable_delta_record source_site from this User Site MCP process',
    removalCondition: 'Remove when adoptable_delta_record callers send source_site=narada-user-site.',
  });
  const targetSite = resolveDeprecatedNaradaAndreySiteLocus(requiredString(args, 'target_site'), {
    resolvedSiteLocus: 'narada-user-site',
    resolutionBasis: 'adoptable_delta_record target_site explicitly names the current User Site compatibility name',
    removalCondition: 'Remove when adoptable_delta_record callers send target_site=narada-user-site or a different canonical target Site.',
  });
  const deprecatedSiteLocusShims = [sourceSite.shim, targetSite.shim].filter(Boolean);
  return {
    schema: 'narada.adoptable_delta.event.v0',
    event_id: `adeltaevt_${randomUUID().replace(/-/g, '')}`,
    delta_id: suppliedDeltaId ?? `adelta_${randomUUID().replace(/-/g, '')}`,
    kind,
    state_after: stateAfter,
    title: requiredString(args, 'title'),
    summary: requiredString(args, 'summary'),
    source_site: sourceSite.value,
    target_site: targetSite.value,
    actor_agent_id: actorAgentId,
    authority_basis: authorityBasis,
    authority_required: requiredString(args, 'authority_required'),
    next_surface: requiredString(args, 'next_surface'),
    risk: requiredString(args, 'risk'),
    artifact_refs: artifactRefs,
    evidence_refs: evidenceRefs,
    linked_task_number: integerField(args, 'linked_task_number'),
    created_at: new Date().toISOString(),
    append_only_authority: true,
    execution_authority: false,
    ...(deprecatedSiteLocusShims.length > 0 ? { deprecated_site_locus_shims: deprecatedSiteLocusShims } : {}),
  };
}

function listDeltas(args) {
  const rows = queryCurrent(args);
  return { status: 'ok', schema: 'narada.adoptable_delta.list.v0', authority: 'adoptable_delta_sqlite_projection', count: rows.length, deltas: rows.map(parseCurrentRow) };
}

function showDelta(args) {
  const deltaId = requiredString(args, 'delta_id');
  validateDeltaId(deltaId);
  const row = ensureDb().prepare('SELECT * FROM available_delta_current_state WHERE delta_id = ?').get(deltaId);
  if (!row) return { status: 'not_found', schema: 'narada.adoptable_delta.show.v0', delta_id: deltaId };
  return { status: 'ok', schema: 'narada.adoptable_delta.show.v0', authority: 'adoptable_delta_sqlite_projection', delta: parseCurrentRow(row) };
}

function history(args) {
  const deltaId = requiredString(args, 'delta_id');
  validateDeltaId(deltaId);
  const rows = ensureDb().prepare('SELECT * FROM available_delta_events WHERE delta_id = ? ORDER BY created_at ASC LIMIT ?').all(deltaId, limit(args, 50));
  return { status: 'ok', schema: 'narada.adoptable_delta.history.v0', authority: 'adoptable_delta_sqlite_events', append_only_authority: true, delta_id: deltaId, count: rows.length, events: rows.map(parseEventRow) };
}

function nextDelta(args) {
  const rows = queryCurrent(args, true);
  return { status: 'ok', schema: 'narada.adoptable_delta.next.v0', authority: 'adoptable_delta_sqlite_projection', read_only_signal: true, no_task_creation: true, no_task_claim: true, has_work: rows.length > 0, delta: rows[0] ? parseCurrentRow(rows[0]) : null, candidates: rows.map(parseCurrentRow) };
}

function queryCurrent(args, prioritized = false) {
  const where = [];
  const params = [];
  for (const [argName, column] of [['kind', 'kind'], ['state', 'state_after'], ['source_site', 'source_site'], ['target_site', 'target_site']]) {
    const value = stringField(args, argName);
    if (value) {
      where.push(`${column} = ?`);
      params.push(value);
    }
  }
  const task = integerField(args, 'linked_task_number');
  if (task !== null) {
    where.push('linked_task_number = ?');
    params.push(task);
  }
  if (prioritized && !stringField(args, 'state')) {
    where.push(`state_after IN (${[...ACTIONABLE_STATES].map(() => '?').join(', ')})`);
    params.push(...ACTIONABLE_STATES);
  }
  const order = prioritized
    ? `CASE state_after WHEN 'blocked' THEN 100 WHEN 'admitted' THEN 90 WHEN 'applicable' THEN 70 WHEN 'available' THEN 50 WHEN 'observed' THEN 30 ELSE 10 END DESC, CASE kind WHEN 'crossing_surface' THEN 10 ELSE 0 END DESC, last_event_at DESC`
    : 'last_event_at DESC';
  return ensureDb().prepare(`SELECT * FROM available_delta_current_state ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ?`).all(...params, limit(args, 50));
}

function parseCurrentRow(row) {
  return { delta_id: row.delta_id, kind: row.kind, state_after: row.state_after, title: row.title, summary: row.summary, source_site: row.source_site, target_site: row.target_site, actor_agent_id: row.actor_agent_id, authority_basis: parseJson(row.authority_basis_json, {}), authority_required: row.authority_required, next_surface: row.next_surface, risk: row.risk, artifact_refs: parseJson(row.artifact_refs_json, []), evidence_refs: parseJson(row.evidence_refs_json, []), linked_task_number: row.linked_task_number, last_event_id: row.last_event_id, last_event_at: row.last_event_at, projection_not_authority: true };
}

function parseEventRow(row) {
  return { ...parseCurrentRow({ ...row, last_event_id: row.event_id, last_event_at: row.created_at }), event_id: row.event_id, created_at: row.created_at };
}

function ensureDb() {
  if (db) return db;
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS available_delta_events (
      event_id TEXT PRIMARY KEY, delta_id TEXT NOT NULL, kind TEXT NOT NULL, state_after TEXT NOT NULL,
      title TEXT NOT NULL, summary TEXT NOT NULL, source_site TEXT NOT NULL, target_site TEXT NOT NULL,
      actor_agent_id TEXT NOT NULL, authority_basis_json TEXT NOT NULL, authority_required TEXT NOT NULL,
      next_surface TEXT NOT NULL, risk TEXT NOT NULL, artifact_refs_json TEXT NOT NULL, evidence_refs_json TEXT NOT NULL,
      linked_task_number INTEGER, created_at TEXT NOT NULL, payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_available_delta_events_delta ON available_delta_events(delta_id, created_at DESC);
    CREATE TRIGGER IF NOT EXISTS trg_available_delta_events_no_update BEFORE UPDATE ON available_delta_events BEGIN SELECT RAISE(ABORT, 'append_only_no_update: available_delta_events'); END;
    CREATE TRIGGER IF NOT EXISTS trg_available_delta_events_no_delete BEFORE DELETE ON available_delta_events BEGIN SELECT RAISE(ABORT, 'append_only_no_delete: available_delta_events'); END;
    CREATE TABLE IF NOT EXISTS available_delta_current_state (
      delta_id TEXT PRIMARY KEY, kind TEXT NOT NULL, state_after TEXT NOT NULL, title TEXT NOT NULL,
      summary TEXT NOT NULL, source_site TEXT NOT NULL, target_site TEXT NOT NULL, actor_agent_id TEXT NOT NULL,
      authority_basis_json TEXT NOT NULL, authority_required TEXT NOT NULL, next_surface TEXT NOT NULL, risk TEXT NOT NULL,
      artifact_refs_json TEXT NOT NULL, evidence_refs_json TEXT NOT NULL, linked_task_number INTEGER,
      last_event_id TEXT NOT NULL, last_event_at TEXT NOT NULL, payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_available_delta_current_state ON available_delta_current_state(state_after, last_event_at DESC);
    CREATE INDEX IF NOT EXISTS idx_available_delta_current_task ON available_delta_current_state(linked_task_number, last_event_at DESC);
  `);
  return db;
}

function assertBoundIdentity(agentId) {
  const bound = process.env.NARADA_AGENT_ID;
  if (bound && bound !== agentId) throw new Error(`adoptable_delta_identity_mismatch: bound=${bound} actor=${agentId}`);
  if (!/^narada-andrey\.[A-Za-z0-9_-]+$/.test(agentId)) throw new Error(`invalid_adoptable_delta_actor_agent_id: ${agentId}`);
}

function validateAuthorityBasis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_adoptable_delta_authority_basis');
  if (typeof value.kind !== 'string' || value.kind.trim().length === 0) throw new Error('invalid_adoptable_delta_authority_basis_kind');
  if (typeof value.summary !== 'string' || value.summary.trim().length === 0) throw new Error('invalid_adoptable_delta_authority_basis_summary');
}

function validateRefs(label, refs, required) {
  if (!Array.isArray(refs) || (required && refs.length === 0)) throw new Error(`invalid_adoptable_delta_${label}`);
  for (const ref of refs) if (typeof ref !== 'string' || ref.trim().length === 0) throw new Error(`invalid_adoptable_delta_${label}`);
}

function validateDeltaId(deltaId) {
  if (!/^adelta_[a-f0-9]{32}$/.test(deltaId)) throw new Error(`invalid_adoptable_delta_id: ${deltaId}`);
}

function jsonToolResult(payload) {
  return buildOutputRefToolContent({ siteRoot, toolName: activeOutputToolName, value: payload });
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requiredString(record, key) {
  const value = stringField(record, key);
  if (!value) throw new Error(`${key}_is_required`);
  return value;
}

function stringField(record, key) {
  return typeof record?.[key] === 'string' && record[key].trim().length > 0 ? record[key].trim() : null;
}

function objectField(record, key) {
  return record?.[key] && typeof record[key] === 'object' && !Array.isArray(record[key]) ? record[key] : null;
}

function arrayField(record, key) {
  return Array.isArray(record?.[key]) ? record[key] : [];
}

function integerField(record, key) {
  if (!(key in (record ?? {}))) return null;
  const value = Number(record[key]);
  if (!Number.isInteger(value)) throw new Error(`${key}_must_be_integer`);
  return value;
}

function limit(args, fallback) {
  return Math.min(Math.max(parseInt(args?.limit ?? String(fallback), 10), 1), 100);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function parseArgs(argv) {
  const parsed = { siteRoot: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') parsed.help = true;
    else if (argv[i] === '--site-root') parsed.siteRoot = argv[++i];
  }
  return parsed;
}

function drainJsonRpcFrames(input) {
  const requests = [];
  let cursor = 0;
  while (cursor < input.length) {
    const headerEnd = input.indexOf('\r\n\r\n', cursor);
    if (headerEnd === -1) break;
    const match = input.slice(cursor, headerEnd).match(/Content-Length:\s*(\d+)/i);
    if (!match) break;
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + Number(match[1]);
    if (input.length < bodyEnd) break;
    requests.push(JSON.parse(input.slice(bodyStart, bodyEnd)));
    cursor = bodyEnd;
  }
  return { requests, remaining: input.slice(cursor) };
}
