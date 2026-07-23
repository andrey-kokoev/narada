import test from 'node:test';
import assert from 'node:assert/strict';
import { createPiSdkHost } from './pi-sdk-host.mjs';
import { adaptExternalPiSession } from './pi-session-factory.mjs';
import { assertPiRuntimeIsolation, createPiRuntimeIsolationConfig } from './pi-runtime-isolation.mjs';

test('Pi isolation evidence distinguishes the in-process SDK from the filtered RPC child', () => {
  const sdk = createPiRuntimeIsolationConfig({ mode: 'sdk' });
  assertPiRuntimeIsolation(sdk);
  assert.equal(sdk.process_sandbox, 'not-provided');
  assert.equal(sdk.execution_boundary, 'in-process-adapter');
  assert.equal(sdk.ambient_resource_enforcement, 'configuration-and-adapter-checks');

  const rpc = createPiRuntimeIsolationConfig({ mode: 'rpc' });
  assertPiRuntimeIsolation(rpc);
  assert.equal(rpc.process_sandbox, 'not-provided');
  assert.equal(rpc.execution_boundary, 'filtered-child-process');
  assert.equal(rpc.ambient_resource_enforcement, 'filtered-environment-disposable-cwd');

  assert.throws(
    () => assertPiRuntimeIsolation({ ...sdk, execution_boundary: 'filtered-child-process' }),
    /pi_runtime_isolation_violation/,
  );
});

test('external Pi prompt relays the outer NARS abort to the SDK session', async () => {
  let resolvePrompt;
  let abortCalls = 0;
  const session = {
    agent: { state: { messages: [], tools: [] } },
    async prompt() {
      return new Promise((resolve) => { resolvePrompt = resolve; });
    },
    abort() {
      abortCalls += 1;
      resolvePrompt?.();
    },
  };
  const adapted = adaptExternalPiSession(session, { sessionId: 'session-abort-relay' });
  const controller = new AbortController();
  const run = adapted.runTurn({
    session_id: 'session-abort-relay',
    messages: [{ role: 'user', content: 'slow tool turn' }],
    tools: [],
    abortSignal: controller.signal,
  });

  await new Promise((resolve) => setImmediate(resolve));
  controller.abort('test_abort');
  await run;

  assert.equal(abortCalls, 1);
});

test('Pi SDK host disables provider auto-retry before admitting a session', async () => {
  const retrySettings = {
    enabled: true,
    getRetryEnabled() { return this.enabled; },
    setRetryEnabled(enabled) { this.enabled = enabled; },
  };
  const calls = [];
  const session = {
    agent: { state: { messages: [], tools: [] } },
    settingsManager: retrySettings,
    get autoRetryEnabled() { return retrySettings.enabled; },
    setAutoRetryEnabled(enabled) { calls.push(enabled); retrySettings.enabled = enabled; },
    async start() {},
    async runTurn() { return { response: { content: 'ok' } }; },
    async close() {},
  };
  const host = createPiSdkHost({
    providerInvoker: async () => ({ response: { content: 'ok' } }),
    sessionFactory: async () => session,
  });

  await host.start({ session_id: 'session-retry-policy' });

  assert.deepEqual(calls, [false]);
  assert.equal(retrySettings.enabled, false);
  assert.equal(session.autoRetryEnabled, false);
  await host.close();
});

test('Pi SDK host refuses raw credentials embedded in an admitted model object', async () => {
  const host = createPiSdkHost({
    sdk: {
      VERSION: 'fixture-sdk-1.0.0',
      async createAgentSession() { throw new Error('session must not be created'); },
    },
    piVersion: 'fixture-sdk-1.0.0',
    providerInvoker: async () => ({ response: { content: 'unreachable' } }),
    runtimeConfig: {
      modelObject: {
        id: 'model-1',
        provider: 'provider-1',
        api: 'openai-completions',
        apiKey: 'raw-secret',
      },
    },
  });

  await assert.rejects(
    host.start({ session_id: 'session-raw-credential', agent_id: 'agent-raw-credential' }),
    /pi_raw_credential_forbidden/,
  );
});

test('Pi SDK host fails closed when the loaded SDK contradicts the admitted pin', async () => {
  const host = createPiSdkHost({
    sdk: {
      VERSION: 'fixture-sdk-2.0.0',
      async createAgentSession() { throw new Error('session must not be created'); },
    },
    piVersion: 'fixture-sdk-1.0.0',
    providerInvoker: async () => ({ response: { content: 'unreachable' } }),
  });

  await assert.rejects(
    host.start({ session_id: 'session-version-mismatch', agent_id: 'agent-version-mismatch' }),
    /pi_sdk_version_mismatch/,
  );
});
