#!/usr/bin/env node

import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  REPO_ROOT,
  cleanupSite,
  createLiveSite,
  loadPty,
  readEvents,
  spawnPi,
  startFixtureProvider,
  startRuntime,
  stopRuntime,
  waitForEvent,
  recordLiveEvidence,
} from '../../agent-pi-tui/test/live-test-harness.mjs';

if (!process.argv.includes('--enable-live-e2e') && process.env.NARADA_AGENT_PI_TUI_LIVE_E2E !== '1') {
  console.log('agent-runtime-server Pi client/kernel substitutability live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

await loadPty();
const provider = await startFixtureProvider({
  responseFor: () => ({ choices: [{ message: { role: 'assistant', content: 'rpc-ok' } }] }),
});
const rpcFixture = join(REPO_ROOT, 'packages', 'nars-intelligence-runtime-pi', 'test', 'fixtures', 'pi-rpc-fixture.mjs');

const canonicalKeys = new Set(['event', 'event_kind', 'turn_state', 'terminal_state', 'terminal_status', 'content', 'status', 'source', 'source_kind', 'transport', 'delivery_mode', 'turn_attempt', 'attempt', 'tool_name', 'request_outcome']);
function canonicalEvent(event) {
  return Object.fromEntries([...canonicalKeys]
    .filter((key) => event[key] !== undefined && event[key] !== null)
    .sort()
    .map((key) => [key, event[key]]));
}

async function runKernel(kernelKind, kernelEnv = {}) {
  let site = null;
  let runtime = null;
  let pi = null;
  const providerRequestCountBefore = provider.requests.filter((request) => request.prompt === 'GAP_KERNEL_INPUT').length;
  try {
    site = await createLiveSite({
      provider,
      kernelKind,
      kernelEnv,
      sessionId: `agent-pi-tui-kernel-${kernelKind}-${Date.now()}`,
      agentId: 'agent-pi-tui-kernel-substitutability.resident',
    });
    // This matrix intentionally goes through the canonical operator-surface
    // launcher. Direct runtime startup remains available to narrower fixture
    // probes, but it cannot serve as production binding evidence.
    runtime = await startRuntime(site, { direct: false });
    pi = spawnPi(site, runtime, {
      name: `agent-pi-tui-kernel-${kernelKind}`,
      bindingPath: runtime.bindingPath,
    });
    await pi.waitForText(['live', 'connected', 'replaying'], `${kernelKind}_attach`);
    const startup = readEvents(site.eventsPath).find((event) => event.event === 'session_started');
    const health = await fetch(runtime.healthEndpoint).then((response) => response.json());
    const observedKernelKind = health.intelligence_kernel_kind
      ?? health.intelligence?.intelligence_kernel_kind
      ?? health.kernel?.kernel_kind
      ?? health.intelligence?.kernel?.kernel_kind;
    const startEvidence = health.kernel_start_evidence ?? health.intelligence?.kernel_start_evidence;
    assert.equal(observedKernelKind, kernelKind);
    assert.equal(startEvidence?.kernel_kind, kernelKind);
    assert.equal(startup?.intelligence?.intelligence_kernel_kind, undefined);
    assert.equal(startup?.intelligence?.kernel, undefined);
    assert.equal(startup?.intelligence?.kernel_start_evidence, undefined);
    await pi.submit('GAP_KERNEL_INPUT');
    await waitForEvent(site.eventsPath, (event) => event.event === 'user_message' && event.content === 'GAP_KERNEL_INPUT', `${kernelKind}_user`);
    await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'rpc-ok', `${kernelKind}_assistant`);
    await pi.waitForText('rpc-ok', `${kernelKind}_assistant_projection`);
    const events = readEvents(site.eventsPath);
    const evidence = await recordLiveEvidence({
      scenario: `runtime-server-pi-client-kernel-${kernelKind}`,
      site,
      runtime,
      client: pi,
      durableOracle: site.eventsPath,
      externalOracles: ['fixture-provider-request-log', 'rpc-child-request-boundary'],
      negativeAssertions: ['kernel_identity_not_in_canonical_projection', 'rpc_child_does_not_bypass_runtime_boundary'],
      productionLaunchBinding: runtime.productionLaunchBinding,
      posture: 'partial-production-launch',
    });
    return {
      kernelKind,
      events: events
        .filter((event) => ['user_message', 'assistant_message', 'carrier_turn_started', 'carrier_turn_completed', 'turn_lifecycle_transition', 'turn_complete'].includes(event.event))
        .map(canonicalEvent),
      providerRequestCount: provider.requests.filter((request) => request.prompt === 'GAP_KERNEL_INPUT').length - providerRequestCountBefore,
      sessionEvents: events,
      evidence,
    };
  } catch (error) {
    console.error(JSON.stringify({
      kernel: kernelKind,
      runtime_output: runtime?.output?.(),
      pi_text: pi?.text?.(),
      events: site ? readEvents(site.eventsPath).slice(-50) : [],
    }, null, 2));
    throw error;
  } finally {
    await pi?.kill?.().catch(() => {});
    await stopRuntime(runtime, { hard: false }).catch(() => {});
    await cleanupSite(site).catch(() => {});
  }
}

let result = { status: 'failed' };
try {
  const native = await runKernel('narada-native');
  const rpc = await runKernel('pi-rpc', {
    NARADA_PI_RPC_COMMAND: process.execPath,
    NARADA_PI_RPC_ARGS: JSON.stringify([rpcFixture]),
    NARADA_PI_VERSION: 'fixture-1.0.0',
  });
  assert.deepEqual(rpc.events, native.events, 'kernel choice must not change the canonical client-visible turn projection');
  assert.equal(native.providerRequestCount, 1);
  assert.equal(rpc.providerRequestCount, 0, 'the RPC kernel must not bypass its child boundary by calling the HTTP provider');
  assert.equal(native.events.some((event) => event.event === 'pi_event_observed'), false);
  assert.equal(rpc.events.some((event) => event.event === 'pi_event_observed'), false);
  assert.equal(rpc.events.some((event) => event.kernel_kind || event.pi_event_kind), false, 'Pi diagnostics must not enter the canonical conversation projection');
  result = {
    schema: 'narada.agent_runtime_server.pi_client_kernel_substitutability_e2e.v1',
    status: 'passed',
    kernels: ['narada-native', 'pi-rpc'],
    checks: [
      'same_real_pi_pty_journey',
      'same_canonical_turn_projection',
      'kernel_identity_confined_to_health_diagnostics',
      'rpc_child_is_hidden_behind_runtime_boundary',
    ],
    evidence: { native: native.evidence, rpc: rpc.evidence },
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}

await provider.close().catch(() => {});
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'passed' ? 0 : 1);
