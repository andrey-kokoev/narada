import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createProviderCall } from './provider-call.mjs';
import { REQUEST_ADAPTERS } from './provider-adapters.mjs';
import { resolveProviderAdapter } from './provider-resolution.mjs';

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

test('provider call shapes and sends an OpenAI-compatible request', async () => {
  await withServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(body);
      assert.equal(request.url, '/v1/chat/completions');
      assert.equal(request.headers.authorization, 'Bearer test-key');
      assert.equal(payload.messages[0].content, 'hello');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
    });
  }, async (baseUrl) => {
    const events = [];
    const call = createProviderCall({ runtimeContext: { intelligenceProvider: 'openai-api', providerSettings: { apiKey: 'test-key', baseUrl, model: 'test-model' } } });
    const result = await call([{ role: 'user', content: 'hello' }], [], {
      invocationId: 'prov_inv_success',
      turnId: 'turn-success',
      inputEventId: 'input-success',
      invocationEventSink: (event) => events.push(event),
    });
    assert.equal(result.choices[0].message.content, 'ok');
    assert.deepEqual(events.map((event) => event.invocation_state), ['requested', 'validated', 'shaped', 'dispatched', 'receiving', 'completed']);
    assert.equal(new Set(events.map((event) => event.invocation_id)).size, 1);
    assert.equal(events.at(-1).invocation_id, 'prov_inv_success');
    assert.equal(events.at(-1).turn_id, 'turn-success');
    assert.equal(events.at(-1).input_event_id, 'input-success');
  });
});

test('declared Kimi, DeepSeek, and OpenRouter providers resolve to the shared adapter with provider-specific endpoints', () => {
  const cases = [
    {
      provider: 'kimi-api',
      baseUrl: 'https://api.moonshot.ai',
      expectedUrl: 'https://api.moonshot.ai/v1/chat/completions',
      model: 'kimi-k2.7',
    },
    {
      provider: 'kimi-code-api',
      baseUrl: 'https://api.kimi.com/coding/',
      expectedUrl: 'https://api.kimi.com/coding/v1/chat/completions',
      model: 'kimi-k2.7',
    },
    {
      provider: 'deepseek-api',
      baseUrl: 'https://api.deepseek.com',
      expectedUrl: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
    },
    {
      provider: 'openrouter-api',
      baseUrl: 'https://openrouter.ai/api/',
      expectedUrl: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'z-ai/glm-5.2',
    },
  ];

  for (const entry of cases) {
    const resolved = resolveProviderAdapter(entry.provider);
    const request = resolved.adapter.buildRequest(
      [{ role: 'user', content: 'hello' }],
      [],
      {
        provider: entry.provider,
        apiKey: 'test-key',
        baseUrl: entry.baseUrl,
        model: entry.model,
        openrouterSiteUrl: 'https://narada.test',
        openrouterTitle: 'Narada',
      },
    );
    assert.equal(resolved.adapter_id, 'openai-compatible-chat-completions');
    assert.equal(resolved.support_state, 'verified_supported');
    assert.equal(request.url.href, entry.expectedUrl);
    assert.equal(request.headers.Authorization, 'Bearer test-key');
    assert.equal(request.body.model, entry.model);
  }
});

test('provider-specific reasoning message fields use the explicit build provider', () => {
  const request = REQUEST_ADAPTERS['openai-compatible-chat-completions'].buildRequest(
    [
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read', arguments: '{}' } }],
      },
    ],
    [],
    {
      provider: 'deepseek-api',
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    },
  );
  assert.equal(request.body.messages[1].reasoning_content, '');
});

test('Codex continuation state is scoped to the provider call instance', () => {
  const messages = [{ role: 'user', content: 'continue' }];
  const first = REQUEST_ADAPTERS['codex-mcp-server'].buildRequest(messages, [], {
    model: 'gpt-5.5',
    codexSessionState: { threadId: 'thread-one' },
  });
  const second = REQUEST_ADAPTERS['codex-mcp-server'].buildRequest(messages, [], {
    model: 'gpt-5.5',
    codexSessionState: { threadId: 'thread-two' },
  });
  const fresh = REQUEST_ADAPTERS['codex-mcp-server'].buildRequest(messages, [], { model: 'gpt-5.5' });
  assert.equal(first.tool, 'codex-reply');
  assert.equal(first.arguments.threadId, 'thread-one');
  assert.equal(second.tool, 'codex-reply');
  assert.equal(second.arguments.threadId, 'thread-two');
  assert.equal(fresh.tool, 'codex');
});

