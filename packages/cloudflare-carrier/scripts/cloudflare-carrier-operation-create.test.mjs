import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCloudflareOperation,
  formatOperationCreateText,
  parseOperationCreateArgs,
  summarizeOperationCreate,
  summarizeOperationCreateFailure,
} from './cloudflare-carrier-operation-create.mjs';

test('parseOperationCreateArgs builds governed operation.create params', () => {
  const parsed = parseOperationCreateArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--display-name', 'Alpha Operation',
    '--operation-kind', 'productization',
    '--status', 'active',
    '--request-id', 'request_alpha',
    '--format', 'text',
  ], {}, () => 123);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_alpha');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    display_name: 'Alpha Operation',
    operation_kind: 'productization',
    status: 'active',
  });
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
});

test('parseOperationCreateArgs normalizes paused compatibility alias to inactive', () => {
  const parsed = parseOperationCreateArgs([
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--status', 'paused',
  ], {}, () => 123);

  assert.equal(parsed.params.status, 'inactive');
});

test('parseOperationCreateArgs admits needs_continuation operation lifecycle state', () => {
  const parsed = parseOperationCreateArgs([
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--status', 'needs_continuation',
  ], {}, () => 123);

  assert.equal(parsed.params.status, 'needs_continuation');
});

test('parseOperationCreateArgs refuses missing authority and unsupported status', () => {
  assert.throws(
    () => parseOperationCreateArgs(['--token', 'secret-token', '--site', 'site_alpha'], {}),
    /operation_create_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseOperationCreateArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token'], {}),
    /operation_create_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseOperationCreateArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--site', 'site_alpha', '--status', 'deleted'], {}),
    /operation_create_status_unsupported:deleted/,
  );
  assert.throws(
    () => parseOperationCreateArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha'], {}),
    /operation_create_requires_bearer_token_or_operator_session/,
  );
});

test('createCloudflareOperation posts operation.create envelope and redacts auth material', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: url.toString(), init });
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          operation: {
            site_id: 'site_alpha',
            operation_id: 'operation_alpha',
            display_name: 'Alpha Operation',
            operation_kind: 'productization',
            status: 'active',
            created_at: '2026-06-11T00:00:00.000Z',
            updated_at: '2026-06-11T00:00:00.000Z',
          },
        });
      },
    };
  };

  const result = await createCloudflareOperation({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_alpha',
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      display_name: 'Alpha Operation',
      operation_kind: 'productization',
      status: 'active',
    },
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
  }, fetchImpl);

  assert.equal(calls[0].url, 'https://carrier.example.test/api/carrier');
  assert.deepEqual(calls[0].init.headers, {
    'content-type': 'application/json',
    authorization: 'Bearer secret-token',
  });
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    operation: 'operation.create',
    request_id: 'request_alpha',
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      display_name: 'Alpha Operation',
      operation_kind: 'productization',
      status: 'active',
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_create.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    display_name: 'Alpha Operation',
    operation_kind: 'productization',
    status: 'active',
    created_at: '2026-06-11T00:00:00.000Z',
    updated_at: '2026-06-11T00:00:00.000Z',
  });
});

test('createCloudflareOperation preserves structured Worker refusal evidence', async () => {
  await assert.rejects(
    async () => createCloudflareOperation({
      workerUrl: 'https://carrier.example.test',
      requestId: 'request_denied',
      params: { site_id: 'site_alpha', operation_id: 'operation_alpha', display_name: 'Alpha', operation_kind: 'operator', status: 'active' },
      auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    }, async () => ({
      status: 403,
      async text() {
        return JSON.stringify({
          ok: false,
          code: 'site_authority_denied',
          action: 'deny',
          reason: 'operator_lacks_site_role',
          site_id: 'site_alpha',
          operation_id: 'operation_alpha',
        });
      },
    })),
    (error) => {
      assert.match(error.message, /operation_create_request_failed:site_authority_denied/);
      assert.equal(error.code, 'site_authority_denied');
      assert.equal(error.http_status, 403);
      assert.deepEqual(error.response, {
        ok: false,
        code: 'site_authority_denied',
        action: 'deny',
        reason: 'operator_lacks_site_role',
        site_id: 'site_alpha',
        operation_id: 'operation_alpha',
      });
      assert.deepEqual(error.summary, {
        ok: false,
        code: 'site_authority_denied',
        action: 'deny',
        reason: 'operator_lacks_site_role',
        site_id: 'site_alpha',
        operation_id: 'operation_alpha',
        status: 'active',
      });
      assert.equal(error.config.auth.value, 'secret-token');
      return true;
    },
  );
});

test('formatOperationCreateText renders operator summary without auth material', () => {
  const text = formatOperationCreateText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha', display_name: 'Alpha Operation', operation_kind: 'productization', status: 'active' },
    summary: summarizeOperationCreate({
      operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', display_name: 'Alpha Operation', operation_kind: 'productization', status: 'active' },
    }),
    auth: { kind: 'bearer', value: 'secret-token' },
  });

  assert.match(text, /Operation Create: ok/);
  assert.match(text, /Site: site_alpha/);
  assert.match(text, /Operation: operation_alpha/);
  assert.match(text, /Kind: productization/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.equal(text.includes('secret-token'), false);
});

test('formatOperationCreateText suppresses worker-scoped handoff without worker url', () => {
  const text = formatOperationCreateText({
    auth_source: 'operator-session-file',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha', display_name: 'Alpha Operation', operation_kind: 'productization', status: 'active' },
    summary: summarizeOperationCreate({
      operation: { site_id: 'site_alpha', operation_id: 'operation_alpha', display_name: 'Alpha Operation', operation_kind: 'productization', status: 'active' },
    }),
  });

  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
});

test('formatOperationCreateText renders refused operation creates without auth material', () => {
  const text = formatOperationCreateText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha', status: 'active' },
    summary: summarizeOperationCreateFailure({
      ok: false,
      code: 'site_authority_denied',
      action: 'deny',
      reason: 'operator_lacks_site_role',
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
    }, { status: 'active' }),
    auth: { kind: 'bearer', value: 'secret-token' },
  });

  assert.match(text, /Operation Create: refused/);
  assert.match(text, /Code: site_authority_denied/);
  assert.match(text, /Site: site_alpha/);
  assert.match(text, /Operation: operation_alpha/);
  assert.match(text, /Refusal: action=deny reason=operator_lacks_site_role/);
  assert.equal(text.includes('secret-token'), false);
});
