import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PROVIDER_SUPPORT_STATES,
  REQUEST_ADAPTERS,
  assertApiKeyConfigured,
  buildProgrammaticInputs,
  buildAnthropicMessagesRequest,
  buildCodexMcpRequest,
  buildCodexExecArgs,
  codexExecMcpConfigArgs,
  codexExecConfigToml,
  buildOpenAiChatRequest,
  codexExecEventText,
  createTerminalStyle,
  discoverAndStartMcpServers,
  executeMcpTool,
  formatKeyValueRows,
  formatToolResultContent,
  handleSlashCommand,
  normalizeInputRecord,
  normalizeThinkingLevel,
  parseArgs,
  parseBooleanEnv,
  parseColorEnv,
  parseCodexMcpResponse,
  removeInvalidToolHistory,
  parseAnthropicMessagesResponse,
  parseCodexExecJsonLine,
  parseNaradaToolCall,
  renderMarkdownForTerminal,
  runConversationTurn,
  resolveProviderAdapter,
  resolveProviderSupportState,
  sessionEventEntry,
  sessionLogEntry,
  wrapTerminalLine,
} from './agent-cli.mjs';

const metadata = JSON.parse(readFileSync(new URL('./intelligence-providers.json', import.meta.url), 'utf8')).providers;
const tempDir = resolve('.ai/tmp-agent-cli-programmatic-test');
mkdirSync(tempDir, { recursive: true });
const messageFile = resolve(tempDir, 'message.txt');
writeFileSync(messageFile, 'file supplied message', 'utf8');

const programmaticInputs = buildProgrammaticInputs({
  messages: ['flag supplied message'],
  messageFiles: [messageFile],
  authorityRef: 'task:1186',
});
assert.deepEqual(programmaticInputs, [
  { content: 'flag supplied message', source: 'programmatic_flag', authority_ref: 'task:1186' },
  { content: 'file supplied message', source: 'programmatic_file', authority_ref: 'task:1186' },
]);
assert.deepEqual(normalizeInputRecord('typed message'), { content: 'typed message', source: 'manual_operator' });
assert.deepEqual(removeInvalidToolHistory([
  { role: 'user', content: 'run startup sequence' },
  { role: 'tool', content: '{}', tool_call_id: 'orphan:0' },
  {
    role: 'assistant',
    content: null,
    tool_calls: [{ id: 'call:1', type: 'function', function: { name: 'startup_sequence', arguments: '{}' } }],
    reasoning_content: '',
  },
  { role: 'tool', content: '{"status":"ok"}', tool_call_id: 'call:1' },
]), [
  { role: 'user', content: 'run startup sequence' },
  {
    role: 'assistant',
    content: null,
    tool_calls: [{ id: 'call:1', type: 'function', function: { name: 'startup_sequence', arguments: '{}' } }],
    reasoning_content: '',
  },
  { role: 'tool', content: '{"status":"ok"}', tool_call_id: 'call:1' },
]);
const programmaticLogEntry = sessionLogEntry({ role: 'user', content: programmaticInputs[0].content, source: programmaticInputs[0].source, authorityRef: programmaticInputs[0].authority_ref });
assert.equal(programmaticLogEntry.role, 'user');
assert.equal(programmaticLogEntry.content, 'flag supplied message');
assert.equal(programmaticLogEntry.source, 'programmatic_flag');
assert.equal(programmaticLogEntry.authority_ref, 'task:1186');
assert.match(programmaticLogEntry.timestamp, /T/);
const eventEntry = sessionEventEntry('session_setting_changed', { setting: 'model', value: 'gpt-5.5' });
assert.equal(eventEntry.role, 'event');
assert.equal(eventEntry.event, 'session_setting_changed');
assert.equal(eventEntry.setting, 'model');
assert.equal(eventEntry.value, 'gpt-5.5');
assert.equal(normalizeThinkingLevel('HIGH'), 'high');
assert.equal(normalizeThinkingLevel('bad'), 'medium');
assert.equal(parseBooleanEnv('1', false), true);
assert.equal(parseBooleanEnv('off', true), false);
assert.equal(parseBooleanEnv(undefined, true), true);
assert.deepEqual(parseArgs(['--stream', '--model', 'gpt-x']), { stream: true, model: 'gpt-x' });
assert.deepEqual(parseArgs(['--no-stream', '--thinking', 'low']), { stream: false, thinking: 'low' });
assert.deepEqual(parseArgs(['--color', '--no-color']), { color: false });
assert.equal(parseColorEnv('off', true), false);
assert.equal(createTerminalStyle({ enabled: false }).prompt('narada> '), 'narada> ');
assert.equal(createTerminalStyle({ enabled: true }).prompt('narada> ').includes('\x1b['), true);
assert.equal(formatToolResultContent('{"status":"success","schema":"narada.test.v1","directive_count":2,"extra":true}'), 'success · narada.test.v1 · directives=2 · keys=status,schema,directive_count,extra');
assert.equal(formatKeyValueRows({ A: 1, Longer: 'two' }), 'A       1\nLonger  two');
assert.deepEqual(wrapTerminalLine('alpha beta gamma', 10), ['alpha beta', 'gamma']);
assert.equal(renderMarkdownForTerminal('- `code`').includes('• '), true);
rmSync(tempDir, { recursive: true, force: true });

