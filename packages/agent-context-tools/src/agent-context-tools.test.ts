import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { materializeAgentSessionStart, openAgentContextDb, validateIdentityAgainstRoster } from './session-start.js';
import { enforceAgentPathPolicy, resolveAgentPathPolicy } from './path-policy.js';
import Database, { DEFAULT_BUSY_TIMEOUT_MS } from './sqlite-database.js';
import { spawnTestChild } from '@narada-core/process-launch-posture';

const root: any = dirname(fileURLToPath(import.meta.url));

test('agent context startup tools expose canonical agent identity ref', async () => {
  const siteRoot: any = await mkdtemp(join(tmpdir(), 'narada-agent-context-identity-ref-'));
  try {
    const responses: any = await callAgentContextMcp({
      siteRoot,
      env: {
        NARADA_AGENT_ID: 'resident',
        NARADA_SITE_ID: 'sonar',
        NARADA_AGENT_CONTEXT_DB: join(siteRoot, '.ai', 'state', 'agent-context.sqlite'),
      },
      calls: [
        { id: 1, name: 'agent_context_whoami', arguments: {} },
        { id: 2, name: 'agent_context_startup_sequence', arguments: {} },
      ],
    });

    const whoami: any = toolResultValue(responses.get(1));
    assert.equal(whoami.identity, 'resident');
    assert.match(whoami.message, /Session identity is sonar\.resident/);
    assert.doesNotMatch(whoami.message, /Session identity is resident/);
    assert.deepEqual(whoami.agent_identity_ref, {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'sonar' },
      local_agent_id: 'resident',
      role: 'resident',
      canonical_agent_id: 'sonar.resident',
      display: 'sonar.resident',
      legacy_agent_id: 'resident',
    });

    const startup: any = toolResultValue(responses.get(2));
    assert.equal(startup.identity, 'resident');
    assert.equal(startup.agent_identity_ref.display, 'sonar.resident');
    assert.equal(startup.agent_identity_ref.legacy_agent_id, 'resident');
    assert.equal(startup.verified_badge.agent_identity_ref.display, 'sonar.resident');
  } finally {
    await rm(siteRoot, { recursive: true, force: true });
  }
});

