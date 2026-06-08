import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAgentContextDb } from './session-start.mjs';

const root = dirname(fileURLToPath(import.meta.url));

test('agent context tool package owns site agent-context scripts', async () => {
  const files = (await readdir(root)).filter((name) => name.endsWith('.mjs'));
  assert.ok(files.length >= 10, `expected agent-context scripts, got ${files.length}`);
  assert.ok(files.includes('agent-context-mcp-server.mjs'));
  assert.ok(files.includes('session-start.mjs'));
  for (const file of files) {
    const text = await readFile(join(root, file), 'utf8');
    assert.notEqual(text.trim(), '', `${file} has content`);
  }
});

test('agent context database opens without site-local migration files', async () => {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-agent-context-'));
  try {
    const db = openAgentContextDb(siteRoot);
    try {
      const tables = new Set(
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
      );
      assert.ok(tables.has('agent_start_events'));
      assert.ok(tables.has('agent_events'));
      assert.ok(tables.has('execution_context_materializations'));
      assert.ok(tables.has('codex_session_admissions'));

      const startColumns = new Set(db.prepare('PRAGMA table_info(agent_start_events)').all().map((column) => column.name));
      for (const column of ['event_id', 'identity_id', 'runtime', 'created_at', 'status', 'resume_command', 'bootstrap_artifact_uri']) {
        assert.ok(startColumns.has(column), `agent_start_events.${column} exists`);
      }

      const eventColumns = new Set(db.prepare('PRAGMA table_info(agent_events)').all().map((column) => column.name));
      for (const column of ['event_id', 'agent_id', 'session_id', 'event_type', 'task_number', 'payload_json', 'emitted_at']) {
        assert.ok(eventColumns.has(column), `agent_events.${column} exists`);
      }
    } finally {
      db.close();
    }
  } finally {
    await rm(siteRoot, { recursive: true, force: true });
  }
});