const expectedAdapters = {
  'openai-api': 'openai-compatible-chat-completions',
  'kimi-api': 'openai-compatible-chat-completions',
  'anthropic-api': 'anthropic-messages',
  'codex-subscription': 'codex-mcp-server',
};
for (const [providerId, adapterId] of Object.entries(expectedAdapters)) {
  const support = resolveProviderSupportState(providerId, metadata[providerId], REQUEST_ADAPTERS);
  assert.equal(support.state, PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED);
  assert.equal(support.ready, true);
  assert.equal(support.required_next_step, 'Provider is verified for launch.');

  const resolution = resolveProviderAdapter(providerId, metadata, REQUEST_ADAPTERS);
  assert.equal(resolution.provider_id, providerId);
  assert.equal(resolution.adapter_id, adapterId);
  assert.notEqual(providerId, adapterId);
  assert.equal(resolution.support_state, PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED);
}
assert.throws(
  () => resolveProviderAdapter('future-api', {
    'future-api': { adapter_kind: 'future-wire-protocol', support_state: 'verified_supported' },
  }, REQUEST_ADAPTERS),
  /Request adapter not implemented for future-api: future-wire-protocol\. support_state=verified_supported\. Implement request adapter future-wire-protocol before launching this provider\./,
);
assert.throws(
  () => resolveProviderAdapter('paused-api', {
    'paused-api': { adapter_kind: 'anthropic-messages', support_state: 'adapter_implemented' },
  }, REQUEST_ADAPTERS),
  /Unsupported intelligence provider adapter for paused-api: adapter_implemented\. Verify launcher, docs, credential mapping, and runtime tests before marking verified_supported\./,
);
assert.throws(
  () => resolveProviderAdapter('staged-api', {
    'staged-api': { adapter_kind: 'anthropic-messages', support_state: 'admitted_unsupported' },
  }, REQUEST_ADAPTERS),
  /Unsupported intelligence provider adapter for staged-api: admitted_unsupported\. Implement request adapter anthropic-messages and move the provider to adapter_implemented\./,
);

const tools = [{
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read a file',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
}];

const messages = [
  { role: 'system', content: 'You are a test agent.' },
  { role: 'user', content: 'Read package metadata.' },
];

const anthropicRequest = buildAnthropicMessagesRequest(messages, tools, {
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4.6',
  apiKey: 'test-anthropic-key',
  thinking: 'high',
});

