import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultOperatorSessionOutPath,
  formatOperatorSessionCaptureError,
  parseOperatorSessionCaptureArgs,
  verifyOperatorSession,
} from './cloudflare-carrier-operator-session-capture.mjs';
import {
  formatOperatorSessionStatus,
  parseOperatorSessionStatusArgs,
  readOperatorSessionStatus,
} from './cloudflare-carrier-operator-session-status.mjs';

test('parseOperatorSessionCaptureArgs normalizes CLI capture configuration', () => {
  const parsed = parseOperatorSessionCaptureArgs([
    '--url', 'https://carrier.example.test/',
    '--out', 'D:/tmp/operator-session.json',
    '--host', 'localhost',
    '--port', '5173',
    '--timeout-ms', '120000',
  ], {});

  assert.deepEqual(parsed, {
    workerUrl: 'https://carrier.example.test',
    outPath: 'D:/tmp/operator-session.json',
    host: 'localhost',
    port: 5173,
    timeoutMs: 120000,
  });
});

test('parseOperatorSessionCaptureArgs defaults to repo-local session file and localhost loopback', () => {
  const parsed = parseOperatorSessionCaptureArgs([
    '--url', 'https://carrier.example.test/',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.outPath, defaultOperatorSessionOutPath());
  assert.equal(parsed.host, 'localhost');
  assert.equal(parsed.port, 0);
  assert.equal(parsed.timeoutMs, 300000);
});

test('parseOperatorSessionCaptureArgs refuses invalid local listener inputs', () => {
  assert.throws(
    () => parseOperatorSessionCaptureArgs([], {}),
    /operator_session_capture_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseOperatorSessionCaptureArgs(['--url', 'https://carrier.example.test', '--port', '70000'], {}),
    /operator_session_capture_port_invalid/,
  );
  assert.throws(
    () => parseOperatorSessionCaptureArgs(['--url', 'https://carrier.example.test', '--timeout-ms', '999'], {}),
    /operator_session_capture_timeout_invalid/,
  );
});

test('verifyOperatorSession preserves structured Worker refusal evidence', async () => {
  const calls = [];
  await assert.rejects(
    async () => verifyOperatorSession('https://carrier.example.test', 'secret-cookie', async (url, init) => {
      calls.push({ url: url.toString(), init });
      return {
        status: 401,
        async json() {
          return {
            ok: false,
            code: 'operator_session_expired',
            principal: {
              auth_type: 'microsoft_oidc',
              principal_id: 'microsoft:tenant:operator',
              email: 'operator@example.test',
            },
          };
        },
      };
    }),
    (error) => {
      assert.match(error.message, /operator_session_verify_failed:operator_session_expired/);
      assert.equal(error.code, 'operator_session_expired');
      assert.equal(error.http_status, 401);
      assert.deepEqual(error.response, {
        ok: false,
        code: 'operator_session_expired',
        principal: {
          auth_type: 'microsoft_oidc',
          principal_id: 'microsoft:tenant:operator',
          email: 'operator@example.test',
        },
      });
      assert.deepEqual(error.summary, {
        ok: false,
        code: 'operator_session_expired',
        auth_type: 'microsoft_oidc',
        principal_id: 'microsoft:tenant:operator',
        email: 'operator@example.test',
      });
      return true;
    },
  );

  assert.equal(calls[0].url, 'https://carrier.example.test/auth/session');
  assert.deepEqual(calls[0].init.headers, { cookie: 'narada_operator_session=secret-cookie' });
});

test('verifyOperatorSession refuses non-Microsoft principals with summary evidence', async () => {
  await assert.rejects(
    async () => verifyOperatorSession('https://carrier.example.test', 'secret-cookie', async () => ({
      status: 200,
      async json() {
        return {
          ok: true,
          principal: {
            auth_type: 'service_token',
            principal_id: 'service',
          },
        };
      },
    })),
    (error) => {
      assert.match(error.message, /operator_session_verify_principal_not_microsoft:service_token/);
      assert.equal(error.http_status, 200);
      assert.deepEqual(error.summary, {
        ok: true,
        code: null,
        auth_type: 'service_token',
        principal_id: 'service',
        email: null,
      });
      return true;
    },
  );
});

test('formatOperatorSessionCaptureError renders verification evidence without session cookie', () => {
  const error = new Error('operator_session_verify_failed:operator_session_expired');
  error.http_status = 401;
  error.response = { ok: false, code: 'operator_session_expired' };
  error.summary = { ok: false, code: 'operator_session_expired' };
  error.cookie = 'secret-cookie';

  const text = formatOperatorSessionCaptureError(error);
  assert.match(text, /operator_session_verify_failed:operator_session_expired/);
  assert.match(text, /"http_status": 401/);
  assert.match(text, /operator_session_expired/);
  assert.equal(text.includes('secret-cookie'), false);
});

test('parseOperatorSessionStatusArgs resolves operator session auth and format', () => {
  const parsed = parseOperatorSessionStatusArgs([
    '--url', 'https://carrier.example.test/',
    '--operator-session-cookie', 'narada_operator_session=secret-cookie',
    '--format', 'text',
  ], {
    CLOUDFLARE_CARRIER_URL: '',
    CLOUDFLARE_OPERATOR_SESSION_FILE: '',
  });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.auth.kind, 'operator_session');
  assert.equal(parsed.auth.source, 'operator-session-cookie');
});

test('readOperatorSessionStatus preserves refusal evidence for expired sessions', async () => {
  const result = await readOperatorSessionStatus({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'secret-cookie', source: 'operator-session-file' },
  }, async (url, init) => {
    assert.equal(url.toString(), 'https://carrier.example.test/auth/session');
    assert.deepEqual(init.headers, {
      accept: 'application/json',
      cookie: 'narada_operator_session=secret-cookie',
    });
    return {
      ok: false,
      status: 401,
      async json() {
        return {
          ok: false,
          code: 'operator_session_expired',
          principal: {
            auth_type: 'microsoft_oidc',
            principal_id: 'microsoft:tenant:operator',
            email: 'operator@example.test',
          },
        };
      },
    };
  });

  assert.deepEqual(result, {
    schema: 'narada.cloudflare_carrier.operator_session_status.v1',
    ok: false,
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    auth_kind: 'operator_session',
    http_status: 401,
    code: 'operator_session_expired',
    principal: {
      auth_type: 'microsoft_oidc',
      principal_id: 'microsoft:tenant:operator',
      email: 'operator@example.test',
    },
    response: {
      ok: false,
      code: 'operator_session_expired',
      principal: {
        auth_type: 'microsoft_oidc',
        principal_id: 'microsoft:tenant:operator',
        email: 'operator@example.test',
      },
    },
  });
});

test('formatOperatorSessionStatus renders concise text output', () => {
  const text = formatOperatorSessionStatus({
    ok: true,
    auth_kind: 'operator_session',
    auth_source: 'operator-session-file',
    http_status: 200,
    code: null,
    principal: {
      principal_id: 'microsoft:tenant:operator',
      auth_type: 'microsoft_oidc',
      email: 'operator@example.test',
      name: 'Operator Example',
    },
  }, 'text');

  assert.match(text, /Status: ok/);
  assert.match(text, /HTTP: 200/);
  assert.match(text, /Auth: kind=operator_session source=operator-session-file/);
  assert.match(text, /Principal: microsoft:tenant:operator/);
  assert.match(text, /Email: operator@example.test/);
  assert.match(text, /Name: Operator Example/);
});
