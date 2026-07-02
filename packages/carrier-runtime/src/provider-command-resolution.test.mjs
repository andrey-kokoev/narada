import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { accumulateCodexExecText, buildCodexExecArgs } from './provider-adapters.mjs';

const runtimeDependenciesSource = readFileSync(fileURLToPath(new URL('./runtime-dependencies.mjs', import.meta.url)), 'utf8');

test('codex-subscription provider execution uses shared command resolver', () => {
  assert.match(runtimeDependenciesSource, /@narada2\/carrier-provider-support\/codex-subscription-command/);
  assert.match(runtimeDependenciesSource, /resolveCodexCommand\(/);
  assert.doesNotMatch(runtimeDependenciesSource, /NARADA_CODEX_EXEC_COMMAND \?\? process\.env\.NARADA_CODEX_COMMAND \?\? process\.env\.CODEX_COMMAND \?\? 'codex'/);
});

test('codex-subscription provider execution is admitted through AiProcessInvocation', () => {
  assert.match(runtimeDependenciesSource, /@narada2\/carrier-provider-support\/ai-process-invocation/);
  assert.match(runtimeDependenciesSource, /spawnAiProcessInvocation\(\{ adapterKind: 'codex', projection: 'codex-subscription', purpose: 'provider_request'/);
  assert.match(runtimeDependenciesSource, /spawnAiProcessInvocation\(\{ adapterKind: 'codex', projection: 'codex-subscription', purpose: 'provider_request_buffered'/);
  assert.doesNotMatch(runtimeDependenciesSource, /const processOwner = spawnOwnedProcess\(command\.command/);
});

test('codex-subscription provider execution classifies unresolved CLI spawn failures', () => {
  assert.match(runtimeDependenciesSource, /codex_cli_unresolved/);
  assert.match(runtimeDependenciesSource, /NARADA_CODEX_EXEC_COMMAND\/NARADA_CODEX_COMMAND/);
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