assert.equal(anthropicRequest.url.href, 'https://api.anthropic.com/v1/messages');
assert.equal(anthropicRequest.headers['x-api-key'], 'test-anthropic-key');
assert.equal(anthropicRequest.headers.Authorization, undefined);
assert.equal(anthropicRequest.headers['anthropic-version'], '2023-06-01');
assert.equal(anthropicRequest.body.model, 'claude-sonnet-4.6');
assert.equal(anthropicRequest.body.system, 'You are a test agent.');
assert.deepEqual(anthropicRequest.body.messages, [{ role: 'user', content: 'Read package metadata.' }]);
assert.deepEqual(anthropicRequest.body.tools, [{
  name: 'read_file',
  description: 'Read a file',
  input_schema: tools[0].function.parameters,
}]);
assert.deepEqual(anthropicRequest.body.thinking, { type: 'enabled', budget_tokens: 4096 });

const parsedAnthropic = parseAnthropicMessagesResponse({
  id: 'msg_123',
  stop_reason: 'tool_use',
  usage: { input_tokens: 12, output_tokens: 8 },
  content: [
    { type: 'text', text: 'I will read it.' },
    { type: 'tool_use', id: 'toolu_123', name: 'read_file', input: { path: 'package.json' } },
  ],
});

assert.equal(parsedAnthropic.choices[0].message.role, 'assistant');
assert.equal(parsedAnthropic.choices[0].message.content, 'I will read it.');
assert.equal(parsedAnthropic.choices[0].finish_reason, 'tool_calls');
assert.deepEqual(parsedAnthropic.choices[0].message.tool_calls, [{
  id: 'toolu_123',
  type: 'function',
  function: { name: 'read_file', arguments: JSON.stringify({ path: 'package.json' }) },
}]);

const openAiRequest = buildOpenAiChatRequest(messages, tools, {
  baseUrl: 'https://api.openai.com',
  model: 'gpt-5.5',
  apiKey: 'test-openai-key',
  thinking: 'low',
});
assert.equal(openAiRequest.url.href, 'https://api.openai.com/v1/chat/completions');
assert.equal(openAiRequest.headers.Authorization, 'Bearer test-openai-key');
assert.equal(openAiRequest.body.messages[0].role, 'system');
assert.equal(openAiRequest.body.tools[0].function.name, 'read_file');

const codexMcpRequest = buildCodexMcpRequest([
  { role: 'system', content: 'You are a test agent.' },
  { role: 'user', content: 'Say ok.' },
], tools, {
  model: 'gpt-5.5',
  thinking: 'high',
  siteRoot: 'C:/Users/Andrey/Narada',
});
assert.equal(codexMcpRequest.tool, 'codex');
assert.equal(codexMcpRequest.arguments.prompt, 'Say ok.');
assert.equal(codexMcpRequest.arguments.model, 'gpt-5.5');
assert.equal(codexMcpRequest.arguments['reasoning-effort'], 'high');
assert.equal(codexMcpRequest.arguments['developer-instructions'].startsWith('You are a test agent.'), true);
assert.equal(codexMcpRequest.arguments['developer-instructions'].includes('narada_tool_call'), true);
assert.equal(codexMcpRequest.arguments['developer-instructions'].includes('read_file'), true);
if (process.platform === 'win32') {
  assert.equal(codexMcpRequest.arguments.sandbox, 'danger-full-access');
} else {
  assert.equal(codexMcpRequest.arguments.sandbox, 'workspace-write');
}

