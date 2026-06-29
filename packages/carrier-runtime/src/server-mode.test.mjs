import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createCarrierRuntimeDependencies } from './runtime-dependencies.mjs';
import { runCarrierServerMode } from './server-mode.mjs';

function waitFor(predicate, { timeoutMs = 1000 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(poll, 5);
    };
    poll();
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('server mode writes NARS session index record on startup', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-index-start-test-'));
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    const sessionId = 'carrier_20260623001000_start';
    const sessionDir = join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId);
    const runtimeContext = {
      identity: 'sonar.resident',
      session: sessionId,
      siteId: 'sonar',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      healthUrl: 'http://127.0.0.1:12346/health',
      eventStreamUrl: 'ws://127.0.0.1:12345/events',
      operatorSurfaceKind: 'agent-web-ui',
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    const recordPath = join(sessionDir, 'session-index-record.json');
    const aggregatePath = join(siteRoot, '.narada', 'crew', 'nars-sessions', 'index.json');
    assert.equal(existsSync(recordPath), true);
    assert.equal(existsSync(aggregatePath), true);
    const record = readJson(recordPath);
    assert.equal(record.schema, 'narada.nars.session_index_record.v1');
    assert.equal(record.session_id, sessionId);
    assert.equal(record.agent_id, 'sonar.resident');
    assert.equal(record.site_id, 'sonar');
    assert.equal(record.site_id_source, 'session_started');
    assert.equal(record.launch_operator_surface_kind, 'agent-web-ui');
    assert.equal(record.event_endpoint, 'ws://127.0.0.1:12345/events');
    assert.equal(record.health_endpoint, 'http://127.0.0.1:12346/health');
    assert.equal(record.terminal_state, 'closed');
    assert.equal(record.terminal_reason, 'runtime_process_exit');
    const aggregate = readJson(aggregatePath);
    assert.equal(aggregate.sessions.length, 1);
    assert.equal(aggregate.sessions[0].session_id, sessionId);
    assert.equal(aggregate.sessions[0].terminal_state, 'closed');
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('conversation.steer interrupts the active turn and becomes the next provider input', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-steer-test-'));
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    const events = [];
    let outputBuffer = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) events.push(JSON.parse(line));
      }
    });

    const providerCalls = [];
    const callChatApiFn = async (messages, tools, settings) => {
      providerCalls.push(messages.map((message) => ({ role: message.role, content: message.content })));
      if (providerCalls.length === 1) {
        await new Promise((resolve, reject) => {
          settings.abortSignal?.addEventListener?.('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
      return { choices: [{ message: { role: 'assistant', content: 'done' } }] };
    };

    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_steer_test',
      siteRoot,
      sessionPath: join(siteRoot, 'session.jsonl'),
      eventsPath: join(siteRoot, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn,
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'first', method: 'conversation.send', params: { message: 'original request', source: 'programmatic_operator' } })}\n`);
    await waitFor(() => events.some((event) => event.event === 'turn_started') && providerCalls.length === 1);
    const userMessageIndex = events.findIndex((event) => event.event === 'user_message' && event.content === 'original request' && event.source === 'programmatic_operator');
    const firstTurnStartedIndex = events.findIndex((event) => event.event === 'turn_started');
    assert.notEqual(userMessageIndex, -1);
    assert.equal(userMessageIndex < firstTurnStartedIndex, true);
    input.write(`${JSON.stringify({ id: 'steer', method: 'conversation.steer', params: { message: 'change course' } })}\n`);
    input.end();

    await running;

    assert.equal(providerCalls.length, 2);
    assert.equal(providerCalls[0].some((message) => message.role === 'user' && message.content === 'original request'), true);
    assert.equal(providerCalls[1].some((message) => message.role === 'user' && message.content === 'original request'), true);
    assert.equal(providerCalls[1].some((message) => message.role === 'user' && message.content.includes('Operator steering for interrupted active turn') && message.content.includes('change course')), true);
    const steerEventIndex = events.findIndex((event) => event.event === 'conversation_steer_requested');
    const interruptEventIndex = events.findIndex((event) => event.event === 'turn_interrupted' && event.reason === 'operator_steering');
    assert.notEqual(steerEventIndex, -1);
    assert.notEqual(interruptEventIndex, -1);
    assert.equal(events[steerEventIndex].delivery_semantics, 'interrupt_active_turn_then_admit_next_turn');
    assert.equal(steerEventIndex < interruptEventIndex, true);
    assert.equal(events.some((event) => event.event === 'turn_complete' && event.terminal_state === 'interrupted'), true);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});
