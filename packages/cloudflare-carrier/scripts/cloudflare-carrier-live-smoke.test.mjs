import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatLiveSmokeText,
  parseLiveSmokeArgs,
} from './cloudflare-carrier-live-smoke.mjs';

test('parseLiveSmokeArgs accepts bearer auth and text format', () => {
  const config = parseLiveSmokeArgs([
    '--url', 'https://carrier.example',
    '--format', 'text',
    '--site', 'site_example',
    '--intelligence-site', 'site:example',
    '--operation', 'operation_example',
    '--goal', 'prove live carrier',
  ], {
    CLOUDFLARE_CARRIER_TOKEN: 'token-live-smoke',
  });

  assert.equal(config.workerUrl, 'https://carrier.example');
  assert.equal(config.format, 'text');
  assert.equal(config.siteId, 'site_example');
  assert.equal(config.intelligenceSiteId, 'site:example');
  assert.equal(config.operationId, 'operation_example');
  assert.equal(config.expectedGoal, 'prove live carrier');
  assert.equal(config.auth.kind, 'bearer');
  assert.equal(config.intelligenceDiagnosticsEnabled, false);
});

test('parseLiveSmokeArgs can explicitly request the diagnostic deployment lane', () => {
  const config = parseLiveSmokeArgs([
    '--url', 'https://carrier.example',
    '--intelligence-diagnostics', 'enabled',
  ], {
    CLOUDFLARE_CARRIER_TOKEN: 'token-live-smoke',
  });

  assert.equal(config.intelligenceDiagnosticsEnabled, true);
});

test('formatLiveSmokeText emits direct downstream reads', () => {
  const output = formatLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    carrier_session_id: 'carrier_session_live_smoke_20260614',
    site_id: 'site_example',
    operation_id: 'operation_example',
    agent_id: 'narada.live.smoke',
    goal: { text: 'prove live cloudflare carrier', state: 'active' },
    provider_adapter_posture: 'cloudflare-workers-ai',
    provider_request_status: 'completed',
    provider_execution_enabled: true,
    tool_effect_posture: 'configured',
    tool_effect_adapter_kind: 'cloudflare-tool-effect-boundary',
    task_create_status: 'ok',
    task_update_status: 'ok',
    persisted_tasks: [{ task_id: 'task-1' }],
    intelligence_live_diagnostics: {
      enabled: false,
      evidence_posture: 'diagnostic-disabled-by-runtime-configuration',
      provider_transport_exercised: false,
      disabled_reason_code: 'cloudflare_intelligence_diagnostic_disabled',
    },
  });

  assert.match(output, /Live Smoke: ok/);
  assert.match(output, /Site Read:/);
  assert.match(output, /Site Next Workflow:/);
  assert.match(output, /Posture Coherence Review:/);
  assert.match(output, /Durability Coherence Review:/);
  assert.match(output, /Session Evidence:/);
  assert.match(output, /Task Review:/);
  assert.match(output, /Task Workflow:/);
  assert.match(output, /Operation Review:/);
  assert.match(output, /Operation Next Workflow:/);
  assert.match(output, /Intelligence Diagnostics: enabled=false posture=diagnostic-disabled-by-runtime-configuration/);
});

test('formatLiveSmokeText suppresses guarded links without concrete ids', () => {
  const output = formatLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    carrier_session_id: '',
    site_id: '',
    operation_id: '',
    agent_id: 'narada.live.smoke',
    goal: { text: 'prove live cloudflare carrier', state: 'active' },
    provider_adapter_posture: 'cloudflare-workers-ai',
    provider_request_status: 'completed',
    provider_execution_enabled: true,
    tool_effect_posture: 'configured',
    tool_effect_adapter_kind: 'cloudflare-tool-effect-boundary',
    task_create_status: 'ok',
    task_update_status: 'ok',
    persisted_tasks: [{ task_id: 'task-1' }],
  });

  assert.doesNotMatch(output, /Site Read:/);
  assert.doesNotMatch(output, /Site Next Workflow:/);
  assert.doesNotMatch(output, /Posture Coherence Review:/);
  assert.doesNotMatch(output, /Durability Coherence Review:/);
  assert.doesNotMatch(output, /Session Evidence:/);
  assert.doesNotMatch(output, /Task Review:/);
  assert.doesNotMatch(output, /Task Workflow:/);
  assert.doesNotMatch(output, /Operation Review:/);
  assert.doesNotMatch(output, /Operation Next Workflow:/);
});