const parsedCodex = parseCodexMcpResponse({ threadId: 'thread_123', content: 'ok' });
assert.equal(parsedCodex.choices[0].message.content, 'ok');
assert.equal(parsedCodex.choices[0].finish_reason, 'stop');
assert.deepEqual(parseNaradaToolCall('{"narada_tool_call":{"name":"agent_context_startup_sequence","arguments":{}}}'), {
  name: 'agent_context_startup_sequence',
  arguments: {},
});
const codexMcpReplyRequest = buildCodexMcpRequest([
  { role: 'user', content: 'Continue.' },
], [], {
  model: 'gpt-5.5-mini',
  thinking: 'low',
  siteRoot: 'C:/Users/Andrey/Narada',
});
assert.equal(codexMcpReplyRequest.tool, 'codex-reply');
assert.equal(codexMcpReplyRequest.arguments.threadId, 'thread_123');
assert.equal(codexMcpReplyRequest.arguments.model, 'gpt-5.5-mini');
assert.equal(codexMcpReplyRequest.arguments['reasoning-effort'], 'low');
const codexToolContinuationRequest = buildCodexMcpRequest([
  { role: 'user', content: 'run startup sequence' },
  { role: 'tool', tool_call_id: 'call_startup', content: '{"status":"success"}' },
], [], {
  model: 'gpt-5.5',
  thinking: 'medium',
  siteRoot: 'C:/Users/Andrey/Narada',
});
assert.equal(codexToolContinuationRequest.arguments.prompt.includes('Narada tool result'), true);
const codexFreshUserAfterToolRequest = buildCodexMcpRequest([
  { role: 'user', content: 'run startup sequence' },
  { role: 'tool', tool_call_id: 'call_startup', content: '{"status":"success"}' },
  { role: 'assistant', content: 'Startup sequence completed.' },
  { role: 'user', content: 'is this implemented? -> `D:\\code\\narada\\docs\\concepts\\directive-as-first-class-object.md`' },
], [], {
  model: 'gpt-5.5',
  thinking: 'medium',
  siteRoot: 'C:/Users/Andrey/Narada',
});
assert.equal(codexFreshUserAfterToolRequest.arguments.prompt.includes('is this implemented?'), true);
assert.equal(codexFreshUserAfterToolRequest.arguments.prompt.includes('Narada tool result'), false);
const parsedToolCodex = parseCodexMcpResponse({
  threadId: 'thread_tool',
  content: '```json\n{"narada_tool_call":{"name":"agent_context_startup_sequence","arguments":{}}}\n```',
});
assert.equal(parsedToolCodex.choices[0].message.tool_calls[0].function.name, 'agent_context_startup_sequence');
const streamedCodex = parseCodexMcpResponse({ threadId: 'thread_456', content: 'streamed', streaming_rendered: true });
assert.equal(streamedCodex.streaming_rendered, true);
const codexExecArgs = buildCodexExecArgs(codexMcpRequest, { model: 'gpt-5.5', thinking: 'high', siteRoot: 'D:/code/narada' });
assert.equal(codexExecArgs[0], 'exec');
assert.equal(codexExecArgs.includes('--json'), true);
assert.equal(codexExecArgs.includes('--dangerously-bypass-approvals-and-sandbox'), true);
assert.equal(codexExecArgs.includes('model_reasoning_effort="high"'), true);
assert.equal(codexExecArgs.includes('-C'), true);
assert.equal(codexExecArgs.at(-1).includes('Say ok.'), true);
const codexExecReplyArgs = buildCodexExecArgs(codexMcpReplyRequest, { model: 'gpt-5.5-mini', thinking: 'low', siteRoot: 'D:/code/narada' });
assert.deepEqual(codexExecReplyArgs.slice(0, 3), ['exec', 'resume', '--json']);
assert.equal(codexExecReplyArgs.includes('thread_123'), true);
assert.equal(codexExecReplyArgs.includes('-C'), false);
const codexConfigToml = codexExecConfigToml({
  'narada-proper': {
    config: {
      command: 'node',
      args: ['--import', 'tsx', 'D:\\code\\narada\\packages\\narada-proper-mcp\\src\\main.ts'],
    },
  },
});
assert.match(codexConfigToml, /\[mcp_servers\."narada-proper"\]/);
assert.match(codexConfigToml, /default_tools_approval_mode = "approve"/);
assert.match(codexConfigToml, /packages\/narada-proper-mcp\/src\/main\.ts/);
const codexMcpConfigArgs = codexExecMcpConfigArgs({
  'narada-proper': {
    config: {
      command: 'node',
      args: ['--import', 'tsx', 'D:\\code\\narada\\packages\\narada-proper-mcp\\src\\main.ts'],
    },
  },
});
assert.equal(codexMcpConfigArgs.includes('-c'), true);
assert.equal(codexMcpConfigArgs.some((arg) => arg.includes('mcp_servers."narada-proper".command=')), true);
assert.equal(codexMcpConfigArgs.some((arg) => arg.includes('default_tools_approval_mode="approve"')), true);
const event = parseCodexExecJsonLine('\u001b[32m{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}\u001b[0m');
assert.equal(codexExecEventText(event), 'hello');

