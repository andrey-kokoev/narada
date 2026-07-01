import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import {
  classifyNarsSessionDisplayState,
  discoverNarsSessions,
  markNarsSessionIndexClosed,
  narsSessionsRootFromSiteRoot,
  readNarsSessionIndex,
  rebuildNarsSessionIndex,
  writeNarsSessionStartedIndex,
} from './nars-session-index.mjs';

function makeTempSiteRoot() {
  return mkdtempSync(join(tmpdir(), 'nars-session-index-test-'));
}

function cleanup(path) {
  try { rmSync(path, { recursive: true, force: true }); } catch {}
}

function sessionPath(siteRoot, sessionId = 'carrier_20260623000000_test') {
  return resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionPath;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function startedEvent(siteRoot, sessionId = 'carrier_20260623000000_test', timestamp = '2026-06-23T00:00:00.000Z', overrides = {}) {
  return {
    event: 'session_started',
    session_id: sessionId,
    agent_id: 'sonar.resident',
    timestamp,
    site_root: siteRoot,
    runtime: 'narada-agent-runtime-server',
    runtime_substrate_kind: 'narada-agent-runtime-server',
    launch_operator_surface_kind: 'agent-cli',
    operator_surface_kind: 'agent-cli',
    event_endpoint: 'ws://127.0.0.1:12345/events',
    health_endpoint: 'http://127.0.0.1:12346/health',
    attach_commands: {
      ['agent_' + 'cli']: 'narada-agent-' + 'cli --attach ws://127.0.0.1:12345/events',
      ['agent_' + 'web_ui']: 'narada-agent-' + 'web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health',
    },
    session_path: sessionPath(siteRoot, sessionId),
    events_path: join(dirname(sessionPath(siteRoot, sessionId)), 'events.jsonl'),
    ...overrides,
  };
}

test('writeNarsSessionStartedIndex writes per-session record and aggregate index', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const event = startedEvent(siteRoot);
    const result = writeNarsSessionStartedIndex({
      sessionStartedEvent: event,
      sessionPath: event.session_path,
      siteRoot,
      now: new Date('2026-06-23T00:00:05.000Z'),
    });

    assert.equal(result.record.schema, 'narada.nars.session_index_record.v1');
    assert.equal(result.record.session_id, event.session_id);
    assert.equal(result.record.carrier_session_id, event.session_id);
    assert.equal(result.record.agent_id, 'sonar.resident');
    assert.equal(result.record.site_id, 'sonar');
    assert.equal(result.record.site_id_source, 'derived_from_site_root_or_agent_id');
    assert.equal(result.record.site_root, siteRoot);
    assert.equal(result.record.launch_operator_surface_kind, 'agent-cli');
    assert.equal(result.record.event_endpoint, event.event_endpoint);
    assert.equal(result.record.health_endpoint, event.health_endpoint);
    assert.equal(result.record.terminal_state, null);
    assert.equal(result.record.status_hint_authority, 'discovery_projection_only');
    assert.equal(result.record.attached_projections, null);
    assert.equal(result.record.attached_projections_status, 'not_tracked');

    assert.equal(existsSync(result.paths.record_path), true);
    assert.equal(existsSync(result.paths.aggregate_path), true);
    const aggregate = readJson(result.paths.aggregate_path);
    assert.equal(aggregate.schema, 'narada.nars.session_index.v1');
    assert.equal(aggregate.sessions.length, 1);
    assert.equal(aggregate.sessions[0].session_id, event.session_id);
    assert.equal(aggregate.sessions[0].record_path, result.paths.record_path);
  } finally {
    cleanup(siteRoot);
  }
});

test('discoverNarsSessions accepts a Site root that is already the .narada root', () => {
  const workspaceRoot = makeTempSiteRoot();
  const siteRoot = join(workspaceRoot, '.narada');
  try {
    const sessionId = 'carrier_20260701202225_staccato';
    const sessionDir = join(siteRoot, 'crew', 'nars-sessions', sessionId);
    const event = {
      ...startedEvent(workspaceRoot, sessionId),
      agent_id: 'narada-staccato.resident',
      site_root: siteRoot,
      session_path: join(sessionDir, 'session.jsonl'),
      events_path: join(sessionDir, 'events.jsonl'),
    };
    writeNarsSessionStartedIndex({
      sessionStartedEvent: event,
      sessionPath: event.session_path,
      siteRoot,
      now: new Date('2026-07-01T20:22:30.000Z'),
    });

    assert.equal(narsSessionsRootFromSiteRoot(siteRoot), join(siteRoot, 'crew', 'nars-sessions'));
    const discovery = discoverNarsSessions({
      siteRoot,
      healthBySessionId: { [sessionId]: 'healthy' },
      now: new Date('2026-07-01T20:22:35.000Z'),
    });

    assert.equal(discovery.sessions.length, 1);
    assert.equal(discovery.sessions[0].session_id, sessionId);
    assert.equal(discovery.sessions[0].agent_id, 'narada-staccato.resident');
    assert.equal(discovery.sessions[0].display_state, 'active');
  } finally {
    cleanup(workspaceRoot);
  }
});

