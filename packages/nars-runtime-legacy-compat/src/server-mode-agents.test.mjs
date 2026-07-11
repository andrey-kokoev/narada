import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { createCarrierRuntimeDependencies } from './runtime-dependencies.mjs';
import { runCarrierServerMode } from './server-mode.mjs';
import { removeTempDir, tempRoot } from './server-mode-test-helpers.mjs';

test('server mode seeds intelligence with full applicable AGENTS authority chain', async () => {
  const root = tempRoot('carrier-agents-prompt-test-');
  const workspaceRoot = join(root, 'workspace');
  const siteRoot = join(workspaceRoot, 'site');
  try {
    mkdirSync(join(siteRoot, '.narada'), { recursive: true });
    writeFileSync(join(root, 'AGENTS.md'), 'root authority marker\n', 'utf8');
    writeFileSync(join(workspaceRoot, 'AGENTS.md'), 'workspace authority marker\n', 'utf8');
    writeFileSync(join(siteRoot, 'AGENTS.md'), 'site authority marker\n', 'utf8');
    writeFileSync(join(siteRoot, '.narada', 'AGENTS.md'), 'site-local narada authority marker\n', 'utf8');

    const input = new PassThrough();
    const output = new PassThrough();
    const providerCalls = [];
    const callChatApiFn = async (messages) => {
      providerCalls.push(messages.map((message) => ({ role: message.role, content: message.content })));
      return { choices: [{ message: { role: 'assistant', content: 'seeded' } }] };
    };

    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_agents_prompt_test',
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

    input.write(`${JSON.stringify({ id: 'agents-prompt', method: 'conversation.send', params: { message: 'hello', source: 'programmatic_operator' } })}\n`);
    input.end();
    await running;

    assert.equal(providerCalls.length, 1);
    const systemPrompt = providerCalls[0].find((message) => message.role === 'system')?.content ?? '';
    assert.match(systemPrompt, /root authority marker/);
    assert.match(systemPrompt, /workspace authority marker/);
    assert.match(systemPrompt, /site authority marker/);
    assert.match(systemPrompt, /site-local narada authority marker/);
    assert.equal(systemPrompt.indexOf('root authority marker') < systemPrompt.indexOf('workspace authority marker'), true);
    assert.equal(systemPrompt.indexOf('workspace authority marker') < systemPrompt.indexOf('site authority marker'), true);
    assert.equal(systemPrompt.indexOf('site authority marker') < systemPrompt.indexOf('site-local narada authority marker'), true);
  } finally {
    removeTempDir(root);
  }
});

test('server mode refreshes AGENTS authority prompt for resumed sessions', async () => {
  const root = tempRoot('carrier-agents-resume-test-');
  const siteRoot = join(root, 'site');
  try {
    mkdirSync(siteRoot, { recursive: true });
    writeFileSync(join(root, 'AGENTS.md'), 'resumed root authority marker\n', 'utf8');
    writeFileSync(join(siteRoot, 'AGENTS.md'), 'resumed site authority marker\n', 'utf8');
    const sessionPath = join(siteRoot, 'session.jsonl');
    writeFileSync(sessionPath, `${JSON.stringify({ role: 'user', content: 'previous request' })}\n`, 'utf8');

    const input = new PassThrough();
    const output = new PassThrough();
    const providerCalls = [];
    const callChatApiFn = async (messages) => {
      providerCalls.push(messages.map((message) => ({ role: message.role, content: message.content })));
      return { choices: [{ message: { role: 'assistant', content: 'resumed' } }] };
    };

    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_agents_resume_test',
      siteRoot,
      sessionPath,
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

    input.write(`${JSON.stringify({ id: 'agents-resume', method: 'conversation.send', params: { message: 'continue', source: 'programmatic_operator' } })}\n`);
    input.end();
    await running;

    const firstProviderMessages = providerCalls[0] ?? [];
    assert.equal(firstProviderMessages[0]?.role, 'system');
    assert.match(firstProviderMessages[0]?.content ?? '', /resumed root authority marker/);
    assert.match(firstProviderMessages[0]?.content ?? '', /resumed site authority marker/);
    assert.equal(firstProviderMessages.some((message) => message.role === 'user' && message.content === 'previous request'), true);
    assert.equal(firstProviderMessages.some((message) => message.role === 'user' && message.content === 'continue'), true);
  } finally {
    removeTempDir(root);
  }
});