assert.equal(await handleSlashCommand('/help', { mcpServers: {}, allTools: [] }), 'handled');
assert.equal(await handleSlashCommand('/bad', { mcpServers: {}, allTools: [] }), 'handled');
assert.equal(await handleSlashCommand('plain message', { mcpServers: {}, allTools: [] }), 'none');
assert.equal(await handleSlashCommand('/exit', { mcpServers: {}, allTools: [] }), 'exit');

assert.throws(
  () => assertApiKeyConfigured('anthropic-api', ''),
  /Missing API key for anthropic-api\. Set ANTHROPIC_API_KEY or NARADA_AI_API_KEY\./,
);
assert.throws(
  () => assertApiKeyConfigured('openai-api', ''),
  /Missing API key for openai-api\. Set NARADA_AI_API_KEY\./,
);
assert.doesNotThrow(() => assertApiKeyConfigured('codex-subscription', ''));

const emitted = [];
const fakeMessages = [
  { role: 'system', content: 'You are a test agent.' },
  { role: 'user', content: 'Call the test tool.' },
];
let fakeCallCount = 0;
await runConversationTurn(
  fakeMessages,
  [{
    type: 'function',
    function: {
      name: 'read_file',
      description: 'fixture tool',
      parameters: { type: 'object', properties: {} },
    },
  }],
  {
    fixture: {
      tools: [{ name: 'read_file' }],
      send: async () => ({
        result: {
          content: [{ text: JSON.stringify({ status: 'ok', output_ref: 'mcp_output:o_test' }) }],
        },
      }),
      config: {},
    },
  },
  null,
  {
    turn: { turnId: 'turn_test', interruptRequested: false },
    emit: (event, payload) => emitted.push({ event, ...payload }),
    callChatApiFn: async () => {
      fakeCallCount += 1;
      if (fakeCallCount === 1) {
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: 'Calling tool.',
              tool_calls: [{
                id: 'call_test',
                type: 'function',
                function: { name: 'read_file', arguments: '{}' },
              }],
            },
          }],
        };
      }
      return { choices: [{ message: { role: 'assistant', content: 'Done.' } }] };
    },
  },
);
assert.equal(emitted.some((event) => event.event === 'assistant_message' && event.content === 'Calling tool.'), true);
assert.equal(emitted.some((event) => event.event === 'tool_call' && event.tool === 'read_file'), true);
assert.equal(emitted.some((event) => event.event === 'tool_result' && event.output_ref === 'mcp_output:o_test'), true);
assert.equal(emitted.some((event) => event.event === 'tool_result' && event.tool === 'read_file' && event.decision === 'read_only_admitted'), true);
const readOnlyToolCallEvent = emitted.find((event) => event.event === 'tool_call' && event.tool === 'read_file');
assert.equal('arguments' in readOnlyToolCallEvent, false);
assert.equal(readOnlyToolCallEvent.raw_arguments_recorded, false);
assert.equal(readOnlyToolCallEvent.decision, 'read_only_admitted');

