import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildNarsRuntimeSurfaceContract } from '@narada2/nars-runtime-contract/runtime-surface-contract';

import {
  readNarsSessionIndex,
  rebuildNarsSessionIndex,
  writeNarsSessionStartedIndex,
} from './session-index.mjs';

function startedEvent(sessionsRoot, sessionId, startedAt) {
  const sessionDir = join(sessionsRoot, sessionId);
  return {
    event: 'session_started',
    session_id: sessionId,
    agent_id: `sonar.${sessionId}`,
    site_id: 'sonar',
    site_root: sessionsRoot,
    session_path: join(sessionDir, 'session.jsonl'),
    events_path: join(sessionDir, 'events.jsonl'),
    event_endpoint: `ws://127.0.0.1:1/${sessionId}`,
    health_endpoint: `http://127.0.0.1:1/${sessionId}`,
    started_at: startedAt,
  };
}

test('session start updates the aggregate index incrementally', () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-index-'));
  const sessionsRoot = join(root, 'sessions');
  try {
    const first = writeNarsSessionStartedIndex({
      sessionStartedEvent: startedEvent(sessionsRoot, 'session-1', '2026-07-11T00:00:00.000Z'),
      siteRoot: root,
      now: new Date('2026-07-11T00:00:00.000Z'),
    });
    assert.equal(first.index.maintenance, 'incremental_rebuildable_v1');
    assert.equal(first.index.session_count, 1);

    const second = writeNarsSessionStartedIndex({
      sessionStartedEvent: startedEvent(sessionsRoot, 'session-2', '2026-07-11T00:01:00.000Z'),
      siteRoot: root,
      now: new Date('2026-07-11T00:01:00.000Z'),
    });
    assert.equal(second.index.session_count, 2);
    assert.deepEqual(readNarsSessionIndex({ sessionsRoot, siteRoot: root }).sessions.map((entry) => entry.session_id), [
      'session-2',
      'session-1',
    ]);
    assert.equal(existsSync(join(root, '.nars-session-index-pending.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a pending index mutation triggers one rebuild and clears its recovery marker', () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-index-recovery-'));
  const sessionsRoot = join(root, 'sessions');
  try {
    const first = writeNarsSessionStartedIndex({
      sessionStartedEvent: startedEvent(sessionsRoot, 'session-1', '2026-07-11T00:00:00.000Z'),
      siteRoot: root,
      now: new Date('2026-07-11T00:00:00.000Z'),
    });
    const orphan = {
      ...first.record,
      session_id: 'session-orphan',
      runtime_session_id: 'session-orphan',
      nars_session_id: 'session-orphan',
      carrier_session_id: 'session-orphan',
      session_dir: join(sessionsRoot, 'session-orphan'),
      session_path: join(sessionsRoot, 'session-orphan', 'session.jsonl'),
      events_path: join(sessionsRoot, 'session-orphan', 'events.jsonl'),
      event_endpoint: 'ws://127.0.0.1:1/session-orphan',
      health_endpoint: 'http://127.0.0.1:1/session-orphan',
      started_at: '2026-07-11T00:02:00.000Z',
    };
    mkdirSync(orphan.session_dir, { recursive: true });
    writeFileSync(join(orphan.session_dir, 'session-index-record.json'), `${JSON.stringify(orphan)}\n`, 'utf8');
    writeFileSync(join(root, '.nars-session-index-pending.json'), `${JSON.stringify({ operation: 'session_started' })}\n`, 'utf8');

    const recovered = readNarsSessionIndex({ sessionsRoot, siteRoot: root });
    assert.equal(recovered.session_count, 2);
    assert.equal(recovered.sessions.some((entry) => entry.session_id === 'session-orphan'), true);
    assert.equal(existsSync(join(root, '.nars-session-index-pending.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('explicit index rebuild remains the repair path for external record changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-index-rebuild-'));
  const sessionsRoot = join(root, 'sessions');
  try {
    const result = rebuildNarsSessionIndex({ sessionsRoot, siteRoot: root, generatedAt: '2026-07-11T00:00:00.000Z' });
    assert.equal(result.maintenance, 'incremental_rebuildable_v1');
    assert.equal(result.session_count, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('session index records derive runtime_origin from authority_runtime_host', () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-index-origin-'));
  const sessionsRoot = join(root, 'sessions');
  try {
    const localResult = writeNarsSessionStartedIndex({
      sessionStartedEvent: {
        ...startedEvent(sessionsRoot, 'session-local', '2026-07-11T00:00:00.000Z'),
        authority_runtime_host: 'local',
        authority_epoch: 1,
        runtime_surface_contract: buildNarsRuntimeSurfaceContract({
          runtime_origin: 'local',
          surface_origin: 'local',
          authority: {
            authority_runtime_host: 'local',
            authority_epoch: 1,
            authority_runtime_id: 'local-nars:session-local',
            canonicity: 'canonical',
            authority_transition_state: 'not_requested',
            source_write_admission: 'active',
          },
          generated_at: '2026-07-11T00:00:00.000Z',
        }),
      },
      siteRoot: root,
      now: new Date('2026-07-11T00:00:00.000Z'),
    });
    const localEntry = localResult.index.sessions.find((entry) => entry.session_id === 'session-local');
    assert.equal(localEntry.authority_runtime_host, 'local');
    assert.equal(localEntry.runtime_origin, 'local');
    assert.equal(localEntry.runtime_surface_contract.quadrant, 'local/local');

    const cloudflareResult = writeNarsSessionStartedIndex({
      sessionStartedEvent: {
        ...startedEvent(sessionsRoot, 'session-cf', '2026-07-11T00:01:00.000Z'),
        authority_runtime_host: 'cloudflare-host',
        authority_epoch: 3,
      },
      siteRoot: root,
      now: new Date('2026-07-11T00:01:00.000Z'),
    });
    const cloudflareEntry = cloudflareResult.index.sessions.find((entry) => entry.session_id === 'session-cf');
    assert.equal(cloudflareEntry.authority_runtime_host, 'cloudflare-host');
    assert.equal(cloudflareEntry.runtime_origin, 'cloudflare');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
