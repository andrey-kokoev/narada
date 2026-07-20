import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiProcessInvocationRefusalError } from '@narada2/carrier-provider-support/ai-process-invocation';
import { buildCodexMcpRequest, buildOpenAiChatRequest } from './canonical-protocol-adapters.mjs';
import { sendCodex, sendHttp } from './canonical-transports.mjs';

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}/`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function fakeCodexOwner() {
  const child = new EventEmitter();
  child.stdin = {
    end() {
      setImmediate(() => {
        child.stdout.emit('data', `${JSON.stringify({ type: 'thread.started', thread_id: 'thread-canonical-test' })}\n`);
        child.stdout.emit('data', `${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } })}\n`);
        child.emit('exit', 0);
      });
    },
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  return {
    child,
    aiProcessInvocation: { admitted: true, lifecycle_state: 'admitted' },
    terminateTree() {},
  };
}

test('HTTP transport sends an explicitly shaped request', async () => {
  await withServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(body);
      assert.equal(request.url, '/v1/chat/completions');
      assert.equal(request.headers.authorization, 'Bearer test-key');
      assert.equal(payload.model, 'test-model');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
    });
  }, async (baseUrl) => {
    const request = buildOpenAiChatRequest([{ role: 'user', content: 'hello' }], [], {
      provider: 'openai-api',
      apiKey: 'test-key',
      baseUrl,
      model: 'test-model',
    });
    const result = await sendHttp(request, {});
    assert.equal(result.choices[0].message.content, 'ok');
  });
});

test('HTTP transport preserves acknowledged provider errors', async () => {
  await withServer((_request, response) => {
    response.statusCode = 429;
    response.end(JSON.stringify({ error: { message: 'rate limited' } }));
  }, async (baseUrl) => {
    const request = buildOpenAiChatRequest([{ role: 'user', content: 'hello' }], [], {
      provider: 'openai-api',
      apiKey: 'test-key',
      baseUrl,
      model: 'test-model',
    });
    await assert.rejects(
      () => sendHttp(request, {}),
      (error) => error.code === 'provider-response-error' && error.admission === 'acknowledged',
    );
  });
});

test('HTTP transport marks a pre-dispatch abort as not acknowledged', async () => {
  const controller = new AbortController();
  controller.abort();
  const request = buildOpenAiChatRequest([{ role: 'user', content: 'hello' }], [], {
    provider: 'openai-api',
    apiKey: 'test-key',
    baseUrl: 'https://example.invalid',
    model: 'test-model',
  });
  await assert.rejects(
    () => sendHttp(request, { abortSignal: controller.signal }),
    (error) => error.code === 'provider-request-aborted'
      && error.admission === 'not-acknowledged'
      && error.transportSubmitted === false,
  );
});

test('Codex transport carries canonical runtime scope and returns parsed output', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-canonical-codex-'));
  const sessionDir = join(siteRoot, '.ai', 'runtime', 'ai-process-invocation');
  const invocationScope = {
    schema: 'narada.ai_process_invocation_scope.v1',
    kind: 'narada_runtime_session',
    site_root: siteRoot,
    runtime_session_id: 'canonical-session',
  };
  const request = buildCodexMcpRequest([{ role: 'user', content: 'hello' }], [], {
    model: 'gpt-5.5',
    siteRoot,
    nativeMcpTools: false,
  });
  let invocation;
  const result = await sendCodex(request, {
    siteRoot,
    sessionDir,
    identity: 'sonar.resident',
    runtimeSessionId: 'canonical-session',
    invocationScope,
    codexAuthHome: siteRoot,
    spawnAiProcessInvocation: (input) => {
      invocation = input;
      return fakeCodexOwner();
    },
  });
  assert.equal(result.content, 'ok');
  assert.equal(result.threadId, 'thread-canonical-test');
  assert.equal(invocation.siteRoot, siteRoot);
  assert.deepEqual(invocation.invocationScope, invocationScope);
  assert.equal(invocation.env.NARADA_INTELLIGENCE_PROVIDER, undefined);
  assert.equal(invocation.env.CODEX_MODEL, undefined);
});

test('Codex process admission refusal remains a non-submitted refusal', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-canonical-codex-refusal-'));
  const request = buildCodexMcpRequest([{ role: 'user', content: 'hello' }], [], {
    model: 'gpt-5.5',
    siteRoot,
    nativeMcpTools: false,
  });
  const admission = { admitted: false, reason: 'codex_live_invocation_cap_exceeded' };
  await assert.rejects(
    () => sendCodex(request, {
      siteRoot,
      sessionDir: join(siteRoot, '.ai', 'runtime', 'ai-process-invocation'),
      codexAuthHome: siteRoot,
      spawnAiProcessInvocation: () => { throw new AiProcessInvocationRefusalError(admission); },
    }),
    (error) => error.code === 'provider-invocation-refused'
      && error.admission === 'not-acknowledged'
      && error.transportSubmitted === false
      && error.evidence.reason === admission.reason,
  );
});
