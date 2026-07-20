import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAnthropicMessagesRequest,
  buildCodexMcpRequest,
  buildCodexSubprocessEnv,
  buildOpenAiChatRequest,
} from './canonical-protocol-adapters.mjs';

test('canonical protocol shapers refuse missing planned coordinates', () => {
  assert.throws(
    () => buildOpenAiChatRequest([{ role: 'user', content: 'hello' }], [], {}),
    /canonical_endpoint_url_required/,
  );
  assert.throws(
    () => buildAnthropicMessagesRequest([{ role: 'user', content: 'hello' }], [], {
      baseUrl: 'https://api.anthropic.test',
    }),
    /canonical_invocation_model_required/,
  );
  assert.throws(
    () => buildCodexMcpRequest([{ role: 'user', content: 'hello' }], [], { model: 'gpt-5.5' }),
    /canonical_invocation_site_root_required/,
  );
});

test('OpenAI-compatible shaping uses only explicit provider, endpoint, model, and credential', () => {
  const cases = [
    ['kimi-api', 'https://api.moonshot.ai', 'https://api.moonshot.ai/v1/chat/completions', 'kimi-k2.7'],
    ['kimi-code-api', 'https://api.kimi.com/coding/', 'https://api.kimi.com/coding/v1/chat/completions', 'kimi-k2.7'],
    ['deepseek-api', 'https://api.deepseek.com', 'https://api.deepseek.com/v1/chat/completions', 'deepseek-chat'],
    ['openrouter-api', 'https://openrouter.ai/api/', 'https://openrouter.ai/api/v1/chat/completions', 'z-ai/glm-5.2'],
  ];
  for (const [provider, baseUrl, expectedUrl, model] of cases) {
    const request = buildOpenAiChatRequest([{ role: 'user', content: 'hello' }], [], {
      provider,
      apiKey: 'explicit-key',
      baseUrl,
      model,
      openrouterSiteUrl: 'https://narada.test',
      openrouterTitle: 'Narada',
    });
    assert.equal(request.url.href, expectedUrl);
    assert.equal(request.headers.Authorization, 'Bearer explicit-key');
    assert.equal(request.body.model, model);
  }
});

test('provider-specific request facts remain explicit protocol behavior', () => {
  const messages = [
    { role: 'user', content: 'hello' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read', arguments: '{}' } }],
    },
  ];
  const tool = [{ type: 'function', function: { name: 'read', parameters: { anyOf: [{ properties: { path: { type: 'string' } } }] } } }];
  const deepseek = buildOpenAiChatRequest(messages, tool, {
    provider: 'deepseek-api',
    apiKey: 'key',
    baseUrl: 'https://example.test/',
    model: 'deepseek',
    thinking: 'high',
  });
  const kimi = buildOpenAiChatRequest([{ role: 'user', content: 'hello' }], tool, {
    provider: 'kimi-api',
    apiKey: 'key',
    baseUrl: 'https://example.test/',
    model: 'kimi',
  });
  const openrouter = buildOpenAiChatRequest([{ role: 'user', content: 'hello' }], [], {
    provider: 'openrouter-api',
    apiKey: 'key',
    baseUrl: 'https://example.test/',
    model: 'openrouter',
    openrouterSiteUrl: 'https://narada.test',
    openrouterTitle: 'Narada',
  });
  assert.deepEqual(deepseek.body.thinking, { type: 'enabled' });
  assert.equal(deepseek.body.messages[1].reasoning_content, '');
  assert.equal(kimi.body.tools[0].function.parameters.type, 'object');
  assert.equal(openrouter.headers['HTTP-Referer'], 'https://narada.test');
  assert.equal(openrouter.headers['X-Title'], 'Narada');
});

test('Codex continuation state is explicit and isolated by the caller', () => {
  const siteRoot = 'D:/code/site';
  const messages = [{ role: 'user', content: 'continue' }];
  const first = buildCodexMcpRequest(messages, [], {
    model: 'gpt-5.5',
    siteRoot,
    codexSessionState: { threadId: 'thread-one' },
  });
  const second = buildCodexMcpRequest(messages, [], {
    model: 'gpt-5.5',
    siteRoot,
    codexSessionState: { threadId: 'thread-two' },
  });
  const fresh = buildCodexMcpRequest(messages, [], { model: 'gpt-5.5', siteRoot });
  assert.equal(first.tool, 'codex-reply');
  assert.equal(first.arguments.threadId, 'thread-one');
  assert.equal(second.arguments.threadId, 'thread-two');
  assert.equal(fresh.tool, 'codex');
});

test('Codex child projection scrubs ambient provider and model selection authority', () => {
  const sessionDir = mkdtempSync(join(tmpdir(), 'narada-canonical-protocol-'));
  const env = buildCodexSubprocessEnv({}, {
    sessionDir,
    codexAuthHome: sessionDir,
    buildChildProcessEnv: (extra) => ({
      ...extra,
      OPENAI_API_KEY: 'secret',
      OPENAI_BASE_URL: 'https://decoy.invalid',
      OPENAI_MODEL: 'decoy',
      NARADA_INTELLIGENCE_PROVIDER: 'decoy',
      CODEX_MODEL: 'decoy',
      NARADA_CODEX_MODEL: 'decoy',
      NARADA_AI_THINKING: 'decoy',
      NARADA_THINKING_LEVEL: 'decoy',
      CLOUDFLARE_CARRIER_AI_MODEL: 'decoy',
    }),
  });
  assert.ok(env.CODEX_HOME.startsWith(sessionDir));
  assert.equal(env.CODEX_CONFIG_DIR, env.CODEX_HOME);
  for (const name of [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_MODEL',
    'NARADA_INTELLIGENCE_PROVIDER',
    'CODEX_MODEL',
    'NARADA_CODEX_MODEL',
    'NARADA_AI_THINKING',
    'NARADA_THINKING_LEVEL',
    'CLOUDFLARE_CARRIER_AI_MODEL',
  ]) assert.equal(env[name], undefined, name);
});
