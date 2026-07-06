import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  accumulateCodexExecEvent,
  accumulateCodexExecText,
  buildOpenAiChatRequest,
  buildCodexSubprocessEnv,
  buildCodexExecArgs,
  configureProviderAdapterContext,
  createCodexExecTextAccumulator,
  joinAssistantTextParts,
  parseAnthropicMessagesResponse,
} from './provider-adapters.mjs';
import { resolveProviderAdapter } from './provider-resolution.mjs';
import { createCarrierRuntimeDependencies } from './runtime-dependencies.mjs';

const runtimeDependenciesSource = readFileSync(fileURLToPath(new URL('./runtime-dependencies.mjs', import.meta.url)), 'utf8');
const runtimeTailUtilsSource = readFileSync(fileURLToPath(new URL('./runtime-tail-utils.mjs', import.meta.url)), 'utf8');

test('codex-subscription provider execution uses shared command resolver', () => {
  assert.match(runtimeDependenciesSource, /@narada2\/carrier-provider-support\/codex-subscription-command/);
  assert.match(runtimeTailUtilsSource, /resolveCodexCommand\(/);
  assert.match(runtimeTailUtilsSource, /NARADA_CODEX_EXEC_COMMAND\/NARADA_CODEX_COMMAND/);
  assert.doesNotMatch(runtimeDependenciesSource, /NARADA_CODEX_EXEC_COMMAND \?\? process\.env\.NARADA_CODEX_COMMAND \?\? process\.env\.CODEX_COMMAND \?\? 'codex'/);
});

test('kimi deepseek and openrouter resolve to concrete OpenAI-compatible adapters', () => {
  for (const provider of ['kimi-api', 'kimi-code-api', 'deepseek-api', 'openrouter-api']) {
    const resolution = resolveProviderAdapter(provider);
    assert.equal(resolution.adapter_id, 'openai-compatible-chat-completions');
    assert.equal(resolution.support_status, 'verified_supported');
    assert.equal(typeof resolution.adapter.buildRequest, 'function');
  }
});

test('openrouter request shaping preserves provider and configured model identity', () => {
  const request = buildOpenAiChatRequest(
    [{ role: 'user', content: 'hello' }],
    [],
    {
      provider: 'openrouter-api',
      baseUrl: 'https://openrouter.example/api/',
      model: 'openrouter/test-model',
      apiKey: 'test-key',
      openrouterSiteUrl: 'https://narada.local',
      openrouterTitle: 'Narada Test',
    },
  );
  assert.equal(String(request.url), 'https://openrouter.example/api/v1/chat/completions');
  assert.equal(request.body.model, 'openrouter/test-model');
  assert.deepEqual(request.body.metadata, {
    narada_provider: 'openrouter-api',
    narada_model: 'openrouter/test-model',
  });
  assert.equal(request.headers.Authorization, 'Bearer test-key');
  assert.equal(request.headers['HTTP-Referer'], 'https://narada.local');
  assert.equal(request.headers['X-Title'], 'Narada Test');
});

test('kimi OpenAI-compatible requests normalize anyOf tool schema type placement', () => {
  const tool = {
    type: 'function',
    function: {
      name: 'fixture_tool',
      description: 'fixture',
      parameters: {
        type: 'object',
        anyOf: [
          { properties: { value: { type: 'string' } }, required: ['value'] },
          { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] },
        ],
      },
    },
  };
  const request = buildOpenAiChatRequest(
    [{ role: 'user', content: 'hello' }],
    [tool],
    { provider: 'kimi-code-api', baseUrl: 'https://api.kimi.com/coding/', model: 'kimi-k2.7', apiKey: 'test-key' },
  );
  const parameters = request.body.tools[0].function.parameters;
  assert.equal(parameters.type, 'object');
  assert.equal(parameters.anyOf, undefined);
  assert.deepEqual(Object.keys(parameters.properties).sort(), ['count', 'value']);
  assert.equal(tool.function.parameters.type, 'object');
});

test('non-kimi OpenAI-compatible requests preserve original tool schema', () => {
  const tool = {
    type: 'function',
    function: {
      name: 'fixture_tool',
      parameters: { type: 'object', anyOf: [{ properties: { value: { type: 'string' } } }] },
    },
  };
  const request = buildOpenAiChatRequest(
    [{ role: 'user', content: 'hello' }],
    [tool],
    { provider: 'openai-api', baseUrl: 'https://api.openai.com/', model: 'gpt-test', apiKey: 'test-key' },
  );
  assert.equal(request.body.tools[0].function.parameters, tool.function.parameters);
});

