#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageRoot = new URL('..', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const rootPackageJson = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
const requiredLiveTests = [
  'live-four-surface-acceptance-e2e.mjs',
  'live-p0-durability-cancellation-e2e.mjs',
  'live-p1-authority-negative-e2e.mjs',
  'live-p1-controls-launch-binding-e2e.mjs',
  'live-p1-mcp-faults-e2e.mjs',
  'live-p1-pty-boundary-e2e.mjs',
  'live-p1-transport-idempotency-e2e.mjs',
  'live-p1-uncertain-admission-retry-e2e.mjs',
  'live-p1-ambient-isolation-e2e.mjs',
  'live-p1-provider-auth-faults-e2e.mjs',
  'live-p1-compaction-reconstruction-e2e.mjs',
  'live-p2-determinism-e2e.mjs',
];
const scriptText = `${packageJson.scripts?.['test:live:e2e'] ?? ''}\n${packageJson.scripts?.['test:live:local'] ?? ''}\n${packageJson.scripts?.['test:live:production-binding'] ?? ''}\n${packageJson.scripts?.['test:baseline-live'] ?? ''}`;
const missingFromSuite = requiredLiveTests.filter((file) => !scriptText.includes(file));
assert.deepEqual(missingFromSuite, [], 'a live test must not silently disappear from the package suite');
const aggregateLiveScript = rootPackageJson.scripts?.['test:agent-pi-tui:live'] ?? '';
assert.ok(
  aggregateLiveScript.includes('@narada2/agent-pi-tui test:live:e2e')
    && aggregateLiveScript.includes('@narada2/agent-runtime-server test:live:pi-client-kernel'),
  'the root agent-pi-tui live aggregate must include both the client suite and kernel substitutability probe',
);
const fixtureAggregateLiveScript = rootPackageJson.scripts?.['test:agent-pi-tui:live:fixture'] ?? '';
assert.ok(
  fixtureAggregateLiveScript.includes('@narada2/agent-pi-tui test:live:local')
    && fixtureAggregateLiveScript.includes('@narada2/agent-runtime-server test:live:pi-client-kernel'),
  'the CI fixture aggregate must include the local client suite and kernel substitutability probe',
);
const productionAggregateLiveScript = rootPackageJson.scripts?.['test:agent-pi-tui:live:production-binding'] ?? '';
assert.ok(
  productionAggregateLiveScript.includes('@narada2/agent-pi-tui test:live:production-binding')
    && productionAggregateLiveScript.includes('@narada2/agent-runtime-server test:live:pi-client-kernel'),
  'the opt-in production-binding aggregate must include the launcher gap probes and kernel substitutability probe',
);

const gates = {};
for (const file of requiredLiveTests) {
  const source = await readFile(new URL(`./test/${file}`, packageRoot), 'utf8');
  gates[file] = source.includes('--enable-live-e2e') && source.includes('NARADA_AGENT_PI_TUI_LIVE_E2E');
  assert.equal(gates[file], true, `${file} must remain explicitly opt-in`);
}

console.log(JSON.stringify({
  schema: 'narada.agent_pi_tui.live_suite_guard.v1',
  status: 'passed',
  required_live_tests: requiredLiveTests,
  aggregate_live_script: 'full:package-suite+runtime-server-kernel;fixture:local-package-suite+runtime-server-kernel;production-binding:launcher-gap-suite+runtime-server-kernel',
  opt_in_gates: gates,
}, null, 2));
