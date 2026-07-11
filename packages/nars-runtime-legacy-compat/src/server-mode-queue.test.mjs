import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { createCarrierRuntimeDependencies } from './runtime-dependencies.mjs';
import { runCarrierServerMode } from './server-mode.mjs';
import { readJson, removeTempDir, tempRoot, waitFor } from './server-mode-test-helpers.mjs';

test('conversation.enqueue during an active turn queues without interrupting and persists in-flight state', async () => {
  const siteRoot = tempRoot('carrier-enqueue-test-');
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

    let releaseFirst;
    const firstTurnGate = new Promise((resolve) => { releaseFirst = resolve; });
    const providerCalls = [];
    const callChatApiFn = async (messages) => {
      providerCalls.push(messages.map((message) => ({ role: message.role, content: message.content })));
      if (providerCalls.length === 1) await firstTurnGate;
      return { choices: [{ message: { role: 'assistant', content: `done ${providerCalls.length}` } }] };
    };

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_enqueue_test' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_enqueue_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
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
    input.write(`${JSON.stringify({ id: 'enqueue', method: 'conversation.enqueue', params: { message: 'run after active turn', source: 'agent-web-ui' } })}\n`);
    await waitFor(() => events.some((event) => event.event === 'input_queued_for_turn_boundary'));
    const queuePath = join(sessionDir, 'operator-input-queue.json');
    assert.equal(existsSync(queuePath), true);
    const activeQueueState = readJson(queuePath);
    assert.equal(activeQueueState.pending_count, 2);
    assert.deepEqual(
      activeQueueState.pending.map((event) => event.content),
      ['original request', 'run after active turn'],
    );
    assert.equal(events.some((event) => event.event === 'turn_interrupted'), false);

    releaseFirst();
    input.end();
    await running;

    assert.equal(providerCalls.length, 2);
    assert.equal(providerCalls[1].some((message) => message.role === 'user' && message.content === 'run after active turn'), true);
    assert.equal(readJson(queuePath).pending_count, 0);
    assert.equal(events.some((event) => event.event === 'conversation_enqueue_requested'), true);
    assert.equal(events.some((event) => event.event === 'turn_interrupted'), false);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('server mode reloads pending operator input queue state on startup', async () => {
  const siteRoot = tempRoot('carrier-queue-restore-test-');
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_queue_restore_test' }).narsSessionDir;
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'operator-input-queue.json'), `${JSON.stringify({
      schema: 'narada.nars.operator_input_queue_state.v1',
      updated_at: '2026-06-30T00:00:00.000Z',
      revision: 1,
      pending_count: 1,
      pending: [{
        event_id: 'input_restored_1',
        source: 'programmatic_operator',
        source_kind: 'operator',
        source_id: 'agent-web-ui',
        transport: 'carrier_server_api',
        delivery_mode: 'admit_after_active_turn',
        created_at: '2026-06-30T00:00:00.000Z',
        received_at: '2026-06-30T00:00:00.000Z',
        content: 'restored operator input',
        metadata: {},
      }],
      last_transition: null,
    }, null, 2)}\n`, 'utf8');

    const providerCalls = [];
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_queue_restore_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    input.end();
    await runCarrierServerMode({
      input,
      output,
      callChatApiFn: async (messages) => {
        providerCalls.push(messages.map((message) => ({ role: message.role, content: message.content })));
        return { choices: [{ message: { role: 'assistant', content: 'restored done' } }] };
      },
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0].some((message) => message.role === 'user' && message.content === 'restored operator input'), true);
    assert.equal(readJson(join(sessionDir, 'operator-input-queue.json')).pending_count, 0);
  } finally {
    removeTempDir(siteRoot);
  }
});