test('classifyNarsSessionDisplayState treats successful health as active', () => {
  const classification = classifyNarsSessionDisplayState({
    record: { status_hint: 'alive' },
    heartbeat: { timestamp: '2026-06-23T00:00:00.000Z' },
    health: { ok: true },
    now: new Date('2026-06-23T00:00:10.000Z'),
  });
  assert.equal(classification.display_state, 'active');
  assert.equal(classification.health_status, 'healthy');
});

test('classifyNarsSessionDisplayState treats closed records as closed without live health', () => {
  const classification = classifyNarsSessionDisplayState({
    record: { terminal_state: 'closed', status_hint: 'closed' },
    heartbeat: { timestamp: '2026-06-23T00:00:00.000Z' },
    health: 'unavailable',
    now: new Date('2026-06-23T00:00:10.000Z'),
  });
  assert.equal(classification.display_state, 'closed');
  assert.equal(classification.display_state_reason, undefined);
  assert.equal(classification.reason, 'terminal_state_closed');
});

test('discoverNarsSessions includes display classification and heartbeat evidence', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const event = startedEvent(siteRoot, 'carrier_discovery', '2026-06-23T00:00:00.000Z');
    const result = writeNarsSessionStartedIndex({ sessionStartedEvent: event, sessionPath: event.session_path, siteRoot });
    writeFileSync(result.paths.heartbeat_path, `${JSON.stringify({ timestamp: '2026-06-23T00:00:20.000Z' })}\n`, 'utf8');

    const discovery = discoverNarsSessions({
      siteRoot,
      now: new Date('2026-06-23T00:00:30.000Z'),
      healthBySessionId: { carrier_discovery: 'unavailable' },
    });

    assert.equal(discovery.schema, 'narada.nars.session_discovery.v1');
    assert.equal(discovery.sessions.length, 1);
    assert.equal(discovery.sessions[0].session_id, 'carrier_discovery');
    assert.equal(discovery.sessions[0].display_state, 'starting_or_degraded');
    assert.equal(discovery.sessions[0].heartbeat_fresh, true);
    assert.equal(discovery.sessions[0].heartbeat_age_ms, 10000);
  } finally {
    cleanup(siteRoot);
  }
});

test('markNarsSessionIndexClosed records runtime_process_exit reason when supplied', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const event = startedEvent(siteRoot);
    writeNarsSessionStartedIndex({ sessionStartedEvent: event, sessionPath: event.session_path, siteRoot });
    const closed = markNarsSessionIndexClosed({
      sessionPath: event.session_path,
      siteRoot,
      terminalState: 'closed',
      terminalReason: 'runtime_process_exit',
      closedAt: '2026-06-23T00:04:00.000Z',
    });
    assert.equal(closed.record.terminal_reason, 'runtime_process_exit');
  } finally {
    cleanup(siteRoot);
  }
});

test('readNarsSessionIndex overlays stale aggregate fields from per-session records', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const event = startedEvent(siteRoot);
    const result = writeNarsSessionStartedIndex({ sessionStartedEvent: event, sessionPath: event.session_path, siteRoot });
    markNarsSessionIndexClosed({
      sessionPath: event.session_path,
      siteRoot,
      terminalState: 'closed',
      terminalReason: 'runtime_process_exit',
      closedAt: '2026-06-23T00:03:00.000Z',
    });
    writeFileSync(result.paths.aggregate_path, `${JSON.stringify({
      schema: 'narada.nars.session_index.v1',
      site_root: siteRoot,
      generated_at: '2026-06-23T00:00:30.000Z',
      sessions: [{ session_id: event.session_id, terminal_state: null, status_hint: 'alive' }],
    }, null, 2)}\n`, 'utf8');

    const index = readNarsSessionIndex({ sessionsRoot: dirname(result.paths.session_dir), siteRoot });
    assert.equal(index.sessions[0].terminal_state, 'closed');
    assert.equal(index.sessions[0].status_hint, 'closed');
    assert.equal(index.sessions[0].status_hint_authority, 'discovery_projection_only');
  } finally {
    cleanup(siteRoot);
  }
});

test('writeNarsSessionStartedIndex preserves explicit site_id when launch provides it', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const event = startedEvent(siteRoot, 'carrier_explicit_site', '2026-06-23T00:00:00.000Z', { site_id: 'explicit-site' });
    const result = writeNarsSessionStartedIndex({ sessionStartedEvent: event, sessionPath: event.session_path, siteRoot });
    assert.equal(result.record.site_id, 'explicit-site');
    assert.equal(result.record.site_id_source, 'session_started');
  } finally {
    cleanup(siteRoot);
  }
});

