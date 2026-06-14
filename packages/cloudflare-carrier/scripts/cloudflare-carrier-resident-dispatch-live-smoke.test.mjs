import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatResidentDispatchLiveSmokeText,
  parseResidentDispatchLiveSmokeArgs,
  runResidentDispatchLiveSmoke,
} from './cloudflare-carrier-resident-dispatch-live-smoke.mjs';

test('parseResidentDispatchLiveSmokeArgs supports operator session auth', () => {
  const parsed = parseResidentDispatchLiveSmokeArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {}, () => new Date('2026-06-12T00:00:00.000Z'));

  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.equal(parsed.siteId, 'site_live_smoke');
  assert.equal(parsed.operationId, 'operation_live_alpha');
  assert.equal(parsed.dispatchDecisionId, 'resident_dispatch_live_20260612000000');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
});

test('parseResidentDispatchLiveSmokeArgs supports text format', () => {
  const parsed = parseResidentDispatchLiveSmokeArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {}, () => new Date('2026-06-12T00:00:00.000Z'));

  assert.equal(parsed.format, 'text');
});

test('formatResidentDispatchLiveSmokeText renders direct follow-on reads', () => {
  const text = formatResidentDispatchLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    dispatch_decision_id: 'resident_dispatch_live_alpha',
    carrier_session_id: 'carrier_session_live_alpha',
    dispatch_state: 'cloudflare_primary_started',
    dispatch_action: 'cloudflare_session_start',
    fallback_status: 'available',
    fallback_authority: 'windows_fallback_dispatcher',
    workflow_next_action: 'monitor_operation',
  });

  assert.match(text, /^Resident Dispatch Workflow: ok/m);
  assert.match(text, /Dispatch Decision: resident_dispatch_live_alpha/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text/);
});

test('formatResidentDispatchLiveSmokeText suppresses follow-on reads without concrete worker', () => {
  const text = formatResidentDispatchLiveSmokeText({
    status: 'ok',
    worker_url: null,
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    dispatch_decision_id: 'resident_dispatch_live_alpha',
    carrier_session_id: 'carrier_session_live_alpha',
  });

  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Session Evidence:/);
  assert.doesNotMatch(text, /Task Review:/);
  assert.doesNotMatch(text, /Task Workflow:/);
});

test('runResidentDispatchLiveSmoke uses operator session cookie headers and returns readback summary', async () => {
  const calls = [];
  const result = await runResidentDispatchLiveSmoke({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    siteRef: 'cloudflare://site_live_smoke',
    operationId: 'operation_live_alpha',
    agentId: 'agent.operator.dispatch',
    windowsFallbackRef: 'windows_local_site_resident_loop',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    carrierSessionId: 'carrier_session_live_alpha',
    dispatchDecisionId: 'resident_dispatch_live_alpha',
    suffix: '20260612000000',
  }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      const operation = JSON.parse(options.body).operation;
      if (operation === 'resident_dispatch.primary_with_fallback.start') {
        return jsonResponse(200, {
          ok: true,
          status: 'cloudflare_primary_started',
          dispatch_authority: 'cloudflare_primary_dispatcher',
          fallback_authority: 'windows_fallback_dispatcher',
          fallback_status: 'available',
          dispatch_action: 'cloudflare_session_start',
          carrier_session_id: 'carrier_session_live_alpha',
          session_start: { event: { event_kind: 'carrier_session_started' } },
        });
      }
      if (operation === 'resident_dispatch.primary_with_fallback.list') {
        return jsonResponse(200, {
          ok: true,
          dispatch_decisions: [{
            dispatch_decision_id: 'resident_dispatch_live_alpha',
            decision_state: 'cloudflare_primary_started',
            dispatch_authority: 'cloudflare_primary_dispatcher',
            fallback_authority: 'windows_fallback_dispatcher',
            fallback_status: 'available',
          }],
        });
      }
      if (operation === 'operation.read') {
        return jsonResponse(200, {
          ok: true,
          summary: {
            operation_id: 'operation_live_alpha',
            workflow_next_action: 'monitor_operation',
          },
          resident_dispatch_decisions: [{ dispatch_decision_id: 'resident_dispatch_live_alpha' }],
          operation_product_surface: { resident_dispatch_decision_count: 1 },
          sessions: [{ carrier_session_id: 'carrier_session_live_alpha' }],
        });
      }
      throw new Error(`unexpected_operation:${operation}`);
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.resident_dispatch_live_smoke.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.workflow_next_action, 'monitor_operation');
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://carrier.example/api/carrier');
  assert.equal(calls[0].options.headers.cookie, 'narada_operator_session=operator-session-cookie');
  assert.equal(calls[0].body.operation, 'resident_dispatch.primary_with_fallback.start');
  assert.equal(calls[1].body.operation, 'resident_dispatch.primary_with_fallback.list');
  assert.equal(calls[2].body.operation, 'operation.read');
});

test('runResidentDispatchLiveSmoke accepts cloudflare primary failure when windows fallback remains available', async () => {
  const result = await runResidentDispatchLiveSmoke({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    siteRef: 'cloudflare://site_live_smoke',
    operationId: 'operation_live_alpha',
    agentId: 'agent.operator.dispatch',
    windowsFallbackRef: 'windows_local_site_resident_loop',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    carrierSessionId: 'carrier_session_live_alpha',
    dispatchDecisionId: 'resident_dispatch_live_alpha',
    suffix: '20260612000000',
  }, {
    fetchImpl: async (_url, options) => {
      const operation = JSON.parse(options.body).operation;
      if (operation === 'resident_dispatch.primary_with_fallback.start') {
        return jsonResponse(400, {
          ok: false,
          status: 'cloudflare_primary_failed_windows_fallback_available',
          dispatch_authority: 'cloudflare_primary_dispatcher',
          fallback_authority: 'windows_fallback_dispatcher',
          fallback_status: 'available',
          dispatch_action: 'cloudflare_session_start',
          carrier_session_id: 'carrier_session_live_alpha',
        });
      }
      if (operation === 'resident_dispatch.primary_with_fallback.list') {
        return jsonResponse(200, {
          ok: true,
          dispatch_decisions: [{
            dispatch_decision_id: 'resident_dispatch_live_alpha',
            decision_state: 'cloudflare_primary_failed_windows_fallback_available',
            dispatch_authority: 'cloudflare_primary_dispatcher',
            fallback_authority: 'windows_fallback_dispatcher',
            fallback_status: 'available',
          }],
        });
      }
      if (operation === 'operation.read') {
        return jsonResponse(200, {
          ok: true,
          summary: {
            operation_id: 'operation_live_alpha',
            workflow_next_action: 'start_or_select_session',
          },
          resident_dispatch_decisions: [{ dispatch_decision_id: 'resident_dispatch_live_alpha' }],
          operation_product_surface: { resident_dispatch_decision_count: 1 },
          sessions: [],
        });
      }
      throw new Error(`unexpected_operation:${operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.dispatch_state, 'cloudflare_primary_failed_windows_fallback_available');
  assert.equal(result.fallback_status, 'available');
  assert.equal(result.workflow_next_action, 'start_or_select_session');
});

function jsonResponse(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
