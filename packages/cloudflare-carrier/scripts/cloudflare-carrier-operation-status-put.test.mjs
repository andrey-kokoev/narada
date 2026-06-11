import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationStatusPutText,
  parseOperationStatusPutArgs,
  putCloudflareOperationStatus,
  summarizeOperationStatusPut,
} from './cloudflare-carrier-operation-status-put.mjs';

test('parseOperationStatusPutArgs builds governed operation.status.put params', () => {
  const parsed = parseOperationStatusPutArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--status', 'paused',
    '--request-id', 'request_alpha_status',
    '--format', 'text',
  ], {}, () => 123);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_alpha_status');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    status: 'paused',
  });
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
});

test('parseOperationStatusPutArgs refuses missing authority and unsupported status', () => {
  assert.throws(
    () => parseOperationStatusPutArgs(['--token', 'secret-token', '--site', 'site_alpha', '--operation-id', 'operation_alpha', '--status', 'paused'], {}),
    /operation_status_put_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseOperationStatusPutArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--operation-id', 'operation_alpha', '--status', 'paused'], {}),
    /operation_status_put_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseOperationStatusPutArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--site', 'site_alpha', '--status', 'paused'], {}),
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
    () => parseOperationStatusPutArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--operation-id', 'operation_alpha', '--status', 'paused'], {}),
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
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_status_put.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    previous_status: 'active',
    status: 'closed',
    updated_at: '2026-06-11T00:00:00.000Z',
  });
});

test('putCloudflareOperationStatus surfaces worker refusal code', async () => {
  await assert.rejects(
    () => putCloudflareOperationStatus({
      workerUrl: 'https://carrier.example.test',
      requestId: 'request_denied',
      params: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'closed' },
      auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    }, async () => ({ status: 403, async text() { return JSON.stringify({ code: 'site_authority_denied' }); } })),
    /operation_status_put_request_failed:site_authority_denied/,
  );
});

test('formatOperationStatusPutText renders operator summary without auth material', () => {
  const text = formatOperationStatusPutText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'paused' },
    summary: summarizeOperationStatusPut({
      previous_status: 'active',
      operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'paused', updated_at: '2026-06-11T00:00:00.000Z' },
    }),
    auth: { kind: 'bearer', value: 'secret-token' },
  });

  assert.match(text, /Operation Status Put: ok/);
  assert.match(text, /Site: site_alpha/);
  assert.match(text, /Operation: operation_alpha/);
  assert.match(text, /Status: paused/);
  assert.match(text, /Transition: active -> paused/);
  assert.equal(text.includes('secret-token'), false);
});
