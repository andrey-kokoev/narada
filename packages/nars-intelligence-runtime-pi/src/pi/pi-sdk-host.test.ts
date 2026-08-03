import test from 'node:test';
import assert from 'node:assert/strict';
import { createPiSdkHost } from './pi-sdk-host.js';
import { adaptExternalPiSession, createInMemoryPiSession } from './pi-session-factory.js';
import { assertPiRuntimeIsolation, createPiRuntimeIsolationConfig } from './pi-runtime-isolation.js';

test('Pi isolation evidence distinguishes the in-process SDK from the filtered RPC child', () => {
  const sdk: any = createPiRuntimeIsolationConfig({ mode: 'sdk' });
  assertPiRuntimeIsolation(sdk);
  assert.equal(sdk.process_sandbox, 'not-provided');
  assert.equal(sdk.execution_boundary, 'in-process-adapter');
  assert.equal(sdk.ambient_resource_enforcement, 'configuration-and-adapter-checks');

  const rpc: any = createPiRuntimeIsolationConfig({ mode: 'rpc' });
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
  let resolvePrompt: any;
  let abortCalls: any = 0;
  const session: any = {
    agent: { state: { messages: [], tools: [] } },
    async prompt() {
      return new Promise((resolve: any) => { resolvePrompt = resolve; });
    },
    abort() {
      abortCalls += 1;
      resolvePrompt?.();
    },
  };
  const adapted: any = adaptExternalPiSession(session, { sessionId: 'session-abort-relay' });
  const controller: any = new AbortController();
  const run: any = adapted.runTurn({
    session_id: 'session-abort-relay',
    messages: [{ role: 'user', content: 'slow tool turn' }],
    tools: [],
    abortSignal: controller.signal,
  });

  await new Promise((resolve: any) => setImmediate(resolve));
  controller.abort('test_abort');
  await run;

  assert.equal(abortCalls, 1);
});

test('Pi SDK host disables provider auto-retry before admitting a session', async () => {
  const retrySettings: any = {
    enabled: true,
    getRetryEnabled() { return this.enabled; },
    setRetryEnabled(enabled: any) { this.enabled = enabled; },
  };
  const calls: any = [];
  const session: any = {
    agent: { state: { messages: [], tools: [] } },
    settingsManager: retrySettings,
    get autoRetryEnabled() { return retrySettings.enabled; },
    setAutoRetryEnabled(enabled: any) { calls.push(enabled); retrySettings.enabled = enabled; },
    async start() {},
    async runTurn() { return { response: { content: 'ok' } }; },
    async close() {},
  };
  const host: any = createPiSdkHost({
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
  const host: any = createPiSdkHost({
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
  const host: any = createPiSdkHost({
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

test('compatibility host executes projected tool calls through the NARS gateway and resumes the turn', async () => {
  const providerInputs: any[] = [];
  const gatewayInputs: any[] = [];
  const session: any = createInMemoryPiSession({
    sessionId: 'compat-tool-session',
    providerInvoker: async (input: any) => {
      providerInputs.push(input);
      if (providerInputs.length === 1) {
        return {
          admission: 'acknowledged',
          response: {
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'compat-call-1', type: 'function', function: { name: 'read_note', arguments: '{}' } }],
              },
            }],
          },
        };
      }
      return { admission: 'acknowledged', response: { choices: [{ message: { role: 'assistant', content: 'done' } }] } };
    },
  });
  const result: any = await session.runTurn({
    turn_id: 'compat-tool-turn',
    messages: [{ role: 'user', content: 'read the note' }],
    tools: [{ type: 'function', function: { name: 'read_note', parameters: { type: 'object', properties: {} } }, nars_gateway_proxy: true }],
    tool_loop: { execution_policy: { tool_loop: { max_rounds: 4 } } },
    capability_gateway: {
      async invoke(request: any) {
        gatewayInputs.push(request);
        return { status: 'completed', result: { note: 'hello' } };
      },
    },
  });

  assert.equal(result.response.choices[0].message.content, 'done');
  assert.equal(providerInputs.length, 2);
  assert.equal(gatewayInputs.length, 1);
  assert.equal(gatewayInputs[0].toolName, 'read_note');
  assert.equal(gatewayInputs[0].toolCallId, 'compat-call-1');
  assert.deepEqual(providerInputs[1].messages.map((message: any) => message.role), ['user', 'assistant', 'tool']);
  assert.match(providerInputs[1].messages[2].content, /hello/);
});