test('api-key providers refuse missing credentials before transport', async () => {
  for (const [provider, keyName] of [['kimi-code-api', 'KIMI_CODE_API_KEY'], ['deepseek-api', 'DEEPSEEK_API_KEY'], ['openrouter-api', 'OPENROUTER_API_KEY']]) {
    const { callChatApiFn } = createCarrierRuntimeDependencies({
      runtimeContext: { siteRoot: process.cwd() },
      env: { NARADA_INTELLIGENCE_PROVIDER: provider },
    });
    await assert.rejects(
      () => callChatApiFn([{ role: 'user', content: 'hello' }], [], { stream: false }),
      new RegExp(`Missing API key for ${provider}.*${keyName}`),
    );
  }
});

test('openrouter runtime adapter executes against mocked OpenAI-compatible transport', async () => {
  const seen = {};
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      seen.method = request.method;
      seen.url = request.url;
      seen.authorization = request.headers.authorization;
      seen.referer = request.headers['http-referer'];
      seen.title = request.headers['x-title'];
      seen.body = JSON.parse(body);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        id: 'openrouter-fixture',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }));
    });
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    const { callChatApiFn } = createCarrierRuntimeDependencies({
      runtimeContext: { siteRoot: process.cwd() },
      env: {
        NARADA_INTELLIGENCE_PROVIDER: 'openrouter-api',
        OPENROUTER_API_KEY: 'openrouter-key',
        OPENROUTER_BASE_URL: `http://127.0.0.1:${address.port}/api/`,
        OPENROUTER_MODEL: 'openrouter/test-model',
        OPENROUTER_SITE_URL: 'https://narada.local',
        OPENROUTER_APP_NAME: 'Narada Test',
      },
    });
    const response = await callChatApiFn([{ role: 'user', content: 'hello' }], [], { stream: false });
    assert.equal(response.id, 'openrouter-fixture');
    assert.equal(seen.method, 'POST');
    assert.equal(seen.url, '/api/v1/chat/completions');
    assert.equal(seen.authorization, 'Bearer openrouter-key');
    assert.equal(seen.referer, 'https://narada.local');
    assert.equal(seen.title, 'Narada Test');
    assert.equal(seen.body.model, 'openrouter/test-model');
    assert.deepEqual(seen.body.metadata, {
      narada_provider: 'openrouter-api',
      narada_model: 'openrouter/test-model',
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('codex-subscription subprocess env uses shared auth-home resolver and scrubs OpenAI API env', () => {
  const writes = [];
  const sessionDir = mkdtempSync(join(tmpdir(), 'narada-carrier-codex-env-'));
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  const previousOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
  const previousOpenAiModel = process.env.OPENAI_MODEL;
  const previousAuthHome = process.env.NARADA_CODEX_AUTH_HOME;
  try {
    process.env.OPENAI_API_KEY = 'must-not-leak';
    process.env.OPENAI_BASE_URL = 'https://api.openai.invalid';
    process.env.OPENAI_MODEL = 'must-not-leak-model';
    process.env.NARADA_CODEX_AUTH_HOME = 'D:/codex-auth-source';
    configureProviderAdapterContext({
      sessionDir,
      buildChildProcessEnv: (extra) => ({ ...process.env, ...extra }),
      writeDurableTextFile: (path, text) => writes.push({ path, text }),
    });
    const env = buildCodexSubprocessEnv({});
    assert.equal(env.CODEX_HOME, join(sessionDir, 'codex-home'));
    assert.equal(env.CODEX_CONFIG_DIR, join(sessionDir, 'codex-home'));
    assert.equal(env.OPENAI_API_KEY, undefined);
    assert.equal(env.OPENAI_BASE_URL, undefined);
    assert.equal(env.OPENAI_MODEL, undefined);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].path, join(sessionDir, 'codex-home', 'config.toml'));
  } finally {
    if (previousOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    if (previousOpenAiBaseUrl === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = previousOpenAiBaseUrl;
    if (previousOpenAiModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = previousOpenAiModel;
    if (previousAuthHome === undefined) delete process.env.NARADA_CODEX_AUTH_HOME; else process.env.NARADA_CODEX_AUTH_HOME = previousAuthHome;
    configureProviderAdapterContext({
      sessionDir: process.cwd(),
      buildChildProcessEnv: (extra = {}, baseEnv = process.env) => ({ ...baseEnv, ...extra, FORCE_COLOR: '0', NO_COLOR: '1' }),
      writeDurableTextFile: (path, text, encoding = 'utf8') => writeFileSync(path, text, encoding),
    });
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('codex-subscription provider execution is admitted through AiProcessInvocation', () => {
  assert.match(runtimeDependenciesSource, /@narada2\/carrier-provider-support\/ai-process-invocation/);
  assert.match(runtimeDependenciesSource, /spawnAiProcessInvocation\(\{ adapterKind: 'codex', projection: 'codex-subscription', purpose: 'provider_request'/);
  assert.match(runtimeDependenciesSource, /spawnAiProcessInvocation\(\{ adapterKind: 'codex', projection: 'codex-subscription', purpose: 'provider_request_buffered'/);
  assert.doesNotMatch(runtimeDependenciesSource, /const processOwner = spawnOwnedProcess\(command\.command/);
});

test('codex-subscription provider execution uses event-aware text assembly in both execution paths', () => {
  assert.match(runtimeDependenciesSource, /accumulateCodexExecEvent\(textState, event\)/);
  assert.doesNotMatch(runtimeDependenciesSource, /content \+= codexExecEventText\(event\)/);
  assert.doesNotMatch(runtimeDependenciesSource, /accumulateCodexExecText\(content,/);
});

test('codex-subscription exec args omit model when no explicit model is configured', () => {
  const args = buildCodexExecArgs({ arguments: { prompt: 'hello', cwd: 'D:/code/narada.test' } }, { model: null, thinking: 'medium' });
  assert.equal(args.includes('-m'), false);
});

test('codex-subscription exec args keep explicit model overrides', () => {
  const args = buildCodexExecArgs({ arguments: { prompt: 'hello', cwd: 'D:/code/narada.test', model: 'gpt-explicit' } }, { model: null, thinking: 'medium' });
  assert.deepEqual(args.slice(args.indexOf('-m'), args.indexOf('-m') + 2), ['-m', 'gpt-explicit']);
});

test('codex-subscription preserves embedded Narada tool calls while suppressing stream display', () => {
  const text = '{"narada_tool_call":{"name":"mailbox_messages_list","arguments":{"limit":1,"include_body":false}}}';
  const accumulated = accumulateCodexExecText('', text);
  assert.equal(accumulated.content, text);
  assert.equal(accumulated.appendText, text);
  assert.equal(accumulated.suppressStreaming, true);
});

test('codex-subscription separates completed agent messages with lifecycle-safe boundaries', () => {
  let state = createCodexExecTextAccumulator();
  state = accumulateCodexExecEvent(state, { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'A' } }).state;
  const second = accumulateCodexExecEvent(state, { type: 'item.completed', item: { id: 'b', type: 'agent_message', text: 'B' } });
  assert.equal(second.content, 'A\n\nB');
  assert.equal(second.appendText, '\n\nB');
});

test('codex-subscription does not duplicate final completed text after same-item deltas', () => {
  let state = createCodexExecTextAccumulator();
  state = accumulateCodexExecEvent(state, { type: 'item.delta', item: { id: 'a', type: 'agent_message' }, text_delta: 'Hello' }).state;
  const final = accumulateCodexExecEvent(state, { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'Hello world' } });
  assert.equal(final.content, 'Hello world');
  assert.equal(final.appendText, ' world');
});

test('codex-subscription emits boundary in stream append text for next completed agent message', () => {
  let state = createCodexExecTextAccumulator();
  state = accumulateCodexExecEvent(state, { type: 'item.completed', item: { id: 'first', type: 'agent_message', text: 'First message.' } }).state;
  const next = accumulateCodexExecEvent(state, { type: 'item.completed', item: { id: 'second', type: 'agent_message', text: 'Second message.' } });
  assert.equal(next.content, 'First message.\n\nSecond message.');
  assert.equal(next.appendText, '\n\nSecond message.');
});

test('codex-subscription buffered accumulation matches streamed append reconstruction', () => {
  const events = [
    { type: 'item.delta', item: { id: 'first', type: 'agent_message' }, text_delta: 'First' },
    { type: 'item.completed', item: { id: 'first', type: 'agent_message', text: 'First message.' } },
    { type: 'item.completed', item: { id: 'second', type: 'agent_message', text: 'Second message.' } },
  ];
  let streamState = createCodexExecTextAccumulator();
  let streamContent = '';
  for (const event of events) {
    const accumulated = accumulateCodexExecEvent(streamState, event);
    streamState = accumulated.state;
    streamContent += accumulated.appendText;
  }
  let bufferedState = createCodexExecTextAccumulator();
  for (const event of events) bufferedState = accumulateCodexExecEvent(bufferedState, event).state;
  assert.equal(streamContent, 'First message.\n\nSecond message.');
  assert.equal(bufferedState.content, streamContent);
});

test('assistant text part assembly preserves independent text block boundaries', () => {
  assert.equal(joinAssistantTextParts(['First block.', 'Second block.']), 'First block.\n\nSecond block.');
  const response = parseAnthropicMessagesResponse({
    id: 'anthropic_fixture',
    content: [{ type: 'text', text: 'First block.' }, { type: 'text', text: 'Second block.' }],
    stop_reason: 'end_turn',
  });
  assert.equal(response.choices[0].message.content, 'First block.\n\nSecond block.');
});