test('readNarsSessionIndex rebuilds from per-session records when aggregate is corrupt', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const event = startedEvent(siteRoot);
    const result = writeNarsSessionStartedIndex({ sessionStartedEvent: event, sessionPath: event.session_path, siteRoot });
    writeFileSync(result.paths.aggregate_path, '{not json', 'utf8');

    const rebuilt = readNarsSessionIndex({ sessionsRoot: dirname(result.paths.session_dir), siteRoot });
    assert.equal(rebuilt.schema, 'narada.nars.session_index.v1');
    assert.equal(rebuilt.sessions.length, 1);
    assert.equal(rebuilt.sessions[0].session_id, event.session_id);
    assert.equal(readJson(result.paths.aggregate_path).sessions[0].session_id, event.session_id);
  } finally {
    cleanup(siteRoot);
  }
});

test('rebuildNarsSessionIndex preserves readable records when aggregate is missing', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const first = startedEvent(siteRoot, 'carrier_20260623000000_first');
    const second = startedEvent(siteRoot, 'carrier_20260623000100_second', '2026-06-23T00:01:00.000Z');
    const firstWrite = writeNarsSessionStartedIndex({ sessionStartedEvent: first, sessionPath: first.session_path, siteRoot });
    writeNarsSessionStartedIndex({ sessionStartedEvent: second, sessionPath: second.session_path, siteRoot });
    rmSync(firstWrite.paths.aggregate_path, { force: true });

    const rebuilt = rebuildNarsSessionIndex({ sessionsRoot: dirname(firstWrite.paths.session_dir), siteRoot });
    assert.deepEqual(rebuilt.sessions.map((entry) => entry.session_id), [second.session_id, first.session_id]);
  } finally {
    cleanup(siteRoot);
  }
});

test('rebuildNarsSessionIndex recovers stale aggregate lock directory', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const event = startedEvent(siteRoot);
    const result = writeNarsSessionStartedIndex({ sessionStartedEvent: event, sessionPath: event.session_path, siteRoot });
    const sessionsRoot = dirname(result.paths.session_dir);
    const lockDir = join(sessionsRoot, '.index.lock');
    mkdirSync(lockDir, { recursive: true });
    const stale = new Date(Date.now() - 10000);
    utimesSync(lockDir, stale, stale);

    const rebuilt = rebuildNarsSessionIndex({ sessionsRoot, siteRoot });
    assert.equal(rebuilt.sessions[0].session_id, event.session_id);
    assert.equal(existsSync(lockDir), false);
  } finally {
    cleanup(siteRoot);
  }
});

test('readNarsSessionIndex rebuilds when aggregate is valid but stale', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const first = startedEvent(siteRoot, 'carrier_20260623000000_first');
    const second = startedEvent(siteRoot, 'carrier_20260623000100_second', '2026-06-23T00:01:00.000Z');
    const firstWrite = writeNarsSessionStartedIndex({ sessionStartedEvent: first, sessionPath: first.session_path, siteRoot });
    writeNarsSessionStartedIndex({ sessionStartedEvent: second, sessionPath: second.session_path, siteRoot });
    writeFileSync(firstWrite.paths.aggregate_path, `${JSON.stringify({
      schema: 'narada.nars.session_index.v1',
      site_root: siteRoot,
      generated_at: '2026-06-23T00:00:30.000Z',
      sessions: [{ session_id: first.session_id }],
    }, null, 2)}\n`, 'utf8');

    const rebuilt = readNarsSessionIndex({ sessionsRoot: dirname(firstWrite.paths.session_dir), siteRoot });
    assert.deepEqual(rebuilt.sessions.map((entry) => entry.session_id), [second.session_id, first.session_id]);
  } finally {
    cleanup(siteRoot);
  }
});

test('markNarsSessionIndexClosed marks terminal state and refreshes aggregate', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const event = startedEvent(siteRoot);
    const result = writeNarsSessionStartedIndex({ sessionStartedEvent: event, sessionPath: event.session_path, siteRoot });
    const closed = markNarsSessionIndexClosed({
      sessionPath: event.session_path,
      siteRoot,
      terminalState: 'closed',
      closedAt: '2026-06-23T00:02:00.000Z',
    });

    assert.equal(closed.record.terminal_state, 'closed');
    assert.equal(closed.record.terminal_reason, 'session_closed');
    assert.equal(closed.record.status_hint, 'closed');
    assert.equal(closed.record.closed_at, '2026-06-23T00:02:00.000Z');
    const aggregate = readJson(result.paths.aggregate_path);
    assert.equal(aggregate.sessions[0].terminal_state, 'closed');
    assert.equal(aggregate.sessions[0].status_hint, 'closed');
  } finally {
    cleanup(siteRoot);
  }
});