function callAgentContextMcp({ siteRoot, env, calls }: any) {
  return new Promise((resolvePromise: any, rejectPromise: any) => {
    const tsxLoader: any = pathToFileURL(resolve(root, '../../../node_modules/tsx/dist/loader.mjs')).href;
    const child: any = spawnTestChild(process.execPath, ['--import', tsxLoader, join(root, 'agent-context-mcp-server.ts'), '--site-root', siteRoot], {
      cwd: siteRoot,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout: any = '';
    let stderr: any = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: any) => { stdout += chunk; });
    child.stderr.on('data', (chunk: any) => { stderr += chunk; });
    child.on('error', rejectPromise);
    child.on('close', (code: any) => {
      if (code !== 0) {
        rejectPromise(new Error(`agent_context_mcp_exited_${code}: ${stderr}`));
        return;
      }
      try {
        const parsed: any = stdout.trim().split(/\r?\n/u).filter(Boolean).map((line: any) => JSON.parse(line));
        resolvePromise(new Map(parsed.map((response: any) => [response.id, response])));
      } catch (error) {
        rejectPromise(new Error(`agent_context_mcp_response_parse_failed: ${error instanceof Error ? error.message : String(error)}; stdout=${stdout}; stderr=${stderr}`));
      }
    });

    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agent-context-tools-test', version: '1.0.0' },
      },
    })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    for (const call of calls) {
      child.stdin.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: call.id,
        method: 'tools/call',
        params: { name: call.name, arguments: call.arguments ?? {} },
      })}\n`);
    }
    child.stdin.end();
  });
}

function toolResultValue(response: any) {
  assert.equal(Boolean(response?.error), false, response?.error?.message ?? 'tool response error');
  if (response?.result?.structuredContent) return response.result.structuredContent;
  const text: any = response?.result?.content?.find((entry: any) => entry?.type === 'text')?.text;
  assert.equal(typeof text, 'string');
  return JSON.parse(text);
}

test('agent context tool package owns site agent-context scripts', async () => {
  const files: any = (await readdir(root)).filter((name: any) => name.endsWith('.ts'));
  assert.ok(files.length >= 10, `expected agent-context scripts, got ${files.length}`);
  assert.ok(files.includes('agent-context-mcp-server.ts'));
  assert.ok(files.includes('session-start.ts'));
  for (const file of files) {
    const text: any = await readFile(join(root, file), 'utf8');
    assert.notEqual(text.trim(), '', `${file} has content`);
  }
});

test('agent-context sqlite wrapper configures a busy timeout for concurrent role launches', async () => {
  const siteRoot: any = await mkdtemp(join(tmpdir(), 'narada-agent-context-busy-timeout-'));
  try {
    const dbPath: any = join(siteRoot, '.ai', 'state', 'agent-context.sqlite');
    const db: any = openAgentContextDb(siteRoot, dbPath);
    try {
      assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, DEFAULT_BUSY_TIMEOUT_MS);
    } finally {
      db.close();
    }

    const overrideDb: any = new Database(dbPath, { busyTimeoutMs: 1234 });
    try {
      assert.equal(overrideDb.prepare('PRAGMA busy_timeout').get().timeout, 1234);
    } finally {
      overrideDb.close();
    }
  } finally {
    await rm(siteRoot, { recursive: true, force: true });
  }
});

test('agent path policy roster membership is site opt-in', async () => {
  const siteRoot: any = await mkdtemp(join(tmpdir(), 'narada-agent-path-policy-'));
  try {
    await mkdir(join(siteRoot, '.ai', 'agents'), { recursive: true });
    await mkdir(join(siteRoot, 'allowed'), { recursive: true });
    await mkdir(join(siteRoot, 'other'), { recursive: true });
    const rosterPath: any = join(siteRoot, '.ai', 'agents', 'roster.json');

    await writeFile(rosterPath, JSON.stringify({ agents: [] }), 'utf8');
    const defaultResult: any = resolveAgentPathPolicy(siteRoot, 'narada.architect');
    assert.equal(defaultResult.configured, false);
    assert.equal(defaultResult.allowed, true);
    assert.equal(defaultResult.roster_enforcement, 'disabled');
    assert.equal(defaultResult.reason, 'identity_not_in_roster_but_site_path_roster_enforcement_not_enabled');

    await writeFile(rosterPath, JSON.stringify({ enforce_agent_path_policy: true, agents: [] }), 'utf8');
    const strictResult: any = resolveAgentPathPolicy(siteRoot, 'narada.architect');
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

test('agent session roster membership is site opt-in', async () => {
  const siteRoot: any = await mkdtemp(join(tmpdir(), 'narada-agent-session-roster-'));
  try {
    await mkdir(join(siteRoot, '.ai', 'agents'), { recursive: true });
    const rosterPath: any = join(siteRoot, '.ai', 'agents', 'roster.json');

    const missingRoster: any = validateIdentityAgainstRoster(siteRoot, 'sonar.resident');
    assert.equal(missingRoster.valid, true);
    assert.equal(missingRoster.role, 'resident');
    assert.equal(missingRoster.roster_enforcement, 'disabled');
    assert.equal(missingRoster.role_binding.binding_authority, 'identity_inference_non_authoritative');

    await writeFile(rosterPath, JSON.stringify({ agents: [] }), 'utf8');
    const defaultResult: any = validateIdentityAgainstRoster(siteRoot, 'sonar.resident');
    assert.equal(defaultResult.valid, true);
    assert.equal(defaultResult.reason, 'identity_not_in_roster_but_site_session_roster_enforcement_not_enabled');
    assert.equal(defaultResult.role, 'resident');

    const dryRun: any = (materializeAgentSessionStart as any)({
      siteRoot,
      identity: 'sonar.resident',
      runtime: 'narada-agent-runtime-server',
      dryRun: true,
    });
    assert.equal(dryRun.status, 'dry_run');
    assert.equal(dryRun.role, 'resident');

    await writeFile(rosterPath, JSON.stringify({ enforce_session_roster: true, agents: [] }), 'utf8');
    const strictResult: any = validateIdentityAgainstRoster(siteRoot, 'sonar.resident');
    assert.equal(strictResult.valid, false);
    assert.equal(strictResult.error, 'identity_not_in_roster: sonar.resident');
  } finally {
    await rm(siteRoot, { recursive: true, force: true });
  }
});

test('agent context database opens without site-local migration files', async () => {
  const siteRoot: any = await mkdtemp(join(tmpdir(), 'narada-agent-context-'));
  try {
    const db: any = openAgentContextDb(siteRoot);
    try {
      const tables: any = new Set(
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row: any) => row.name)
      );
      assert.ok(tables.has('agent_start_events'));
      assert.ok(tables.has('agent_events'));
      assert.ok(tables.has('execution_context_materializations'));
      assert.ok(tables.has('codex_session_admissions'));

      const startColumns: any = new Set(db.prepare('PRAGMA table_info(agent_start_events)').all().map((column: any) => column.name));
      for (const column of ['event_id', 'identity_id', 'runtime', 'created_at', 'status', 'resume_command', 'bootstrap_artifact_uri']) {
        assert.ok(startColumns.has(column), `agent_start_events.${column} exists`);
      }

      const eventColumns: any = new Set(db.prepare('PRAGMA table_info(agent_events)').all().map((column: any) => column.name));
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
