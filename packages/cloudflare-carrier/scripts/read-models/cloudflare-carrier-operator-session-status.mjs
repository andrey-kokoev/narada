#!/usr/bin/env node
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { fileURLToPath } from 'node:url';

import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

export function parseOperatorSessionStatusArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = String(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '').replace(/\/+$/, '');
  const format = option(args, '--format') ?? 'json';
  if (!workerUrl) throw new Error('operator_session_status_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (format !== 'json' && format !== 'text') throw new Error(`operator_session_status_format_unsupported:${format}`);
  const auth = resolveAuth(args, env);
  if (!auth) throw new Error('operator_session_status_requires_auth');
  return { workerUrl, format, auth };
}

export async function readOperatorSessionStatus({ workerUrl, auth }, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/auth/session', workerUrl), {
    headers: {
      accept: 'application/json',
      ...authHeaders(auth),
    },
  });
  const body = await response.json().catch(() => ({}));
  return {
    schema: 'narada.cloudflare_carrier.operator_session_status.v1',
    ok: response.ok && body?.ok !== false,
    worker_url: workerUrl,
    auth_source: auth.source ?? null,
    auth_kind: auth.kind ?? null,
    http_status: response.status,
    code: body?.code ?? (response.ok ? null : `http_${response.status}`),
    principal: body?.principal ?? null,
    response: body,
  };
}

export function formatOperatorSessionStatus(result, format = 'json') {
  if (format === 'json') return `${JSON.stringify(result, null, 2)}\n`;
  const lines = [
    `Status: ${result.ok ? 'ok' : 'unauthorized'}`,
    `HTTP: ${result.http_status}`,
    `Auth: kind=${result.auth_kind ?? 'unknown'} source=${result.auth_source ?? 'unknown'}`,
  ];
  if (result.code) lines.push(`Code: ${result.code}`);
  if (result.principal) {
    lines.push(`Principal: ${result.principal.principal_id ?? 'unknown'}`);
    lines.push(`Auth Type: ${result.principal.auth_type ?? 'unknown'}`);
    if (result.principal.email) lines.push(`Email: ${result.principal.email}`);
    if (result.principal.name) lines.push(`Name: ${result.principal.name}`);
  }
  return `${lines.join('\n')}\n`;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseOperatorSessionStatusArgs(process.argv.slice(2));
    const result = await readOperatorSessionStatus(config);
    process.stdout.write(formatOperatorSessionStatus(result, config.format));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error) }, null, 2) + '\n');
    process.exit(1);
  }
}
