import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { ADMITTED_INTELLIGENCE_PROVIDERS } from './intelligence-provider-policy.mjs';
import { createCarrierRuntimeDependencies } from './runtime-dependencies.mjs';
import { runCarrierServerMode } from './server-mode.mjs';
import { activateTargetAuthority, planTargetAuthorityTransition, prepareTargetAuthority, sealSourceAuthority } from './authority-transition-state.mjs';
import { readJson, readJsonl, removeTempDir, tempRoot, waitFor, writeFixtureMcpSurface } from './server-mode-test-helpers.mjs';

test('server mode seeds intelligence with full applicable AGENTS authority chain', async () => {
  const root = mkdtempSync(join(tmpdir(), 'carrier-agents-prompt-test-'));
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
      providerSettings: { provider: 'codex-subscription', model: 'gpt-start', thinking: 'medium', stream: false },
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

test('session sync copies the session directory to a site-local target', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-session-sync-test-'));
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
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_sync_test' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_sync_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unexpected' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'sync', method: 'session.sync', params: { target: '.narada/session-sync-copy', direction: 'upload' } })}\n`);
    input.end();
    await running;

    const syncEvent = events.find((event) => event.event === 'session_sync');
    assert.equal(syncEvent?.success, true);
    assert.equal(syncEvent.direction, 'upload');
    assert.equal(existsSync(join(siteRoot, '.narada', 'session-sync-copy', 'session.jsonl')), true);
    assert.equal(existsSync(join(siteRoot, '.narada', 'session-sync-copy', 'events.jsonl')), true);
    assert.doesNotMatch(syncEvent.message, /not implemented/);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('session command execution uses the shared command contract commands', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-command-contract-test-'));
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
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_command_contract_test' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_command_contract_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unexpected' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({ alpha: { tools: [{ name: 'alpha.read', inputSchema: {} }] } }),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'tools-command', method: 'session.command.execute', params: { command: '/tools', value: '' } })}\n`);
    input.write(`${JSON.stringify({ id: 'queue-clear', method: 'session.command.execute', params: { command: '/queue', value: 'clear' } })}\n`);
    input.write(`${JSON.stringify({ id: 'model-override', method: 'session.command.execute', params: { command: '/model', value: 'gpt-override' } })}\n`);
    input.write(`${JSON.stringify({ id: 'thinking-override', method: 'session.command.execute', params: { command: '/thinking', value: 'high' } })}\n`);
    input.write(`${JSON.stringify({ id: 'status-after-override', method: 'session.command.execute', params: { command: '/status', value: '' } })}\n`);
    input.end();
    await running;

    const results = events.filter((event) => event.event === 'carrier_command_result');
    assert.equal(results.length, 5);
    assert.equal(results.some((event) => event.request_id === 'tools-command' && event.terminal_state === 'completed'), true);
    assert.equal(results.some((event) => event.request_id === 'queue-clear' && /Cleared 0 queued/.test(event.message)), true);
    assert.equal(results.some((event) => event.request_id === 'model-override' && event.fields?.model === 'gpt-override'), true);
    assert.equal(results.some((event) => event.request_id === 'thinking-override' && event.fields?.thinking === 'high'), true);
    const status = results.find((event) => event.request_id === 'status-after-override')?.fields?.session_status;
    assert.deepEqual(status?.intelligence, { provider: 'codex-subscription', model: 'gpt-override', available_models: ['gpt-5.5'], available_providers: ADMITTED_INTELLIGENCE_PROVIDERS, thinking: 'high', stream: false });
    assert.equal(status?.model, 'gpt-override');
    assert.equal(status?.thinking, 'high');
  } finally {
    removeTempDir(siteRoot);
  }
});

