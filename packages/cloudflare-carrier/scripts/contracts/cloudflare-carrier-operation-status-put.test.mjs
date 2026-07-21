import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationStatusPutText,
  parseOperationStatusPutArgs,
  putCloudflareOperationStatus,
  summarizeOperationStatusPut,
} from '../commands/cloudflare-carrier-operation-status-put.mjs';

test('parseOperationStatusPutArgs builds governed operation.status.put params', () => {
  const parsed = parseOperationStatusPutArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--status', 'inactive',
    '--reason', 'operation_paused_by_operator',
    '--request-id', 'request_alpha_status',
    '--format', 'text',
  ], {}, () => 123);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_alpha_status');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    status: 'inactive',
    reason: 'operation_paused_by_operator',
  });
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
});

test('parseOperationStatusPutArgs normalizes paused compatibility alias to inactive', () => {
  const parsed = parseOperationStatusPutArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--status', 'paused',
  ], {}, () => 123);

  assert.equal(parsed.params.status, 'inactive');
});

test('parseOperationStatusPutArgs admits needs_continuation operation lifecycle state', () => {
  const parsed = parseOperationStatusPutArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--status', 'needs_continuation',
  ], {}, () => 123);

  assert.equal(parsed.params.status, 'needs_continuation');
});

test('parseOperationStatusPutArgs refuses missing authority and unsupported status', () => {
  assert.throws(
    () => parseOperationStatusPutArgs(['--token', 'secret-token', '--site', 'site_alpha', '--operation-id', 'operation_alpha', '--status', 'inactive'], {}),
    /operation_status_put_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseOperationStatusPutArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--operation-id', 'operation_alpha', '--status', 'inactive'], {}),
    /operation_status_put_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseOperationStatusPutArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--site', 'site_alpha', '--status', 'inactive'], {}),
    /operation_status_put_requires_--operation-id_or_CLOUDFLARE_CARRIER_OPERATION_ID/,
  );
  assert.throws(
    () => parseOperationStatusPutArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--site', 'site_alpha', '--operation-id', 'operation_alpha'], {}),
    /operation_status_put_requires_--status_or_CLOUDFLARE_CARRIER_OPERATION_STATUS/,
  );
  assert.throws(
    () => parseOperationStatusPutArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--site', 'site_alpha', '--operation-id', 'operation_alpha', '--status', 'deleted'], {}),
    /operation_status_put_status_unsupported:deleted/,
  );
  assert.throws(
    () => parseOperationStatusPutArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--operation-id', 'operation_alpha', '--status', 'inactive'], {}),
    /operation_status_put_requires_bearer_token_or_operator_session/,
  );
});

test('putCloudflareOperationStatus posts operation.status.put envelope and redacts auth material', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: url.toString(), init });
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          previous_status: 'active',
          operation: {
            site_id: 'site_alpha',
            operation_id: 'operation_alpha',
            status: 'closed',
            reason: 'operation_closed_by_operator',
            updated_at: '2026-06-11T00:00:00.000Z',
          },
        });
      },
    };
  };

  const result = await putCloudflareOperationStatus({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_alpha_status',
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      status: 'closed',
      reason: 'operation_closed_by_operator',
    },
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
  }, fetchImpl);

  assert.equal(calls[0].url, 'https://carrier.example.test/api/carrier');
  assert.deepEqual(calls[0].init.headers, {
    'content-type': 'application/json',
    authorization: 'Bearer secret-token',
  });
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    operation: 'operation.status.put',
    request_id: 'request_alpha_status',
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      status: 'closed',
      reason: 'operation_closed_by_operator',
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_status_put.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    ok: true,
    code: null,
    action: null,
    previous_status: 'active',
    status: 'closed',
    requested_status: 'closed',
    reason: 'operation_closed_by_operator',
    transition: null,
    updated_at: '2026-06-11T00:00:00.000Z',
  });
});

test('putCloudflareOperationStatus surfaces structured worker refusal evidence', async () => {
  await assert.rejects(
    async () => {
      await putCloudflareOperationStatus({
        workerUrl: 'https://carrier.example.test',
        requestId: 'request_denied',
        format: 'text',
        params: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'active' },
        auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
      }, async () => ({
        status: 400,
        async text() {
          return JSON.stringify({
            ok: false,
            code: 'operation_status_transition_denied',
            action: 'deny',
            reason: 'closed_operation_is_terminal',
            site_id: 'site_alpha',
            operation_id: 'operation_alpha',
            previous_status: 'closed',
            requested_status: 'active',
            transition: 'closed_to_active',
          });
        },
      }));
    },
    (error) => {
      assert.match(error.message, /operation_status_put_request_failed:operation_status_transition_denied/);
      assert.equal(error.code, 'operation_status_transition_denied');
      assert.equal(error.http_status, 400);
      assert.equal(error.response.reason, 'closed_operation_is_terminal');
      assert.deepEqual(error.summary, {
        site_id: 'site_alpha',
        operation_id: 'operation_alpha',
        ok: false,
        code: 'operation_status_transition_denied',
        action: 'deny',
        previous_status: 'closed',
        status: 'active',
        requested_status: 'active',
        reason: 'closed_operation_is_terminal',
        transition: 'closed_to_active',
        updated_at: null,
      });
      assert.equal(error.config.format, 'text');
      return true;
    },
  );
});

test('formatOperationStatusPutText renders operator summary without auth material', () => {
  const text = formatOperationStatusPutText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'inactive' },
    summary: summarizeOperationStatusPut({
      reason: 'operation_paused_by_operator',
      previous_status: 'active',
      operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'inactive', updated_at: '2026-06-11T00:00:00.000Z' },
    }),
    auth: { kind: 'bearer', value: 'secret-token' },
  });

  assert.match(text, /Operation Status Put: ok/);
  assert.match(text, /Site: site_alpha/);
  assert.match(text, /Operation: operation_alpha/);
  assert.match(text, /Status: inactive/);
  assert.match(text, /Reason: operation_paused_by_operator/);
  assert.match(text, /Transition: active -> inactive/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.equal(text.includes('secret-token'), false);
});

test('formatOperationStatusPutText suppresses worker-scoped handoff without worker url', () => {
  const text = formatOperationStatusPutText({
    auth_source: 'operator-session-file',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'inactive' },
    summary: summarizeOperationStatusPut({
      reason: 'operation_paused_by_operator',
      previous_status: 'active',
      operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'inactive', updated_at: '2026-06-11T00:00:00.000Z' },
    }),
  });

  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
});

test('formatOperationStatusPutText renders refused lifecycle transition evidence', () => {
  const text = formatOperationStatusPutText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'active' },
    summary: summarizeOperationStatusPut({
      ok: false,
      code: 'operation_status_transition_denied',
      action: 'deny',
      reason: 'closed_operation_is_terminal',
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      previous_status: 'closed',
      requested_status: 'active',
      transition: 'closed_to_active',
    }, { status: 'active' }),
    auth: { kind: 'bearer', value: 'secret-token' },
  });

  assert.match(text, /Operation Status Put: refused/);
  assert.match(text, /Code: operation_status_transition_denied/);
  assert.match(text, /Status: active/);
  assert.match(text, /Reason: closed_operation_is_terminal/);
  assert.match(text, /Transition: closed -> active/);
  assert.match(text, /Transition Evidence: closed_to_active/);
  assert.equal(text.includes('secret-token'), false);
});
