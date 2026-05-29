import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeBootstrap } from './synthesize-bootstrap.mjs';

test('returns cold bootstrap without database', () => {
  const result = synthesizeBootstrap(null, 'agent.test');

  assert.equal(result.schema, 'narada.bootstrap.l1.v0');
  assert.equal(result.agent_id, 'agent.test');
  assert.equal(result.checkpoint_count, 0);
  assert.equal(result.summary, 'No agent context DB available; bootstrap is cold.');
});

test('returns cold bootstrap without agent event table', () => {
  const db = {
    prepare(sql) {
      assert.match(sql, /sqlite_master/);
      return { get: () => null };
    },
  };

  const result = synthesizeBootstrap(db, 'agent.test');

  assert.equal(result.checkpoint_count, 0);
  assert.equal(result.summary, 'Agent event log not yet initialized; bootstrap is cold.');
});

test('summarizes recent checkpoints', () => {
  const rows = [
    {
      event_id: 'evt1',
      task_number: '42',
      emitted_at: '2026-01-01T00:00:00Z',
      payload_json: JSON.stringify({
        boundary_type: 'implementation',
        decisions: [{ what: 'Packaged bootstrap.' }],
        files_changed: ['packages/agent-start-bootstrap/src/synthesize-bootstrap.mjs'],
        tests_run: ['node --test'],
        friction: [{ what: 'legacy mirror', severity: 8 }],
      }),
    },
  ];
  const db = {
    prepare(sql) {
      if (sql.includes('sqlite_master')) return { get: () => ({ name: 'agent_events' }) };
      return {
        all(agentId, limit) {
          assert.equal(agentId, 'agent.test');
          assert.equal(limit, 10);
          return rows;
        },
      };
    },
  };

  const result = synthesizeBootstrap(db, 'agent.test');

  assert.equal(result.checkpoint_count, 1);
  assert.match(result.summary, /Task 42/);
  assert.match(result.summary, /Packaged bootstrap/);
  assert.match(result.summary, /legacy mirror/);
});
