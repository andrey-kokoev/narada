#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
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
} from './live-test-harness.mjs';

if (!process.argv.includes('--enable-live-e2e') && process.env.NARADA_AGENT_PI_TUI_LIVE_E2E !== '1') {
  console.log('agent-pi-tui determinism live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');

await loadPty();
const provider = await startFixtureProvider({
  responseFor: ({ prompt }) => ({
    choices: [{ message: { role: 'assistant', content: prompt === 'GAP_DETERMINISTIC'
      ? 'GAP_DETERMINISTIC_ASSISTANT'
      : `fixture:${prompt}` } }],
  }),
});

const volatileKeys = new Set([
  'agent_id', 'attempt_id', 'authority_runtime_id', 'control_path', 'created_at',
  'correlation_key', 'digest', 'endpoint', 'event_endpoint', 'event_id', 'event_sequence', 'events_path',
  'generated_at', 'health_endpoint', 'id', 'input_event_id', 'intent_id', 'invocation_id',
  'latest_attempt_id', 'outcome_id', 'plan_id', 'request_id', 'result_id', 'runtime_request_id',
  'sequence', 'session_id', 'session_path', 'site_id', 'site_root', 'timestamp', 'turn_id', 'idempotency_key',
  'updated_at', 'valid_until', 'authority_ref', 'delegated_authority_ref', 'created_by_pid', 'pid',
  'owner_site_root', 'workspace_root', 'runtime_pid', 'runtime_pids', 'client_pid', 'client_pids',
]);

function canonical(value, key = null) {
  if (key && (volatileKeys.has(key) || key.endsWith('_id') || key.endsWith('_at') || key.endsWith('_digest'))) return undefined;
  if (Array.isArray(value)) return value.map((entry) => canonical(entry)).filter((entry) => entry !== undefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([entryKey, entryValue]) => [entryKey, canonical(entryValue, entryKey)])
    .filter(([, entryValue]) => entryValue !== undefined));
}

async function runOnce(label) {
  let site = null;
  let runtime = null;
  let pi = null;
  try {
    site = await createLiveSite({
      provider,
      sessionId: `agent-pi-tui-determinism-${label}-${Date.now()}`,
      agentId: 'agent-pi-tui-determinism.resident',
    });
    runtime = await startRuntime(site, { direct: !productionLaunch });
    pi = spawnPi(site, runtime, { name: `agent-pi-tui-determinism-${label}` });
    await pi.waitForText(['live', 'connected', 'replaying'], `${label}_attach`);
    await pi.submit('GAP_DETERMINISTIC');
    await waitForEvent(site.eventsPath, (event) => event.event === 'user_message' && event.content === 'GAP_DETERMINISTIC', `${label}_user`);
    await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_DETERMINISTIC_ASSISTANT', `${label}_assistant`);
    await pi.waitForText('GAP_DETERMINISTIC_ASSISTANT', `${label}_assistant_projection`);
    const evidence = await recordLiveEvidence({
      scenario: `p2-determinism-${label}`,
      site,
      runtime,
      client: pi,
      durableOracle: site.eventsPath,
      externalOracles: ['fixture-provider-request-log', 'canonical-event-projection'],
      negativeAssertions: ['volatile-identifiers-are-excluded-before-projection-comparison'],
      productionLaunchBinding: productionLaunch,
      posture: productionLaunch ? 'partial-production-launch' : 'fixture-boundary',
    });
    return {
      events: readEvents(site.eventsPath).map((event) => canonical(event)),
      providerRequests: provider.requests.filter((request) => request.prompt === 'GAP_DETERMINISTIC').length,
      evidence,
    };
  } finally {
    await pi?.kill?.().catch(() => {});
    await stopRuntime(runtime, { hard: false }).catch(() => {});
    await cleanupSite(site).catch(() => {});
  }
}

let result = { status: 'failed' };
try {
  const first = await runOnce('first');
  const second = await runOnce('second');
  assert.equal(first.providerRequests, 1);
  assert.equal(second.providerRequests, 2);
  assert.deepEqual(second.events, first.events, 'same admitted input must produce the same canonical event projection');
  result = {
    schema: 'narada.agent_pi_tui.determinism_e2e.v1',
    status: 'passed',
    checks: [
      'repeated_real_pi_runtime_run',
      'canonical_event_projection_equal_after_volatile_fields_removed',
      'provider_request_oracle_observed_once_per_run',
    ],
    canonical_event_count: first.events.length,
    evidence: { first: first.evidence, second: second.evidence },
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}

await provider.close().catch(() => {});
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'passed' ? 0 : 1);