const interruptedTurn = { turnId: 'turn_interrupt', interruptRequested: false };
setTimeout(() => {
  interruptedTurn.interruptRequested = true;
}, 20);
const interruptedResult = await runConversationTurn(
  [{ role: 'user', content: 'wait' }],
  [],
  {},
  null,
  {
    turn: interruptedTurn,
    emit: (event, payload) => emitted.push({ event, ...payload }),
    callChatApiFn: async () => new Promise((resolveDelay) => {
      setTimeout(() => resolveDelay({ choices: [{ message: { role: 'assistant', content: 'late' } }] }), 60);
    }),
  },
);
assert.equal(interruptedResult.terminal_state, 'interrupted');
assert.equal(emitted.some((event) => event.event === 'turn_interrupted' && event.turn_id === 'turn_interrupt'), true);

const admissionEvents = [];
let mutatingToolSendCalled = false;
const admissionSite = mkdtempSync(join(tmpdir(), 'narada-agent-cli-admission-'));
const admissionResult = await executeMcpTool(
  {
    id: 'call_mutating',
    type: 'function',
    function: { name: 'task_lifecycle_claim', arguments: '{"task_number":1228}' },
  },
  {
    fixture: {
      tools: [{ name: 'task_lifecycle_claim' }],
      registry_tools: {
        task_lifecycle_claim: {
          read_only: false,
          family: 'task_lifecycle_mutation',
          authority_owner: 'task_governance_service',
          source: 'surface_registry',
          reason: 'test_registry_mutating_tool',
        },
      },
      send: async () => {
        mutatingToolSendCalled = true;
        throw new Error('mutating tool should not execute without admission');
      },
      config: {},
    },
  },
  null,
  {
    turnId: 'turn_admission',
    serverMode: true,
    agentId: 'narada-andrey.Kevin',
    carrierSessionId: 'narada-andrey-Kevin',
    siteRoot: admissionSite,
    emit: (event, payload) => admissionEvents.push({ event, ...payload }),
  },
);
const admissionContent = JSON.parse(admissionResult.content);
assert.equal(mutatingToolSendCalled, false);
assert.equal(admissionContent.error, 'action_admission_required');
assert.equal(admissionContent.request_id, 'car_act_narada-andrey-Kevin_turn_admission_call_mutating_d7a2d0d7577d5d93');
assert.equal(admissionContent.decision, 'routed');
assert.equal(admissionContent.authority_owner, 'task_governance_service');
assert.equal(admissionContent.carrier_mutation_admitted, false);
assert.equal(typeof admissionContent.candidate_ref, 'string');
assert.equal(admissionEvents.some((event) => event.event === 'tool_result' && event.status === 'admission_required'), true);
const admissionEvent = admissionEvents.find((event) => event.event === 'tool_result' && event.status === 'admission_required');
const admissionToolCallEvent = admissionEvents.find((event) => event.event === 'tool_call' && event.tool === 'task_lifecycle_claim');
assert.deepEqual(admissionToolCallEvent.argument_summary.keys, ['task_number']);
assert.equal(admissionToolCallEvent.raw_arguments_recorded, false);
assert.equal('arguments' in admissionToolCallEvent, false);
assert.equal(admissionEvent.request_id, admissionContent.request_id);
assert.equal(admissionEvent.decision, 'routed');
assert.equal(admissionEvent.evidence_path, admissionContent.evidence_path);
assert.equal(admissionEvent.candidate_ref, admissionContent.candidate_ref);
const admissionEvidenceText = readFileSync(admissionContent.evidence_path, 'utf8');
const admissionEvidence = JSON.parse(admissionEvidenceText);
assert.equal(admissionEvidence.schema, 'narada.carrier_action_admission_decision.v0');
assert.equal(admissionEvidence.request.requested_action.tool, 'task_lifecycle_claim');
assert.deepEqual(admissionEvidence.request.requested_action.argument_summary.keys, ['task_number']);
assert.equal(admissionEvidence.request.requested_action.classifier_source, 'surface_registry');
assert.doesNotMatch(admissionEvidenceText, /1228/);
const admissionCandidateText = readFileSync(admissionContent.candidate_ref, 'utf8');
const admissionCandidate = JSON.parse(admissionCandidateText);
assert.equal(admissionCandidate.schema, 'narada.carrier_action_candidate.task.v1');
assert.equal(admissionCandidate.source_admission_evidence_path, admissionContent.evidence_path);
assert.doesNotMatch(admissionCandidateText, /1228/);
rmSync(admissionSite, { recursive: true, force: true });

