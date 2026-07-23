import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createNarsPiRpcKernel } from '../kernel.mjs';
import { readNarsEventLog } from '../../../nars-session-core/src/event-log.mjs';
import { createSessionCoreRuntimeService } from '../../../agent-runtime-server/src/session-core-runtime-service.mjs';

const fixture = fileURLToPath(new URL('../../test/fixtures/pi-rpc-fixture.mjs', import.meta.url));

const noCapabilityGateway = Object.freeze({
  toolCatalog: async () => [],
  invoke: async ({ toolName }) => ({ status: 'denied', admission_action: 'deny', execution_outcome: 'not_attempted', tool_name: toolName }),
  close: async () => {},
});

function waitFor(predicate, timeoutMs = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - started > timeoutMs) return reject(new Error('live_pi_rpc_e2e_timeout'));
      setTimeout(check, 5);
    };
    check();
  });
}

test('live Pi RPC runs behind session-core without changing canonical NARS events', async () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-live-pi-rpc-'));
  const eventsPath = join(root, 'events.jsonl');
  const kernel = createNarsPiRpcKernel({
    rpc: {
      command: process.execPath,
      args: [fixture],
      env: { PI_RPC_FIXTURE_VERSION: 'fixture-rpc-1.0.0' },
      piVersion: 'fixture-rpc-1.0.0',
    },
  });
  await kernel.start({ session_id: 'live-pi-rpc-session', agent_id: 'live-pi-rpc-agent' });
  const intelligenceRuntime = {
    async callIntelligence(messages, tools, overrides = {}) {
      const outcome = await kernel.invokeAdmitted({
        messages,
        plan: { plan_id: 'live-pi-rpc-plan' },
        adapter: { resource_id: 'live-pi-rpc-adapter' },
        turnId: overrides.turnId ?? overrides.inputEventId ?? 'live-pi-rpc-turn',
        inputEventId: overrides.inputEventId,
        abortSignal: overrides.abortSignal,
        requestedOptions: overrides,
        capabilityGateway: noCapabilityGateway,
      });
      if (outcome.error) throw new Error(outcome.error.message ?? String(outcome.error));
      return outcome.response;
    },
    snapshot: () => ({
      schema: 'narada.nars.intelligence_runtime_snapshot.v1',
      authority: 'live-rpc-e2e',
      principal: 'principal:live-rpc',
      requested_model: null,
      requested_options: {},
      latest_plan: null,
      latest_outcome: null,
      latest_attempt_id: null,
      latest_replayed: null,
      reconfiguration: null,
      intelligence_kernel_kind: 'pi-rpc',
      kernel: kernel.health(),
    }),
    async close() { await kernel.close({ reason: 'live_rpc_e2e_close' }); },
  };
  const runtimeContext = {
    identity: 'live-pi-rpc-agent',
    session: 'live-pi-rpc-session',
    siteRoot: root,
    sessionPath: join(root, 'session.json'),
    eventsPath,
    controlPath: join(root, 'control.jsonl'),
    siteId: 'site:live-rpc',
    operatorSurfaceKind: 'agent-web-ui',
    intelligenceKernelKind: 'pi-rpc',
    intelligence: { principal: 'principal:live-rpc' },
    mcpScope: 'none',
  };
  const service = createSessionCoreRuntimeService({ runtimeContext, intelligenceRuntime, heartbeatIntervalMs: 0 });
  const input = new PassThrough();
  const output = new PassThrough();
  output.setEncoding('utf8');
  const outputRecords = [];
  let buffer = '';
  output.on('data', (chunk) => {
    buffer += chunk;
    while (true) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) outputRecords.push(JSON.parse(line));
    }
  });
  const runtimePromise = service.run({ input, output });
  try {
    const send = (frame) => input.write(`${JSON.stringify(frame)}\n`);
    await waitFor(() => outputRecords.some((record) => record.event === 'session_started'));
    send({ id: 'rpc-turn', method: 'session.submit', content: 'hello', idempotency_key: 'rpc-idem-1' });
    await waitFor(() => outputRecords.some((record) => record.event === 'session_control_response' && record.request_id === 'rpc-turn'));
    const events = readNarsEventLog(eventsPath).events;
    assert.ok(events.some((event) => event.event === 'assistant_message' && event.content === 'rpc-ok'));
    assert.equal(events.some((event) => event.event === 'pi_event_observed'), false);
    send({ id: 'rpc-close', method: 'session.close' });
    await runtimePromise;
    assert.equal(service.supervisor.core.lifecycleState, 'closed');
  } finally {
    await kernel.close({ reason: 'live_rpc_e2e_cleanup' });
  }
});
