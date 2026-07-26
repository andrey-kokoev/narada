import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createNarsPiRpcKernel } from '../kernel.js';
import { readNarsEventLog } from '../../../nars-session-core/src/event-log.js';
import { createSessionCoreRuntimeService } from '../../../agent-runtime-server/src/session-core-runtime-service.js';

const fixture: any = fileURLToPath(new URL('../../test/fixtures/pi-rpc-fixture.ts', import.meta.url));

const noCapabilityGateway: any = Object.freeze({
  toolCatalog: async () => [],
  invoke: async ({ toolName }: any) => ({ status: 'denied', admission_action: 'deny', execution_outcome: 'not_attempted', tool_name: toolName }),
  close: async () => {},
});

function waitFor(predicate: any, timeoutMs: any = 5000) {
  const started: any = Date.now();
  return new Promise((resolve: any, reject: any) => {
    const check: any = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - started > timeoutMs) return reject(new Error('live_pi_rpc_e2e_timeout'));
      setTimeout(check, 5);
    };
    check();
  });
}

test('live Pi RPC runs behind session-core without changing canonical NARS events', async () => {
  const root: any = mkdtempSync(join(tmpdir(), 'narada-live-pi-rpc-'));
  const eventsPath: any = join(root, 'events.jsonl');
  const kernel: any = createNarsPiRpcKernel({
    rpc: {
      command: process.execPath,
      args: [fixture],
      env: { PI_RPC_FIXTURE_VERSION: 'fixture-rpc-1.0.0' },
      piVersion: 'fixture-rpc-1.0.0',
    },
  });
  await kernel.start({ session_id: 'live-pi-rpc-session', agent_id: 'live-pi-rpc-agent' });
  const intelligenceRuntime: any = {
    async callIntelligence(messages: any, tools: any, overrides: any = {}) {
      const outcome: any = await kernel.invokeAdmitted({
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
  const runtimeContext: any = {
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
  const service: any = createSessionCoreRuntimeService({ runtimeContext, intelligenceRuntime, heartbeatIntervalMs: 0 });
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  output.setEncoding('utf8');
  const outputRecords: any = [];
  let buffer: any = '';
  output.on('data', (chunk: any) => {
    buffer += chunk;
    while (true) {
      const newline: any = buffer.indexOf('\n');
      if (newline < 0) break;
      const line: any = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) outputRecords.push(JSON.parse(line));
    }
  });
  const runtimePromise: any = service.run({ input, output });
  try {
    const send: any = (frame: any) => input.write(`${JSON.stringify(frame)}\n`);
    await waitFor(() => outputRecords.some((record: any) => record.event === 'session_started'));
    send({ id: 'rpc-turn', method: 'session.submit', content: 'hello', idempotency_key: 'rpc-idem-1' });
    await waitFor(() => outputRecords.some((record: any) => record.event === 'session_control_response' && record.request_id === 'rpc-turn'));
    const events: any = readNarsEventLog(eventsPath).events;
    assert.ok(events.some((event: any) => event.event === 'assistant_message' && event.content === 'rpc-ok'));
    assert.equal(events.some((event: any) => event.event === 'pi_event_observed'), false);
    send({ id: 'rpc-close', method: 'session.close' });
    await runtimePromise;
    assert.equal(service.supervisor.core.lifecycleState, 'closed');
  } finally {
    await kernel.close({ reason: 'live_rpc_e2e_cleanup' });
  }
});