test('authority source drain refuses new canonical source writes', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-source-drain-test-'));
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
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_source_drain_test' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_source_drain_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    let providerCalls = 0;
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => {
        providerCalls += 1;
        return { choices: [{ message: { role: 'assistant', content: 'unexpected' } }] };
      },
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'drain', method: 'authority.source.drain' })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_source_draining'));
    input.write(`${JSON.stringify({ id: 'send', method: 'conversation.send', params: { message: 'must not run' } })}\n`);
    input.write(`${JSON.stringify({ id: 'enqueue', method: 'conversation.enqueue', params: { message: 'must not queue' } })}\n`);
    input.write(`${JSON.stringify({ id: 'steer', method: 'conversation.steer', params: { message: 'must not steer' } })}\n`);
    input.write(`${JSON.stringify({ id: 'status', method: 'authority.source.status' })}\n`);
    input.end();
    await running;

    assert.equal(providerCalls, 0);
    const refusals = events.filter((event) => event.event === 'authority_source_write_refused');
    assert.equal(refusals.length, 3);
    assert.equal(refusals.every((event) => event.code === 'authority_source_draining'), true);
    const statusEvent = events.find((event) => event.event === 'authority_source_status');
    assert.equal(statusEvent?.authority_transition_source?.state, 'draining');
    const transitionState = readJson(join(sessionDir, 'authority-transition-state.json'));
    assert.equal(transitionState.source_write_admission, 'draining');
    assert.equal(transitionState.authority_transition_state, 'source_draining');
    assert.equal(readJson(join(sessionDir, 'operator-input-queue.json')).pending_count, 0);
  } finally {
    removeTempDir(siteRoot);
  }
});

