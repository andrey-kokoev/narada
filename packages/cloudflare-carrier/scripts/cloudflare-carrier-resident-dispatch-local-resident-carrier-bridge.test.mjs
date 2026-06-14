import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatResidentDispatchLocalResidentCarrierBridgeText,
  parseResidentDispatchLocalResidentCarrierBridgeArgs,
  runResidentDispatchLocalResidentCarrierBridge,
} from './cloudflare-carrier-resident-dispatch-local-resident-carrier-bridge.mjs';

test('parseResidentDispatchLocalResidentCarrierBridgeArgs builds put payload with defaults', () => {
  const parsed = parseResidentDispatchLocalResidentCarrierBridgeArgs([
    '--url', 'https://carrier.example/',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--fallback-evidence-id', 'resident_fallback_evidence_alpha',
    '--local-resident-session-ref', 'windows-session://operation_live_alpha/1',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {}, () => Date.parse('2026-06-12T00:00:00.000Z'));

  assert.equal(parsed.operation, 'resident_dispatch.local_resident_carrier_bridge.put');
  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.equal(parsed.auth.kind, 'operator_session');
  assert.equal(parsed.params.site_id, 'site_live_smoke');
  assert.equal(parsed.params.source_payload.bridge_admission_action, 'admit');
  assert.equal(parsed.params.source_payload.cloudflare_session_replay_binding_admission, 'admitted_by_cloudflare_operator');
  assert.equal(parsed.params.source_payload.cloudflare_runtime_session_start_admission, 'not_admitted');
});

test('parseResidentDispatchLocalResidentCarrierBridgeArgs builds list payload', () => {
  const parsed = parseResidentDispatchLocalResidentCarrierBridgeArgs([
    '--operation', 'list',
    '--url', 'https://carrier.example/',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--token', 'token-value',
    '--limit', '2',
  ], {});

  assert.equal(parsed.operation, 'resident_dispatch.local_resident_carrier_bridge.list');
  assert.deepEqual(parsed.params, {
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    limit: 2,
  });
});

test('runResidentDispatchLocalResidentCarrierBridge reads list posture', async () => {
  const result = await runResidentDispatchLocalResidentCarrierBridge({
    operation: 'resident_dispatch.local_resident_carrier_bridge.list',
    workerUrl: 'https://carrier.example',
    requestId: 'request_list_alpha',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    params: {
      site_id: 'site_live_smoke',
      operation_id: 'operation_live_alpha',
      limit: 2,
    },
  }, async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        status: 'selected',
        bridge_records: [{
          bridge_id: 'local_resident_carrier_bridge_alpha',
          operation_id: 'operation_live_alpha',
          fallback_evidence_id: 'resident_fallback_evidence_alpha',
          local_resident_session_ref: 'windows-session://operation_live_alpha/1',
          cloudflare_carrier_session_id: 'cloudflare-bridged:site_live_smoke:operation_live_alpha:1',
          cloudflare_session_replay_binding_admission: 'admitted_by_cloudflare_operator',
          cloudflare_evidence_replay_binding_admission: 'admitted_by_cloudflare_operator',
          cloudflare_runtime_session_start_admission: 'not_admitted',
          bridge_authority: 'cloudflare_operator_local_resident_carrier_bridge',
        }],
      };
    },
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.bridge_count, 1);
  assert.equal(result.summary.bridge_id, 'local_resident_carrier_bridge_alpha');
  assert.equal(result.summary.cloudflare_carrier_session_id, 'cloudflare-bridged:site_live_smoke:operation_live_alpha:1');
});

test('runResidentDispatchLocalResidentCarrierBridge accepts direct local resident session ref without fallback evidence lookup', async () => {
  let fetchCount = 0;
  const result = await runResidentDispatchLocalResidentCarrierBridge({
    operation: 'resident_dispatch.local_resident_carrier_bridge.put',
    workerUrl: 'https://carrier.example',
    requestId: 'request_put_alpha',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_live_smoke',
      source_payload: {
        operation_id: 'operation_live_alpha',
        local_resident_session_ref: 'windows-session://operation_live_alpha/1',
        bridge_admission_action: 'admit',
        bridge_admission_reason: 'governed_local_resident_carrier_evidence_admitted_into_cloudflare_replay_surface',
        bridge_authority: 'cloudflare_operator_local_resident_carrier_bridge',
        cloudflare_session_replay_binding_admission: 'admitted_by_cloudflare_operator',
        cloudflare_evidence_replay_binding_admission: 'admitted_by_cloudflare_operator',
        cloudflare_runtime_session_start_admission: 'not_admitted',
        bridge_posture: 'local_resident_inhabitance_bridged_to_cloudflare_replay',
      },
    },
  }, async (_url, init) => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          status: 'recorded',
          record: {
            bridge_id: 'local_resident_carrier_bridge_alpha',
            operation_id: 'operation_live_alpha',
            local_resident_session_ref: 'windows-session://operation_live_alpha/1',
            cloudflare_carrier_session_id: 'cloudflare-bridged:site_live_smoke:operation_live_alpha:1',
            cloudflare_session_replay_binding_admission: 'admitted_by_cloudflare_operator',
            cloudflare_evidence_replay_binding_admission: 'admitted_by_cloudflare_operator',
            cloudflare_runtime_session_start_admission: 'not_admitted',
            bridge_authority: 'cloudflare_operator_local_resident_carrier_bridge',
          },
          bridge: JSON.parse(init.body).params.source_payload,
        };
      },
    };
  });

  assert.equal(fetchCount, 1);
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.local_resident_session_ref, 'windows-session://operation_live_alpha/1');
});

test('formatResidentDispatchLocalResidentCarrierBridgeText prints key posture', () => {
  const text = formatResidentDispatchLocalResidentCarrierBridgeText({
    operation: 'resident_dispatch.local_resident_carrier_bridge.list',
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-cookie',
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    http_status: 200,
    status: 'ok',
    summary: {
      bridge_status: 'selected',
      bridge_count: 1,
      bridge_id: 'local_resident_carrier_bridge_alpha',
      fallback_evidence_id: 'resident_fallback_evidence_alpha',
      local_resident_session_ref: 'windows-session://operation_live_alpha/1',
      cloudflare_carrier_session_id: 'cloudflare-bridged:site_live_smoke:operation_live_alpha:1',
      cloudflare_session_replay_binding_admission: 'admitted_by_cloudflare_operator',
      cloudflare_evidence_replay_binding_admission: 'admitted_by_cloudflare_operator',
      cloudflare_runtime_session_start_admission: 'not_admitted',
      bridge_authority: 'cloudflare_operator_local_resident_carrier_bridge',
    },
    response: {},
  });

  assert.match(text, /Local Resident Carrier Bridge/);
  assert.match(text, /Bridge: local_resident_carrier_bridge_alpha/);
  assert.match(text, /Session Replay Admission: admitted_by_cloudflare_operator/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id cloudflare-bridged:site_live_smoke:operation_live_alpha:1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Resident Dispatch Windows Fallback Evidence Review: pnpm --filter @narada2\/cloudflare-carrier product:resident-dispatch:windows-fallback-evidence:review:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file>/);
});
