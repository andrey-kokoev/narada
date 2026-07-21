import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudflareCarrierHttpRouter } from './cloudflare-http-router.mjs';

function responseBody(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeRouter(overrides = {}) {
  const calls = [];
  const router = createCloudflareCarrierHttpRouter({
    authenticateCarrierApiRequest: async () => ({
      ok: true,
      principal: { principal_id: 'principal:test' },
    }),
    isSiteProductOperation: (operation) => operation === 'site.read',
    handleSiteProductApiRequest: async (body, principal, env) => {
      calls.push({ kind: 'site', body, principal, env });
      return { status: 206, body: { ok: true, route: 'site' } };
    },
    routeCarrierSessionRequest: async (url, body, principal, env) => {
      calls.push({ kind: 'session', url, body, principal, env });
      return { status: 207, body: { ok: true, route: 'session' } };
    },
    withPrincipalEvidence: (body, operation, principal) => ({
      ...body,
      operation,
      principal,
    }),
    jsonResponse: responseBody,
    ...overrides,
  });
  return { router, calls };
}

test('HTTP router returns authentication refusal without invoking a handler', async () => {
  const calls = [];
  const { router } = makeRouter({
    authenticateCarrierApiRequest: async () => ({
      ok: false,
      code: 'unauthorized',
      status: 401,
    }),
    handleSiteProductApiRequest: async () => calls.push('site'),
    routeCarrierSessionRequest: async () => calls.push('session'),
  });

  const response = await router(
    new Request('https://carrier.test/api/carrier', {
      method: 'POST',
      body: JSON.stringify({ operation: 'site.read' }),
    }),
    { marker: 'env' },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, code: 'unauthorized' });
  assert.deepEqual(calls, []);
});

test('HTTP router dispatches site-product operations and decorates principal evidence', async () => {
  const { router, calls } = makeRouter();
  const env = { marker: 'site-env' };
  const response = await router(
    new Request('https://carrier.test/api/carrier', {
      method: 'POST',
      body: JSON.stringify({ operation: 'site.read', request_id: 'request-site' }),
    }),
    env,
  );

  assert.equal(response.status, 206);
  assert.deepEqual(await response.json(), {
    ok: true,
    route: 'site',
    operation: 'site.read',
    principal: { principal_id: 'principal:test' },
  });
  assert.equal(calls[0].kind, 'site');
  assert.equal(calls[0].env, env);
});

test('HTTP router dispatches carrier sessions with the original URL and body', async () => {
  const { router, calls } = makeRouter();
  const env = { marker: 'session-env' };
  const request = new Request('https://carrier.test/control', {
    method: 'POST',
    body: JSON.stringify({ operation: 'session.status', carrier_session_id: 'carrier:test' }),
  });
  const response = await router(request, env);

  assert.equal(response.status, 207);
  assert.deepEqual(await response.json(), {
    ok: true,
    route: 'session',
    operation: 'session.status',
    principal: { principal_id: 'principal:test' },
  });
  assert.equal(calls[0].url, request.url);
  assert.deepEqual(calls[0].body, {
    operation: 'session.status',
    carrier_session_id: 'carrier:test',
  });
  assert.equal(calls[0].env, env);
});