const missingToolEvents = [];
const missingToolSite = mkdtempSync(join(tmpdir(), 'narada-agent-cli-missing-tool-'));
const missingToolResult = await executeMcpTool(
  {
    id: 'call_missing_mutating',
    type: 'function',
    function: { name: 'task_lifecycle_claim', arguments: '{"task_number":1228}' },
  },
  {},
  null,
  {
    turnId: 'turn_missing_tool',
    serverMode: true,
    agentId: 'narada-andrey.Kevin',
    carrierSessionId: 'narada-andrey-Kevin',
    siteRoot: missingToolSite,
    emit: (event, payload) => missingToolEvents.push({ event, ...payload }),
  },
);
const missingToolContent = JSON.parse(missingToolResult.content);
assert.equal(missingToolContent.error, 'action_admission_required');
assert.equal(missingToolContent.decision, 'refused');
assert.equal(missingToolContent.reason, 'mcp_tool_not_available');
assert.equal(missingToolEvents.some((event) => event.event === 'tool_result' && event.status === 'admission_required'), true);
assert.equal(missingToolEvents.some((event) => event.event === 'tool_result' && event.status === 'error'), false);
const missingToolCallEvent = missingToolEvents.find((event) => event.event === 'tool_call');
assert.equal('arguments' in missingToolCallEvent, false);
assert.equal(missingToolCallEvent.raw_arguments_recorded, false);
assert.equal(missingToolCallEvent.decision, 'refused');
const missingToolEvidence = JSON.parse(readFileSync(missingToolContent.evidence_path, 'utf8'));
assert.equal(missingToolEvidence.reason, 'mcp_tool_not_available');
rmSync(missingToolSite, { recursive: true, force: true });

