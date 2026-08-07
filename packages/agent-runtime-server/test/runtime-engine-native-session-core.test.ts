import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildSessionAuthorityEnvironment,
  normalizeSessionPrincipal,
  openLocalSessionAuthority,
} from '@narada-core/nars-session-authority';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const nativeBinary = join(
  packageRoot,
  '..',
  'native',
  'target',
  'release',
  process.platform === 'win32' ? 'narada-agent-runtime-server-rust.exe' : 'narada-agent-runtime-server-rust',
);

test('Rust owns the NARS session core and SQLite authority path without a Node runtime child', {
  skip: !existsSync(nativeBinary),
  timeout: 30_000,
}, async () => {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-native-session-core-'));
  const dbPath = join(siteRoot, '.ai', 'runtime', 'session-authority.sqlite');
  await mkdir(join(siteRoot, '.ai', 'runtime'), { recursive: true });
  const authority = openLocalSessionAuthority({ dbPath });
  const principal = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'resident' });
  const admission = authority.admitSession({
    principal,
    sessionId: 'native-session-authority',
    siteRoot,
    runtimeKind: 'narada-agent-runtime-server',
    operatorSurfaceKind: 'agent-cli',
    pid: null,
  });
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    NARADA_AGENT_ID: 'resident',
    NARADA_SITE_ID: 'sonar',
    NARADA_SITE_ROOT: siteRoot,
    NARADA_RUNTIME_ENGINE: 'rust',
    NARADA_NATIVE_PROVIDER_MODE: 'echo',
    NARADA_SESSION_AUTHORITY_REQUIRED: '1',
    ...buildSessionAuthorityEnvironment(admission),
  };
  delete childEnvironment.NARADA_RUNTIME_DELEGATE;
  delete childEnvironment.NARADA_RUNTIME_SERVER_SCRIPT;

  try {
    const child = spawn(nativeBinary, [
      '--raw-jsonl',
      '--no-health',
      '--no-events',
      '--identity',
      'resident',
      '--session',
      'native-session-authority',
    ], {
      cwd: packageRoot,
      env: childEnvironment,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.stdin.end([
      { id: 'health-1', method: 'session.health', params: {} },
      { id: 'sub-1', method: 'session.events.subscribe', params: { subscription_id: 'native-sub', include_replay: false, view: 'conversation' } },
      { id: 'submit-1', method: 'session.submit', params: { content: 'native session proof' } },
      { id: 'recovery-1', method: 'session.recovery', params: {} },
      { id: 'close-1', method: 'session.close', params: {} },
    ].map((request) => JSON.stringify(request)).join('\n') + '\n');
    const exitCode = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`native_session_core_timeout:${stderr.slice(-400)}`));
      }, 20_000);
      child.once('error', reject);
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve(code ?? 1);
      });
    });
    assert.equal(exitCode, 0, stderr);
    const records = stdout.trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
      try {
        return JSON.parse(line) as Record<string, any>;
      } catch (error) {
        throw new Error(`native_replay_invalid_stdout_line:${index}:${JSON.stringify(line)}`, { cause: error });
      }
    });
    const startup = records.find((record) => record.event === 'session_started');
    assert.equal(startup?.session_core_implementation, 'rust_native');
    assert.equal(startup?.session_authority_implementation, 'rust_sqlite');
    assert.equal(records.some((record) => record.event === 'input_admission_state_transition' && record.input_admission_state === 'admitted'), true);
    assert.equal(records.some((record) => record.event === 'assistant_message' && record.content === 'native-rust: native session proof'), true);
    assert.equal(records.some((record) => record.event === 'session_event' && record.subscription_id === 'native-sub' && record.payload?.event === 'assistant_message'), true);
    assert.equal(records.some((record) => record.event === 'session_recovery' && record.recovery_mode === 'native_rust_session_core'), true);
    assert.equal(records.some((record) => record.event === 'session_closed'), true);
    assert.equal(records.some((record) => record.delegated_to_node === true), false);

    const record = authority.inspectSession({ principal });
    assert.equal(record?.state, 'closed');
    assert.equal(record?.session_id, 'native-session-authority');
    const eventsPath = join(siteRoot, '.narada', 'crew', 'nars-sessions', 'native-session-authority', 'events.jsonl');
    const journal = readFileSync(eventsPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(journal.some((event) => event.event === 'session_closed'), true);
    assert.equal(journal.every((event, index) => event.event_sequence === index + 1), true);
    const indexPath = join(siteRoot, '.narada', 'crew', 'nars-sessions', 'native-session-authority', 'session-index-record.json');
    const indexRecord = JSON.parse(readFileSync(indexPath, 'utf8'));
    assert.equal(indexRecord.runtime_engine_kind, 'rust');
    assert.equal(indexRecord.terminal_state, 'closed');
    assert.equal(existsSync(join(siteRoot, '.narada', 'crew', 'nars-sessions', 'native-session-authority', 'session.jsonl')), true);
  } finally {
    authority.close();
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('Rust rehydrates a durable queue, records a recovery attempt, and preserves corrupt-line evidence', {
  skip: !existsSync(nativeBinary),
  timeout: 30_000,
}, async () => {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-native-replay-'));
  const sessionDirectory = join(siteRoot, '.narada', 'crew', 'nars-sessions', 'native-replay');
  const eventsPath = join(sessionDirectory, 'events.jsonl');
  const queuePath = join(sessionDirectory, 'operator-input-queue.json');
  await mkdir(sessionDirectory, { recursive: true });
  const prefix = [
    { event_sequence: 1, sequence: 1, event: 'session_lifecycle_transition', previous_state: 'starting', lifecycle_state: 'ready' },
    { event_sequence: 2, sequence: 2, event: 'input_event_queued', event_id: 'replay-input', input_event_id: 'replay-input', content: 'replay me', source_kind: 'operator', admission_state: 'queued' },
  ];
  await writeFile(eventsPath, `${prefix.map((event) => JSON.stringify(event)).join('\n')}\n{"event":\n`);
  await writeFile(queuePath, JSON.stringify({
    schema: 'narada.nars.operator_input_queue.v1',
    session_id: 'native-replay',
    pending: [{ event_id: 'replay-input', input_event_id: 'replay-input', content: 'replay me', source_kind: 'operator', admission_state: 'queued' }],
    pending_count: 1,
  }));
  try {
    const child = spawn(nativeBinary, [
      '--raw-jsonl', '--no-health', '--no-events', '--identity', 'resident', '--session', 'native-replay',
    ], {
      cwd: packageRoot,
      env: {
        ...process.env,
        NARADA_AGENT_ID: 'resident',
        NARADA_SITE_ID: 'sonar',
        NARADA_SITE_ROOT: siteRoot,
        NARADA_RUNTIME_ENGINE: 'rust',
        NARADA_NATIVE_PROVIDER_MODE: 'echo',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.stdin.end([
      { id: 'recovery-1', method: 'session.recovery', params: {} },
      { id: 'close-1', method: 'session.close', params: {} },
    ].map((request) => JSON.stringify(request)).join('\n') + '\n');
    const exitCode = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`native_replay_timeout:${stderr.slice(-400)}`)); }, 20_000);
      child.once('error', reject);
      child.once('close', (code) => { clearTimeout(timer); resolve(code ?? 1); });
    });
    assert.equal(exitCode, 0, stderr);
    const records = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>);
    const recoveryStates = records.filter((record) => record.event === 'recovery_attempt_state_transition').map((record) => record.recovery_attempt_state);
    assert.deepEqual(recoveryStates, ['requested', 'claimed', 'replaying', 'reconciled', 'completed']);
    assert.equal(records.some((record) => record.event === 'assistant_message' && record.content === 'native-rust: replay me'), true);
    const recovery = records.find((record) => record.event === 'session_recovery' && record.request_id === 'recovery-1');
    assert.equal(recovery?.corrupt_event_line_count, 1);
    assert.equal(recovery?.operator_input_queue?.pending_count, 0);
    assert.equal(recovery?.recovery_attempts?.length, 1);
    const journal = readFileSync(eventsPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(journal.some((event) => event.event === 'input_event_completed' && event.input_event_id === 'replay-input'), true);
    const sequences = journal.map((event) => event.event_sequence);
    assert.deepEqual(sequences, sequences.map((_: number, index: number) => index + 1));
  } finally {
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
