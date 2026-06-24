import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAgentContextDb } from './session-start.mjs';
import { enforceAgentPathPolicy, resolveAgentPathPolicy } from './path-policy.mjs';

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

test('agent path policy roster membership is site opt-in', async () => {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-agent-path-policy-'));
  try {
    await mkdir(join(siteRoot, '.ai', 'agents'), { recursive: true });
    await mkdir(join(siteRoot, 'allowed'), { recursive: true });
    await mkdir(join(siteRoot, 'other'), { recursive: true });
    const rosterPath = join(siteRoot, '.ai', 'agents', 'roster.json');

    await writeFile(rosterPath, JSON.stringify({ agents: [] }), 'utf8');
    const defaultResult = resolveAgentPathPolicy(siteRoot, 'narada.architect');
    assert.equal(defaultResult.configured, false);
    assert.equal(defaultResult.allowed, true);
    assert.equal(defaultResult.roster_enforcement, 'disabled');
    assert.equal(defaultResult.reason, 'identity_not_in_roster_but_site_path_roster_enforcement_not_enabled');

    await writeFile(rosterPath, JSON.stringify({ enforce_agent_path_policy: true, agents: [] }), 'utf8');
    const strictResult = resolveAgentPathPolicy(siteRoot, 'narada.architect');
    assert.equal(strictResult.configured, true);
    assert.equal(strictResult.allowed, false);
    assert.equal(strictResult.roster_enforcement, 'enabled');
    assert.equal(strictResult.error, 'path_policy_identity_not_in_roster: narada.architect');

    await writeFile(rosterPath, JSON.stringify({
      agents: [{
        agent_id: 'narada.architect',
        capability_policy: {
          path_policy: { mode: 'allowlist', allow: ['allowed'] },
        },
      }],
    }), 'utf8');
    assert.equal(
      enforceAgentPathPolicy({
        siteRoot,
        agentId: 'narada.architect',
        absolutePath: join(siteRoot, 'allowed', 'note.txt'),
        operation: 'read_file',
      }).status,
      'allowed'
    );
    assert.equal(
      enforceAgentPathPolicy({
        siteRoot,
        agentId: 'agent-without-policy',
        absolutePath: join(siteRoot, 'other', 'note.txt'),
        operation: 'read_file',
      }).roster_enforcement,
      'disabled'
    );
    assert.throws(
      () => enforceAgentPathPolicy({
        siteRoot,
        agentId: 'narada.architect',
        absolutePath: resolve(siteRoot, 'other', 'note.txt'),
        operation: 'read_file',
      }),
      /path_policy_denied/
    );
  } finally {
    await rm(siteRoot, { recursive: true, force: true });
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
