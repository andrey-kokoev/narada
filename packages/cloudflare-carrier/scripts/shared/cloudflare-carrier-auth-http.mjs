import { readFileSync } from 'node:fs';

export function resolveAuth(args = [], env = process.env) {
  const token = option(args, '--token');
  if (token) return { kind: 'bearer', value: token, source: 'flag:--token' };

  const tokenFile = option(args, '--token-file');
  if (tokenFile) return { kind: 'bearer', value: readFileSync(tokenFile, 'utf8').trim(), source: 'token-file' };

  const cookie = option(args, '--operator-session-cookie');
  if (cookie) return { kind: 'operator_session', value: normalizeOperatorSessionCookie(cookie), source: 'operator-session-cookie' };

  const sessionFile = option(args, '--operator-session-file');
  if (sessionFile) return sessionFileAuth(sessionFile, 'operator-session-file');

  const envTokenFile = env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (envTokenFile) return { kind: 'bearer', value: readFileSync(envTokenFile, 'utf8').trim(), source: 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' };
  if (env.CLOUDFLARE_CARRIER_TOKEN) return { kind: 'bearer', value: env.CLOUDFLARE_CARRIER_TOKEN, source: 'env:CLOUDFLARE_CARRIER_TOKEN' };

  if (env.CLOUDFLARE_OPERATOR_SESSION_COOKIE) {
    return {
      kind: 'operator_session',
      value: normalizeOperatorSessionCookie(env.CLOUDFLARE_OPERATOR_SESSION_COOKIE),
      source: 'env:CLOUDFLARE_OPERATOR_SESSION_COOKIE',
    };
  }

  const envSessionFile = env.CLOUDFLARE_OPERATOR_SESSION_FILE ?? null;
  if (envSessionFile) return sessionFileAuth(envSessionFile, 'env:CLOUDFLARE_OPERATOR_SESSION_FILE');
  return null;
}

export function authHeaders(auth) {
  if (auth.kind === 'bearer') return { authorization: `Bearer ${auth.value}` };
  if (auth.kind === 'operator_session') return { cookie: `narada_operator_session=${auth.value}` };
  throw new Error(`product_read_auth_kind_unsupported:${auth.kind}`);
}

export async function requestCarrierJson(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: config.operation,
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  return { response, body: parseJsonText(text) };
}

export function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sessionFileAuth(path, source) {
  const session = parseJsonText(readFileSync(path, 'utf8'));
  if (!session?.cookie) throw new Error('product_read_operator_session_file_missing_cookie');
  return { kind: 'operator_session', value: normalizeOperatorSessionCookie(session.cookie), source };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeOperatorSessionCookie(value) {
  const text = String(value ?? '').trim();
  const match = /(?:^|;\s*)narada_operator_session=([^;]+)/.exec(text);
  return match ? match[1] : text;
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}
