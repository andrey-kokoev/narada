import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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
