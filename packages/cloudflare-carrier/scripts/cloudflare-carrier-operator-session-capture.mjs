#!/usr/bin/env node
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function parseOperatorSessionCaptureArgs(argv = [], env = process.env) {
  const args = [...argv];
  const option = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const workerUrl = String(option('--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '').replace(/\/+$/, '');
  const outPath = option('--out') ?? env.CLOUDFLARE_OPERATOR_SESSION_OUT ?? 'cloudflare-operator-session.json';
  const host = option('--host') ?? '127.0.0.1';
  const requestedPort = Number.parseInt(option('--port') ?? '0', 10);
  const timeoutMs = Number.parseInt(option('--timeout-ms') ?? '300000', 10);

  if (!workerUrl) throw new Error('operator_session_capture_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error('operator_session_capture_port_invalid');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) throw new Error('operator_session_capture_timeout_invalid');

  return { workerUrl, outPath, host, port: requestedPort, timeoutMs };
}

export async function captureOperatorSession({ workerUrl, host, port, timeoutMs }, fetchImpl = fetch) {
  let server;
  const received = new Promise((resolve, reject) => {
    server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', `http://${host}`);
      if (requestUrl.pathname !== '/capture') {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('not found');
        return;
      }
      const cookie = requestUrl.searchParams.get('cookie') ?? '';
      const principalId = requestUrl.searchParams.get('principal_id') ?? '';
      const email = requestUrl.searchParams.get('email') ?? '';
      response.writeHead(cookie ? 200 : 400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(cookie ? 'Narada operator session captured. You can close this tab.' : 'Narada operator session cookie missing.');
      if (!cookie) reject(new Error('operator_session_capture_cookie_missing'));
      else resolve({ cookie, principal_id: principalId, email });
    });
    server.on('error', reject);
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  const listenPort = typeof address === 'object' && address ? address.port : port;
  const returnTo = `http://${host}:${listenPort}/capture`;
  const captureUrl = new URL('/auth/operator/session-capture', workerUrl);
  captureUrl.searchParams.set('return_to', returnTo);

  process.stdout.write(`Open this URL in the browser where you sign in with Microsoft:\n${captureUrl.toString()}\n\nWaiting for operator session capture on ${returnTo}\n`);

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('operator_session_capture_timed_out')), timeoutMs);
  });

  try {
    const captured = await Promise.race([received, timeout]);
    const session = await verifyOperatorSession(workerUrl, captured.cookie, fetchImpl);
    return {
      schema: 'narada.cloudflare_carrier.operator_session_capture.v1',
      captured_at: new Date().toISOString(),
      worker_url: workerUrl,
      cookie: captured.cookie,
      principal: session.principal,
      captured_principal_id: captured.principal_id,
      captured_email: captured.email || null,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function verifyOperatorSession(workerUrl, cookie, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/auth/session', workerUrl), {
    headers: { cookie: `narada_operator_session=${cookie}` },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 200 || body?.ok === false) {
    const code = body?.code ?? `http_${response.status}`;
    const error = new Error(`operator_session_verify_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeOperatorSessionVerifyFailure(body);
    throw error;
  }
  if (body?.principal?.auth_type !== 'microsoft_oidc') {
    const code = `operator_session_verify_principal_not_microsoft:${body?.principal?.auth_type ?? 'unknown'}`;
    const error = new Error(code);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeOperatorSessionVerifyFailure(body);
    throw error;
  }
  return body;
}

export function summarizeOperatorSessionVerifyFailure(body = {}) {
  return {
    ok: body?.ok ?? false,
    code: body?.code ?? body?.error ?? null,
    auth_type: body?.principal?.auth_type ?? null,
    principal_id: body?.principal?.principal_id ?? null,
    email: body?.principal?.email ?? null,
  };
}

export function formatOperatorSessionCaptureError(error) {
  return JSON.stringify({
    ok: false,
    code: error?.message ?? String(error),
    http_status: error?.http_status,
    response: error?.response,
    summary: error?.summary,
  }, null, 2) + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseOperatorSessionCaptureArgs(process.argv.slice(2));
    const result = await captureOperatorSession(config);
    await writeFile(config.outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    process.stdout.write(JSON.stringify({ ok: true, out: config.outPath, principal: result.principal }, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(formatOperatorSessionCaptureError(error));
    process.exit(1);
  }
}