test('authority source seal persists seal evidence and refuses writes after seal', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-source-seal-test-'));
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
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_source_seal_test' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_source_seal_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    let providerCalls = 0;
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => {
        providerCalls += 1;
        return { choices: [{ message: { role: 'assistant', content: 'unexpected' } }] };
      },
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'drain', method: 'authority.source.drain' })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_source_draining'));
    input.write(`${JSON.stringify({ id: 'seal', method: 'authority.source.seal' })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_source_sealed'));
    input.write(`${JSON.stringify({ id: 'send', method: 'conversation.send', params: { message: 'must not run after seal' } })}\n`);
    input.end();
    await running;

    assert.equal(providerCalls, 0);
    const sealed = events.find((event) => event.event === 'authority_source_sealed');
    assert.equal(sealed?.authority_transition_source?.state, 'sealed');
    assert.equal(Number.isInteger(sealed?.seal_evidence?.event_cursor?.last_source_sequence_before_seal), true);
    const refusal = events.find((event) => event.event === 'authority_source_write_refused');
    assert.equal(refusal?.code, 'authority_source_sealed');
    const transitionState = readJson(join(sessionDir, 'authority-transition-state.json'));
    assert.equal(transitionState.source_write_admission, 'sealed');
    assert.equal(transitionState.authority_transition_state, 'source_sealed');
    assert.equal(Number.isInteger(transitionState.source_last_sequence), true);
    const sessionIndexRecord = readJson(join(sessionDir, 'session-index-record.json'));
    assert.equal(sessionIndexRecord.authority_transition_state, 'source_sealed');
    assert.equal(sessionIndexRecord.source_write_admission, 'sealed');
  } finally {
    removeTempDir(siteRoot);
  }
});


test('authority target activation refuses missing source seal and epoch evidence', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-target-activation-refusal-test-'));
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
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_target_refusal_test' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_target_refusal_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unexpected' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({
      id: 'prepare',
      method: 'authority.target.prepare',
      params: { target_authority_locator: { kind: 'local', session_id: 'session_target_refusal_test' } },
    })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_target_prepared'));
    input.write(`${JSON.stringify({ id: 'send-before-active', method: 'conversation.send', params: { message: 'must not run before target active' } })}\n`);
    input.write(`${JSON.stringify({ id: 'activate', method: 'authority.target.activate' })}\n`);
    input.end();
    await running;

    const writeRefusal = events.find((event) => event.event === 'authority_target_write_refused');
    assert.equal(writeRefusal?.code, 'authority_target_not_active');
    const activationRefusal = events.find((event) => event.event === 'authority_target_activation_refused');
    assert.equal(activationRefusal?.status, 'refused');
    assert.equal(activationRefusal.refusals.some((refusal) => refusal.reason_code === 'source_seal_evidence_missing'), true);
    assert.equal(activationRefusal.refusals.some((refusal) => refusal.reason_code === 'authority_epoch_token_invalid'), true);
    const transitionState = readJson(join(sessionDir, 'authority-transition-state.json'));
    assert.equal(transitionState.authority_transition_state, 'preparing_target');
    assert.equal(transitionState.target_write_admission, 'not_before_source_seal');
  } finally {
    removeTempDir(siteRoot);
  }
});

test('authority target activation emits deterministic boundary event and admits target writes', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-target-activation-success-test-'));
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
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    });

    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_target_success_test' }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: 'session_target_success_test',
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    let providerCalls = 0;
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => {
        providerCalls += 1;
        return { choices: [{ message: { role: 'assistant', content: 'target write admitted' } }] };
      },
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'drain', method: 'authority.source.drain' })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_source_draining'));
    input.write(`${JSON.stringify({ id: 'seal', method: 'authority.source.seal' })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_source_sealed'));
    input.write(`${JSON.stringify({
      id: 'prepare',
      method: 'authority.target.prepare',
      params: {
        superseded_by_session_id: 'session_target_success_test',
        authority_locator_ref: 'locator:target:test',
        target_authority_locator: { kind: 'local', session_id: 'session_target_success_test' },
      },
    })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_target_prepared'));
    input.write(`${JSON.stringify({
      id: 'activate',
      method: 'authority.target.activate',
      params: {
        authority_epoch_token: { source_authority_epoch: 1, target_authority_epoch: 2, token_id: 'epoch-token-test' },
        target_health: { status: 'healthy' },
        mcp_fabric: { status: 'compatible' },
        artifacts: { source_paths_exposed: false },
        superseded_by_session_id: 'session_target_success_test',
        authority_locator_ref: 'locator:target:test',
        target_authority_locator: { kind: 'local', session_id: 'session_target_success_test' },
      },
    })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_target_active'));
    input.write(`${JSON.stringify({ id: 'send', method: 'conversation.send', params: { message: 'run on target authority' } })}\n`);
    input.end();
    await running;

    const active = events.find((event) => event.event === 'authority_target_active');
    assert.equal(active.event_sequence, active.target_first_sequence);
    assert.equal(active.activation_id, 'authority_target_active:session_target_success_test:2:' + active.target_first_sequence);
    assert.equal(active.authority_transition_target.state, 'active');
    assert.equal(active.authority_transition_source.target_authority_locator.session_id, 'session_target_success_test');
    assert.equal(providerCalls, 1);
    const transitionState = readJson(join(sessionDir, 'authority-transition-state.json'));
    assert.equal(transitionState.authority_transition_state, 'target_active');
    assert.equal(transitionState.target_write_admission, 'active_after_epoch_token');
    assert.equal(transitionState.target_first_sequence, active.target_first_sequence);
    assert.equal(transitionState.authority_locator_ref, 'locator:target:test');
  } finally {
    removeTempDir(siteRoot);
  }
});

test('synthetic local to Cloudflare authority transition refuses source writes and admits target writes', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'carrier-local-cloudflare-authority-e2e-'));
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
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    });

    const sessionId = 'session_local_to_cloudflare_test';
    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionDir;
    const runtimeContext = {
      identity: 'agent.test',
      session: sessionId,
      siteRoot,
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      authorityRuntimeHost: 'local',
      providerSettings: { stream: false },
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    let providerCalls = 0;
    const running = runCarrierServerMode({
      input,
      output,
      callChatApiFn: async () => {
        providerCalls += 1;
        return { choices: [{ message: { role: 'assistant', content: 'cloudflare target write admitted' } }] };
      },
      runtimeContext,
      dependencies: {
        ...dependencies,
        discoverAndStartMcpServers: async () => ({}),
        closeMcpServers: () => {},
        readMcpPreflightArtifact: () => null,
      },
    });

    input.write(`${JSON.stringify({ id: 'drain-source', method: 'authority.source.drain' })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_source_draining'));
    input.write(`${JSON.stringify({ id: 'seal-source', method: 'authority.source.seal' })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_source_sealed'));
    input.write(`${JSON.stringify({ id: 'source-write-after-seal', method: 'conversation.send', params: { message: 'must be refused by sealed local source' } })}\n`);

    const targetLocator = {
      kind: 'cloudflare-host',
      site_id: 'site_synthetic_cloudflare_target',
      session_id: 'cf_session_local_to_cloudflare_test',
      worker_url: 'https://synthetic-cloudflare-target.example.test',
    };
    input.write(`${JSON.stringify({
      id: 'prepare-cloudflare-target',
      method: 'authority.target.prepare',
      params: {
        superseded_by_session_id: sessionId,
        authority_locator_ref: 'authority_locator:cloudflare-host/site_synthetic_cloudflare_target/cf_session_local_to_cloudflare_test',
        target_authority_locator: targetLocator,
      },
    })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_target_prepared'));
    input.write(`${JSON.stringify({
      id: 'activate-cloudflare-target',
      method: 'authority.target.activate',
      params: {
        authority_epoch_token: { source_authority_epoch: 10, target_authority_epoch: 11, token_id: 'local-cloudflare-epoch-11' },
        target_health: { status: 'healthy', checked_by: 'synthetic-e2e' },
        mcp_fabric: { status: 'compatible', attached_surface_count: 0 },
        artifacts: { source_paths_exposed: false },
        superseded_by_session_id: sessionId,
        authority_locator_ref: 'authority_locator:cloudflare-host/site_synthetic_cloudflare_target/cf_session_local_to_cloudflare_test',
        target_authority_locator: targetLocator,
      },
    })}\n`);
    await waitFor(() => events.some((event) => event.event === 'authority_target_active'));
    input.write(`${JSON.stringify({ id: 'target-write-after-activation', method: 'conversation.send', params: { message: 'accepted by cloudflare target authority' } })}\n`);
    input.end();
    await running;

    const sourceRefusal = events.find((event) => event.event === 'authority_source_write_refused');
    assert.equal(sourceRefusal?.code, 'authority_source_sealed');
    const active = events.find((event) => event.event === 'authority_target_active');
    assert.equal(active.event_sequence, active.target_first_sequence);
    assert.equal(active.activation_id, `authority_target_active:${sessionId}:11:${active.target_first_sequence}`);
    assert.equal(active.authority_transition_target.state, 'active');
    assert.equal(active.authority_transition_source.target_authority_locator.kind, 'cloudflare-host');
    assert.equal(active.authority_transition_source.authority_locator_ref, 'authority_locator:cloudflare-host/site_synthetic_cloudflare_target/cf_session_local_to_cloudflare_test');
    assert.equal(providerCalls, 1);
    const replayableLog = readJsonl(join(sessionDir, 'events.jsonl'));
    assert.equal(replayableLog.some((entry) => entry.event === 'authority_source_sealed'), true);
    assert.equal(replayableLog.some((entry) => entry.event === 'authority_target_active'), true);

    const transitionState = readJson(join(sessionDir, 'authority-transition-state.json'));
    assert.equal(transitionState.authority_transition_state, 'target_active');
    assert.equal(transitionState.source_write_admission, 'sealed');
    assert.equal(transitionState.target_write_admission, 'active_after_epoch_token');
    assert.equal(transitionState.target_authority_locator.kind, 'cloudflare-host');
    assert.equal(transitionState.superseded_by_session_id, sessionId);
    assert.equal(transitionState.authority_locator_ref, 'authority_locator:cloudflare-host/site_synthetic_cloudflare_target/cf_session_local_to_cloudflare_test');
    const sessionIndexRecord = readJson(join(sessionDir, 'session-index-record.json'));
    assert.equal(sessionIndexRecord.authority_transition_state, 'target_active');
    assert.equal(sessionIndexRecord.source_write_admission, 'sealed');
    assert.equal(sessionIndexRecord.superseded_by_session_id, sessionId);
    assert.equal(sessionIndexRecord.authority_locator_ref, 'authority_locator:cloudflare-host/site_synthetic_cloudflare_target/cf_session_local_to_cloudflare_test');
    assert.equal(sessionIndexRecord.terminal_state, 'closed');
  } finally {
    removeTempDir(siteRoot);
  }
});

test('Cloudflare to local authority planning is modeled as a forward epoch with resolved local target paths', () => {
  const sourceSiteRoot = mkdtempSync(join(tmpdir(), 'carrier-cloudflare-local-source-plan-'));
  const targetSiteRoot = mkdtempSync(join(tmpdir(), 'carrier-cloudflare-local-target-plan-'));
  try {
    const sourceSessionId = 'cf_session_planning_source';
    const targetSessionId = 'local_session_planning_target';
    const sourceSessionDir = resolveNaradaSitePaths({ siteRoot: sourceSiteRoot, sessionId: sourceSessionId }).narsSessionDir;
    const sourceSessionPath = join(sourceSessionDir, 'session.jsonl');
    const sourceStatePath = join(sourceSessionDir, 'authority-transition-state.json');
    const plan = planTargetAuthorityTransition({
      sourceAuthorityRuntimeHost: 'cloudflare-host',
      currentSiteRoot: sourceSiteRoot,
      currentSessionId: sourceSessionId,
      supersededBySessionId: sourceSessionId,
      authorityLocatorRef: 'authority_locator:local/local-site/local_session_planning_target',
      targetAuthorityLocator: {
        kind: 'local',
        site_root: targetSiteRoot,
        session_id: targetSessionId,
      },
    });
    assert.equal(plan.status, 'ready');
    assert.equal(plan.direction, 'cloudflare-host_to_local');
    assert.equal(plan.target_authority_locator.kind, 'local');
    assert.equal(plan.target_authority_locator.session_id, targetSessionId);
    assert.equal(plan.target_authority_locator.session_path.endsWith(join('.narada', 'crew', 'nars-sessions', targetSessionId, 'session.jsonl')), true);
    assert.deepEqual(plan.direction_specific_requirements, ['local_target_session_id', 'local_target_site_path_resolution']);
    assert.equal(plan.shared_activation_requirements.includes('authority_epoch_token'), true);

    let state = prepareTargetAuthority({
      path: sourceStatePath,
      sessionPath: sourceSessionPath,
      targetAuthorityLocator: plan.target_authority_locator,
      supersededBySessionId: plan.superseded_by_session_id,
      authorityLocatorRef: plan.authority_locator_ref,
      transitionPlan: plan,
    });
    state = sealSourceAuthority({ path: sourceStatePath, sessionPath: sourceSessionPath, state, sourceLastSequence: 12 });
    state = activateTargetAuthority({
      path: sourceStatePath,
      sessionPath: sourceSessionPath,
      state,
      activationId: 'authority_target_active:cf_session_planning_source:8:13',
      targetFirstSequence: 13,
      authorityEpochToken: { source_authority_epoch: 7, target_authority_epoch: 8, token_id: 'cloudflare-local-forward-epoch-8' },
      targetAuthorityLocator: plan.target_authority_locator,
      supersededBySessionId: plan.superseded_by_session_id,
      authorityLocatorRef: plan.authority_locator_ref,
    });
    assert.equal(state.authority_transition_state, 'target_active');
    assert.equal(state.source_write_admission, 'sealed');
    assert.equal(state.authority_epoch_token.source_authority_epoch, 7);
    assert.equal(state.authority_epoch_token.target_authority_epoch, 8);
    assert.equal(state.target_transition_plan.direction, 'cloudflare-host_to_local');
    assert.equal(state.superseded_by_session_id, sourceSessionId);

    const refused = planTargetAuthorityTransition({
      sourceAuthorityRuntimeHost: 'cloudflare-host',
      targetAuthorityLocator: { kind: 'local', session_id: targetSessionId },
    });
    assert.equal(refused.status, 'refused');
    assert.equal(refused.refusals.some((refusal) => refusal.reason_code === 'local_target_site_root_missing'), true);
  } finally {
    removeTempDir(sourceSiteRoot);
    removeTempDir(targetSiteRoot);
  }
});

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
    const userMessageIndex = events.findIndex((event) => event.event === 'user_message' && event.content === 'original request' && event.source === 'programmatic_operator');
    const firstTurnStartedIndex = events.findIndex((event) => event.event === 'turn_started');
    assert.notEqual(userMessageIndex, -1);
    assert.equal(userMessageIndex < firstTurnStartedIndex, true);
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
    removeTempDir(siteRoot);
  }
});

