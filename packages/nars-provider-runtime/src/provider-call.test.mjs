import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createProviderCall } from './provider-call.mjs';
import { REQUEST_ADAPTERS } from './provider-adapters.mjs';

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
    const call = createProviderCall({ runtimeContext: { intelligenceProvider: 'openai-api', providerSettings: { apiKey: 'test-key', baseUrl, model: 'test-model' } } });
    const result = await call([{ role: 'user', content: 'hello' }], []);
    assert.equal(result.choices[0].message.content, 'ok');
  });
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
    const pending = call([{ role: 'user', content: 'hello' }], [], { abortSignal: controller.signal });
    controller.abort();
    await assert.rejects(pending, /provider_request_aborted/);
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
    const call = createProviderCall({ runtimeContext: { intelligenceProvider: 'openai-api', providerSettings: { apiKey: 'test-key', baseUrl } } });
    await assert.rejects(() => call([{ role: 'user', content: 'hello' }], []), /API error 429/);
  });
});
