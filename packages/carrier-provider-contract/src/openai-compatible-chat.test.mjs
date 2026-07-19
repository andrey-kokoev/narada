import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOpenAiChatRequest,
  extractOpenAiChatReply,
  reasoningEffort,
} from './openai-compatible-chat.mjs';
import { resolveProviderRuntimeBinding } from './provider-runtime-binding-core.mjs';

test('reasoningEffort maps thinking levels', () => {
  assert.equal(reasoningEffort('none'), null);
  assert.equal(reasoningEffort('low'), 'low');
  assert.equal(reasoningEffort('high'), 'high');
  assert.equal(reasoningEffort('medium'), 'medium');
  assert.equal(reasoningEffort(undefined), 'medium');
});

test('buildOpenAiChatRequest builds the canonical chat-completions shape', () => {
  const request = buildOpenAiChatRequest(
    [{ role: 'user', content: 'hello' }],
    [],
    { baseUrl: 'https://api.openai.com', model: 'gpt-5.5', apiKey: 'sk-test', thinking: 'high', provider: 'openai-api' },
  );
  assert.equal(request.url.toString(), 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.headers.Authorization, 'Bearer sk-test');
  assert.equal(request.body.model, 'gpt-5.5');
  assert.deepEqual(request.body.messages, [{ role: 'user', content: 'hello' }]);
  assert.equal(request.body.reasoning_effort, 'high');
  assert.equal(request.body.temperature, 0.2);
  assert.equal(request.body.tools, undefined);
});

test('buildOpenAiChatRequest applies kimi and tool behaviors', () => {
  const tools = [{ type: 'function', function: { name: 'session_context_read', description: 'd', parameters: { type: 'object' } } }];
  const request = buildOpenAiChatRequest(
    [{ role: 'user', content: 'hi' }],
    tools,
    { baseUrl: 'https://kimi.example.test', model: 'kimi-k2.7', apiKey: 'sk-kimi', thinking: 'low', provider: 'kimi-code-api' },
  );
  assert.equal(request.url.toString(), 'https://kimi.example.test/v1/chat/completions');
  assert.equal(request.headers['User-Agent'], 'KimiCLI/1.0');
  assert.equal(request.body.temperature, 1);
  assert.equal(request.body.tool_choice, 'auto');
  assert.equal(request.body.tools.length, 1);
  assert.equal(request.body.reasoning_effort, undefined);
});

test('buildOpenAiChatRequest applies deepseek thinking mapping', () => {
  const request = buildOpenAiChatRequest(
    [{ role: 'user', content: 'hi' }],
    [],
    { baseUrl: 'https://deepseek.example.test', model: 'deepseek', apiKey: 'sk-ds', thinking: 'xhigh', provider: 'deepseek-api' },
  );
  assert.deepEqual(request.body.thinking, { type: 'enabled' });
  assert.equal(request.body.reasoning_effort, 'max');
});

test('buildOpenAiChatRequest honors a provider chatPath override (GLM versioned path)', () => {
  const request = buildOpenAiChatRequest(
    [{ role: 'user', content: 'hi' }],
    [],
    { baseUrl: 'https://open.bigmodel.cn/api/paas/v4/', model: 'GLM-5.2', apiKey: 'sk-glm', thinking: 'medium', provider: 'glm-api', chatPath: 'chat/completions' },
  );
  assert.equal(request.url.toString(), 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
});

test('buildOpenAiChatRequest keeps the v1 convention when chatPath is unset', () => {
  const request = buildOpenAiChatRequest(
    [{ role: 'user', content: 'hi' }],
    [],
    { baseUrl: 'https://open.bigmodel.cn/api/paas/v4/', model: 'GLM-5.2', apiKey: 'sk-glm', provider: 'glm-api' },
  );
  assert.equal(request.url.toString(), 'https://open.bigmodel.cn/api/paas/v4/v1/chat/completions');
});

test('extractOpenAiChatReply parses content and tool calls with JSON arguments', () => {
  const reply = extractOpenAiChatReply({
    choices: [{
      message: {
        role: 'assistant',
        content: 'done',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'session_context_read', arguments: '{"topic":"x"}' } },
          { id: 'call_2', type: 'function', function: { name: 'broken', arguments: '{not json' } },
          { id: 'call_3', type: 'function', function: { arguments: '{}' } },
        ],
      },
    }],
  });
  assert.equal(reply.content, 'done');
  assert.deepEqual(reply.tool_calls, [
    { tool_name: 'session_context_read', arguments: { topic: 'x' } },
    { tool_name: 'broken', arguments: {} },
  ]);
});

test('extractOpenAiChatReply tolerates empty and malformed bodies', () => {
  assert.deepEqual(extractOpenAiChatReply(null).tool_calls, []);
  assert.equal(extractOpenAiChatReply({}).content, '');
  assert.equal(extractOpenAiChatReply({ output_text: 'alt' }).content, 'alt');
});

test('resolveProviderRuntimeBinding surfaces chat_completions_path from registry metadata', () => {
  const metadata = {
    'glm-api': {
      adapter_kind: 'openai-compatible-chat-completions',
      base_url: 'https://open.bigmodel.cn/api/paas/v4/',
      default_model: 'GLM-5.2',
      chat_completions_path: 'chat/completions',
      credential_env_names: ['GLM_API_KEY'],
      credential_secret_ref: 'narada/provider/glm-api/api-key',
    },
    'openai-api': {
      adapter_kind: 'openai-compatible-chat-completions',
      base_url: 'https://api.openai.com',
      default_model: 'gpt-5.5',
      credential_env_names: ['OPENAI_API_KEY'],
    },
  };
  const glm = resolveProviderRuntimeBinding('glm-api', { metadata, env: { GLM_API_KEY: 'sk-glm' } });
  assert.equal(glm.chat_completions_path, 'chat/completions');
  assert.equal(glm.credential_secret_ref, 'narada/provider/glm-api/api-key');
  const openai = resolveProviderRuntimeBinding('openai-api', { metadata, env: { OPENAI_API_KEY: 'sk-oai' } });
  assert.equal(openai.chat_completions_path, null);
});