const discoveredSite = mkdtempSync(join(tmpdir(), 'narada-agent-cli-discovered-mcp-'));
mkdirSync(join(discoveredSite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(discoveredSite, '.narada', 'capabilities'), { recursive: true });
const fixtureServerPath = join(discoveredSite, 'fixture-mcp-server.mjs');
writeFileSync(fixtureServerPath, `
import readline from 'node:readline';
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') {
    console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05' } }));
    return;
  }
  if (request.method === 'tools/list') {
    console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { tools: [
      { name: 'task_lifecycle_claim', description: 'claim', inputSchema: { type: 'object', properties: {} } },
      { name: 'read_file', description: 'read', inputSchema: { type: 'object', properties: {} } }
    ] } }));
    return;
  }
  if (request.method === 'tools/call') {
    console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { content: [{ text: '{"status":"executed"}' }] } }));
  }
});
`, 'utf8');
writeFileSync(join(discoveredSite, '.ai', 'mcp', 'fixture-mcp.json'), `${JSON.stringify({
  mcpServers: {
    fixture: {
      transport: 'stdio',
      command: 'node',
      args: [fixtureServerPath],
      surface_id: 'fixture.surface',
    },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(discoveredSite, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  surfaces: [{
    surface_id: 'fixture.surface',
    client_config: { generated_path: '.ai/mcp/fixture-mcp.json' },
    tool_contract: {
      read_only_tools: [],
      mutating_tools: ['task_lifecycle_claim'],
      refused_tools: [],
    },
  }],
}, null, 2)}\n`, 'utf8');
const discoveredServers = await discoverAndStartMcpServers(discoveredSite);
try {
  const discoveredEvents = [];
  const discoveredAdmission = await executeMcpTool(
    {
      id: 'call_discovered_registry',
      type: 'function',
      function: { name: 'task_lifecycle_claim', arguments: '{"task_number":1228}' },
    },
    discoveredServers,
    null,
    {
      turnId: 'turn_discovered_registry',
      serverMode: true,
      agentId: 'narada.test',
      carrierSessionId: 'carrier-discovered',
      siteRoot: discoveredSite,
      emit: (event, payload) => discoveredEvents.push({ event, ...payload }),
    },
  );
  const discoveredContent = JSON.parse(discoveredAdmission.content);
  const discoveredEvidence = JSON.parse(readFileSync(discoveredContent.evidence_path, 'utf8'));
  assert.equal(discoveredEvidence.request.requested_action.classifier_source, 'surface_registry');
  assert.equal(discoveredEvidence.request.requested_action.classifier_metadata.surface_id, 'fixture.surface');
  assert.equal(discoveredEvidence.request.requested_action.classifier_metadata.server_name, 'fixture');
  assert.equal(discoveredEvents.find((event) => event.event === 'tool_call').classifier_source, 'surface_registry');

  const unlistedRead = await executeMcpTool(
    {
      id: 'call_discovered_unlisted_read',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"package.json"}' },
    },
    discoveredServers,
    null,
    {
      turnId: 'turn_discovered_unlisted',
      serverMode: true,
      agentId: 'narada.test',
      carrierSessionId: 'carrier-discovered',
      siteRoot: discoveredSite,
      emit: () => {},
    },
  );
  const unlistedContent = JSON.parse(unlistedRead.content);
  assert.equal(unlistedContent.error, 'action_admission_required');
  assert.equal(unlistedContent.reason, 'surface_registry_tool_not_declared');
} finally {
  await Promise.all(Object.values(discoveredServers).map((server) => stopChildProcess(server.process)));
  rmSync(discoveredSite, { recursive: true, force: true });
}

const serverSite = mkdtempSync(join(tmpdir(), 'narada-agent-cli-server-'));
mkdirSync(join(serverSite, '.ai', 'mcp'), { recursive: true });
const child = spawn(process.execPath, [
  fileURLToPath(new URL('./agent-cli.mjs', import.meta.url)),
  '--server',
  '--identity', 'narada.test',
  '--session', 'server-test',
], {
  env: {
    ...process.env,
    NARADA_SITE_ROOT: serverSite,
    NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
child.stdin.write('not json\n');
child.stdin.write(`${JSON.stringify({ id: 'status-1', method: 'session.status', params: {} })}\n`);
child.stdin.write(`${JSON.stringify({ id: 'close-1', method: 'session.close', params: {} })}\n`);
child.stdin.end();
const exitCode = await new Promise((resolveExit) => child.on('exit', resolveExit));
assert.equal(exitCode, 0);
const serverEvents = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
assert.equal(serverEvents[0].event, 'session_started');
assert.equal(serverEvents.some((event) => event.event === 'error' && event.code === 'invalid_json'), true);
assert.equal(serverEvents.some((event) => event.event === 'session_status' && event.request_id === 'status-1'), true);
assert.equal(serverEvents.at(-1).event, 'session_closed');
assert.equal(stdout.includes('[agent-cli]'), false);
assert.equal(stderr.includes('Fatal error'), false);
rmSync(serverSite, { recursive: true, force: true });

console.log('agent-cli adapter tests PASSED.');

function stopChildProcess(proc) {
  if (!proc || proc.exitCode !== null) return Promise.resolve();
  return new Promise((resolveStop) => {
    proc.once('exit', () => resolveStop());
    proc.kill();
    setTimeout(resolveStop, 1000);
  });
}
