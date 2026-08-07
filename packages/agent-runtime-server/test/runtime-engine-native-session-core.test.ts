import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createNarsSessionSupervisor } from '@narada-core/nars-session-core/session-supervisor';
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

test('Rust supervisor preserves the TypeScript supervisor turn/admission contract', {
  skip: !existsSync(nativeBinary),
  timeout: 30_000,
}, async () => {
  const tsRoot = await mkdtemp(join(tmpdir(), 'narada-supervisor-parity-ts-'));
  const rustRoot = await mkdtemp(join(tmpdir(), 'narada-supervisor-parity-rust-'));
  const summarize = (events: Record<string, any>[]) => ({
    lifecycle: events
      .filter((event) => event.event === 'session_lifecycle_transition')
      .map((event) => event.lifecycle_state),
    admission: events
      .filter((event) => (event.input_event_id ?? event.event_id) === 'input_parity' && ['input_event_queued', 'input_event_started'].includes(event.event))
      .map((event) => event.event === 'input_event_started' ? 'admitted' : 'queued'),
    turn: events
      .filter((event) => event.event === 'turn_lifecycle_transition' && event.turn_id === 'input_parity')
      .map((event) => event.turn_state),
    terminal: events
      .filter((event) => event.event === 'input_event_completed' && (event.input_event_id ?? event.event_id) === 'input_parity')
      .map((event) => event.terminal_state),
    assistant: events.some((event) => event.event === 'assistant_message' && event.turn_id === 'input_parity'),
  });
  try {
    const tsEventsPath = join(tsRoot, 'events.jsonl');
    const tsSupervisor = createNarsSessionSupervisor({
      sessionCoreOptions: {
        sessionId: 'parity-ts',
        agentId: 'parity-agent',
        sessionPath: join(tsRoot, 'session.json'),
        eventsPath: tsEventsPath,
        siteRoot: tsRoot,
      },
      carrier: {
        runTurn: async (context, eventSink) => {
          await eventSink({ kind: 'assistant_message', turn_id: context.turnId, content: 'hello' });
          return { content: 'hello' };
        },
      },
    });
    tsSupervisor.start();
    await tsSupervisor.submit({ event_id: 'input_parity', content: 'hello' });
    await tsSupervisor.close();
    const tsEvents = readFileSync(tsEventsPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, any>);

    const child = spawn(nativeBinary, [
      '--raw-jsonl', '--no-health', '--no-events', '--identity', 'parity-agent', '--session', 'parity-rust',
    ], {
      cwd: packageRoot,
      env: {
        ...process.env,
        NARADA_AGENT_ID: 'parity-agent',
        NARADA_SITE_ROOT: rustRoot,
        NARADA_RUNTIME_ENGINE: 'rust',
        NARADA_NATIVE_PROVIDER_MODE: 'echo',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.stdin.end([
      { id: 'input_parity', method: 'session.submit', params: { content: 'hello' } },
      { id: 'parity-close', method: 'session.close', params: {} },
    ].map((request) => JSON.stringify(request)).join('\n') + '\n');
    const exitCode = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`supervisor_parity_timeout:${stderr.slice(-400)}`)); }, 20_000);
      child.once('error', reject);
      child.once('close', (code) => { clearTimeout(timer); resolve(code ?? 1); });
    });
    assert.equal(exitCode, 0, stderr);
    const rustEventsPath = join(rustRoot, '.narada', 'crew', 'nars-sessions', 'parity-rust', 'events.jsonl');
    const rustEvents = readFileSync(rustEventsPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, any>);

    const tsSummary = summarize(tsEvents);
    const rustSummary = summarize(rustEvents);
    assert.deepEqual(rustSummary.admission, tsSummary.admission);
    assert.deepEqual(rustSummary.turn, tsSummary.turn);
    assert.deepEqual(rustSummary.terminal, tsSummary.terminal);
    assert.equal(rustSummary.assistant, tsSummary.assistant);
    assert.deepEqual(rustSummary.lifecycle.slice(0, 1), tsSummary.lifecycle.slice(0, 1));
    assert.equal(rustSummary.lifecycle.at(-1), 'closed');
  } finally {
    await rm(tsRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    await rm(rustRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('Rust and TypeScript preserve the terminal outcome matrix', {
  skip: !existsSync(nativeBinary),
  timeout: 60_000,
}, async () => {
  const modes = ['echo', 'refused', 'blocked', 'failed', 'interrupted'] as const;
  const summarize = (events: Record<string, any>[], inputId: string) => ({
    turn: events
      .filter((event) => event.event === 'turn_lifecycle_transition' && event.turn_id === inputId)
      .map((event) => event.turn_state),
    terminal: events
      .filter((event) => event.event === 'input_event_completed' && (event.input_event_id ?? event.event_id) === inputId)
      .map((event) => event.terminal_state),
    pending: events
      .filter((event) => event.event === 'session_recovery')
      .at(-1)?.operator_input_queue?.pending_count ?? null,
  });

  for (const mode of modes) {
    const inputId = `input_matrix_${mode}`;
    const tsRoot = await mkdtemp(join(tmpdir(), `narada-outcome-ts-${mode}-`));
    const rustRoot = await mkdtemp(join(tmpdir(), `narada-outcome-rust-${mode}-`));
    try {
      const tsEventsPath = join(tsRoot, 'events.jsonl');
      const ts = createNarsSessionSupervisor({
        sessionCoreOptions: {
          sessionId: `matrix-ts-${mode}`,
          agentId: 'matrix-agent',
          sessionPath: join(tsRoot, 'session.json'),
          eventsPath: tsEventsPath,
          siteRoot: tsRoot,
        },
        carrier: {
          runTurn: async (context, eventSink) => {
            if (mode === 'echo') {
              await eventSink({ kind: 'assistant_message', turn_id: context.turnId, content: 'matrix' });
              return { content: 'matrix' };
            }
            return { terminal_state: mode, error: `matrix_${mode}` };
          },
        },
      });
      ts.start();
      await ts.submit({ event_id: inputId, content: 'matrix' });
      await ts.close();
      const tsEvents = readFileSync(tsEventsPath, 'utf8')
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, any>);
      const tsSummary = {
        ...summarize(tsEvents, inputId),
        pending: ts.recovery().operator_input_queue.pending_count,
      };

      const child = spawn(nativeBinary, [
        '--raw-jsonl', '--no-health', '--no-events', '--identity', 'matrix-agent', '--session', `matrix-rust-${mode}`,
      ], {
        cwd: packageRoot,
        env: {
          ...process.env,
          NARADA_AGENT_ID: 'matrix-agent',
          NARADA_SITE_ROOT: rustRoot,
          NARADA_RUNTIME_ENGINE: 'rust',
          NARADA_NATIVE_PROVIDER_MODE: mode,
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
        { id: inputId, method: 'session.submit', params: { content: 'matrix' } },
        { id: `recovery-${mode}`, method: 'session.recovery', params: {} },
        { id: `close-${mode}`, method: 'session.close', params: {} },
      ].map((request) => JSON.stringify(request)).join('\n') + '\n');
      const exitCode = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error(`outcome_matrix_timeout:${mode}:${stderr.slice(-400)}`)); }, 20_000);
        child.once('error', reject);
        child.once('close', (code) => { clearTimeout(timer); resolve(code ?? 1); });
      });
      assert.equal(exitCode, 0, `${mode}: ${stderr}`);
      const rustEvents = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>);
      const rustEventsPath = join(rustRoot, '.narada', 'crew', 'nars-sessions', `matrix-rust-${mode}`, 'events.jsonl');
      const rustJournal = readFileSync(rustEventsPath, 'utf8')
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, any>);
      const rustSummary = {
        ...summarize(rustJournal, inputId),
        pending: summarize(rustEvents, inputId).pending,
      };
      assert.deepEqual(rustSummary.turn, tsSummary.turn, mode);
      assert.deepEqual(rustSummary.terminal, tsSummary.terminal, mode);
      assert.equal(rustSummary.pending, tsSummary.pending, mode);
    } finally {
      await rm(tsRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      await rm(rustRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
});