test('provider call binds endpoint and credential to the selected provider despite decoys', async () => {
  await withServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(body);
      assert.equal(request.url, '/v1/chat/completions');
      assert.equal(request.headers.authorization, 'Bearer selected-kimi-key');
      assert.equal(payload.model, 'kimi-k2.7');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'selected provider ok' } }] }));
    });
  }, async (baseUrl) => {
    const call = createProviderCall({
      runtimeContext: { intelligenceProvider: 'kimi-code-api' },
      env: {
        NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
        NARADA_AI_BASE_URL: baseUrl,
        NARADA_AI_MODEL: 'kimi-k2.7',
        KIMI_CODE_API_KEY: 'selected-kimi-key',
        OPENAI_API_KEY: 'openai-decoy-key',
        OPENAI_BASE_URL: 'http://127.0.0.1:1/decoy',
      },
    });
    const result = await call([{ role: 'user', content: 'hello' }], []);
    assert.equal(result.choices[0].message.content, 'selected provider ok');
  });
});

test('provider call aborts an in-flight HTTP request', async () => {
  await withServer((_request, _response) => {}, async (baseUrl) => {
    const controller = new AbortController();
    const call = createProviderCall({ runtimeContext: { intelligenceProvider: 'openai-api', providerSettings: { apiKey: 'test-key', baseUrl } } });
    const events = [];
    const pending = call([{ role: 'user', content: 'hello' }], [], {
      abortSignal: controller.signal,
      invocationEventSink: (event) => events.push(event),
    });
    controller.abort();
    await assert.rejects(pending, /provider_request_aborted/);
    assert.equal(events.at(-1).invocation_state, 'interrupted');
  });
});

test('provider adapters preserve declared DeepSeek, Kimi, and OpenRouter request shaping', () => {
  const messages = [{ role: 'user', content: 'hello' }];
  const tool = [{ type: 'function', function: { name: 'read', parameters: { anyOf: [{ properties: { path: { type: 'string' } } }] } } }];
  const deepseek = REQUEST_ADAPTERS['openai-compatible-chat-completions'].buildRequest(messages, tool, { provider: 'deepseek-api', apiKey: 'key', baseUrl: 'https://example.test/', model: 'deepseek', thinking: 'high' });
  const kimi = REQUEST_ADAPTERS['openai-compatible-chat-completions'].buildRequest(messages, tool, { provider: 'kimi-api', apiKey: 'key', baseUrl: 'https://example.test/', model: 'kimi' });
  const openrouter = REQUEST_ADAPTERS['openai-compatible-chat-completions'].buildRequest(messages, [], { provider: 'openrouter-api', apiKey: 'key', baseUrl: 'https://example.test/', model: 'openrouter', openrouterSiteUrl: 'https://narada.test', openrouterTitle: 'Narada' });
  assert.deepEqual(deepseek.body.thinking, { type: 'enabled' });
  assert.equal(kimi.body.tools[0].function.parameters.type, 'object');
  assert.equal(openrouter.headers['HTTP-Referer'], 'https://narada.test');
  assert.equal(openrouter.headers['X-Title'], 'Narada');
});

test('provider call rejects provider error payloads', async () => {
  await withServer((_request, response) => {
    response.statusCode = 429;
    response.end(JSON.stringify({ error: { message: 'rate limited' } }));
  }, async (baseUrl) => {
    const events = [];
    const call = createProviderCall({ runtimeContext: { intelligenceProvider: 'openai-api', providerSettings: { apiKey: 'test-key', baseUrl } } });
    await assert.rejects(() => call([{ role: 'user', content: 'hello' }], [], { invocationEventSink: (event) => events.push(event) }), /API error 429/);
    assert.equal(events.at(-1).invocation_state, 'failed');
  });
});

