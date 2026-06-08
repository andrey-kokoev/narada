#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { stderr, stdout } from 'node:process';

const CANONICAL_CLOUDFLARE_SITE_ID = 'site_narada_cloudflare';
const CANONICAL_CLOUDFLARE_SITE_DISPLAY_NAME = 'Narada Cloudflare Site';
const CANONICAL_CLOUDFLARE_SITE_REF = 'cloudflare://narada-cloudflare-carrier';

const args = process.argv.slice(2);
const repoRoot = new URL('..', import.meta.url);
const envPath = new URL('.env', repoRoot);
const require = createRequire(import.meta.url);

loadLocalEnv(envPath);

if (flag('--help') || flag('-h')) {
  printHelp();
  process.exit(0);
}

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const operatorCookieFile = option('--operator-cookie-file') ?? process.env.CLOUDFLARE_OPERATOR_COOKIE_FILE ?? '';
const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? CANONICAL_CLOUDFLARE_SITE_ID;
const displayName = option('--display-name') ?? CANONICAL_CLOUDFLARE_SITE_DISPLAY_NAME;
const siteRef = option('--site-ref') ?? CANONICAL_CLOUDFLARE_SITE_REF;
const ownerPrincipalId = option('--owner-principal-id') ?? await resolveOwnerPrincipalId();
const shouldWriteEnv = !flag('--no-write-env');

if (!workerUrl) fail('cloudflare_operator_site_bootstrap_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!tokenFile) fail('cloudflare_operator_site_bootstrap_requires_--token-file_or_CLOUDFLARE_CARRIER_TOKEN_FILE');
if (!ownerPrincipalId) fail('cloudflare_operator_site_bootstrap_requires_operator_cookie_or_--owner-principal-id');

const tokenStat = await readableFileStat(tokenFile);
if (!tokenStat.ok) fail('cloudflare_operator_site_bootstrap_token_file_unreadable', { token_file: tokenFile, error: tokenStat.error });
const bearerToken = (await readFile(tokenFile, 'utf8')).trim();
if (!bearerToken) fail('cloudflare_operator_site_bootstrap_token_file_empty', { token_file: tokenFile });

const siteCreate = await postCarrierWithBearer(workerUrl, bearerToken, {
  operation: 'site.create',
  request_id: `canonical_cloudflare_site_create_${Date.now()}`,
  params: {
    site_id: siteId,
    site_ref: siteRef,
    display_name: displayName,
  },
});
assert.equal(siteCreate.http_status, 200);
assert.equal(siteCreate.body.ok, true);

const membershipPut = await postCarrierWithBearer(workerUrl, bearerToken, {
  operation: 'site.membership.put',
  request_id: `canonical_cloudflare_site_owner_${Date.now()}`,
  params: {
    site_id: siteId,
    member_principal_id: ownerPrincipalId,
    role: 'owner',
    status: 'active',
  },
});
assert.equal(membershipPut.http_status, 200);
assert.equal(membershipPut.body.ok, true);

const read = await postCarrierWithBearer(workerUrl, bearerToken, {
  operation: 'site.read',
  request_id: `canonical_cloudflare_site_read_${Date.now()}`,
  params: { site_id: siteId },
});
assert.equal(read.http_status, 200);
assert.equal(read.body.ok, true);
assert.equal(read.body.site?.site_id, siteId);
assert.equal(read.body.memberships.some((membership) => (
  membership.principal_id === ownerPrincipalId
  && membership.role === 'owner'
  && membership.status === 'active'
)), true);

if (shouldWriteEnv) await upsertLocalEnv({ CLOUDFLARE_CARRIER_SITE_ID: siteId, CLOUDFLARE_CARRIER_SITE_REF: siteRef });

stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_operator_site_bootstrap.v1',
  status: 'ok',
  site_id: siteId,
  display_name: read.body.site.display_name,
  site_ref: read.body.site.site_ref,
  worker_url: workerUrl,
  owner_principal_id: ownerPrincipalId,
  env_file_updated: shouldWriteEnv,
  site_action: siteCreate.body.action,
  membership_action: membershipPut.body.action,
}, null, 2)}\n`);

async function resolveOwnerPrincipalId() {
  if (!operatorCookieFile) return null;
  const cookieStat = await readableFileStat(operatorCookieFile);
  if (!cookieStat.ok) fail('cloudflare_operator_site_bootstrap_cookie_file_unreadable', { operator_cookie_file: operatorCookieFile, error: cookieStat.error });
  const cookieHeader = normalizeCookieHeader(await readFile(operatorCookieFile, 'utf8'));
  if (!cookieHeader) fail('cloudflare_operator_site_bootstrap_cookie_file_empty', { operator_cookie_file: operatorCookieFile });
  const session = await getOperatorSession(workerUrl, cookieHeader);
  assert.equal(session.http_status, 200);
  assert.equal(session.body.ok, true);
  assert.equal(session.body.principal?.auth_type, 'microsoft_oidc');
  return session.body.principal.principal_id;
}

async function getOperatorSession(baseUrl, cookieHeader) {
  const response = await fetch(new URL('/auth/session', withTrailingSlash(baseUrl)), {
    headers: { cookie: cookieHeader },
  });
  return { http_status: response.status, body: await parseJsonResponse(response) };
}

async function postCarrierWithBearer(baseUrl, token, body) {
  const response = await fetch(new URL('/api/carrier', withTrailingSlash(baseUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await parseJsonResponse(response) };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function readableFileStat(path) {
  try {
    const info = await stat(path);
    return { ok: info.isFile(), size: info.size };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function upsertLocalEnv(entries) {
  const existing = existsSync(envPath) ? await readFile(envPath, 'utf8') : '';
  const lines = existing.split(/\r?\n/).filter((line, index, all) => index < all.length - 1 || line.length > 0);
  const keys = new Set(Object.keys(entries));
  const next = lines.map((line) => {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (!match || !keys.has(match[1])) return line;
    keys.delete(match[1]);
    return `${match[1]}=${entries[match[1]]}`;
  });
  for (const key of keys) next.push(`${key}=${entries[key]}`);
  await writeFile(envPath, `${next.join('\n')}\n`, 'utf8');
}

function normalizeCookieHeader(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (/^cookie\s*:/i.test(trimmed)) return trimmed.replace(/^cookie\s*:/i, '').trim();
  if (trimmed.includes('narada_operator_session=')) return trimmed.split(/\r?\n/).find((line) => line.includes('narada_operator_session='))?.trim() ?? '';
  return `narada_operator_session=${trimmed}`;
}

function loadLocalEnv(pathUrl) {
  if (!existsSync(pathUrl)) return;
  const text = require('node:fs').readFileSync(pathUrl, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = unquoteEnvValue(value);
  }
}

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function flag(name) {
  return args.includes(name);
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function fail(code, detail = {}) {
  stderr.write(`${JSON.stringify({ ok: false, code, ...detail }, null, 2)}\n`);
  process.exit(1);
}

function printHelp() {
  stdout.write(`Narada Cloudflare canonical Site bootstrap\n\nCommand:\n  pnpm cloudflare:operator:site:bootstrap\n\nDefaults:\n  site_id: ${CANONICAL_CLOUDFLARE_SITE_ID}\n  display_name: ${CANONICAL_CLOUDFLARE_SITE_DISPLAY_NAME}\n  site_ref: ${CANONICAL_CLOUDFLARE_SITE_REF}\n\nConfiguration:\n  --url <worker-url> or CLOUDFLARE_CARRIER_URL\n  --token-file <path> or CLOUDFLARE_CARRIER_TOKEN_FILE\n  --operator-cookie-file <path> or CLOUDFLARE_OPERATOR_COOKIE_FILE\n  --owner-principal-id <principal> when no operator cookie file is available\n  --no-write-env avoids updating CLOUDFLARE_CARRIER_SITE_ID in the ignored root .env file\n\nEffect:\n  Creates the canonical Cloudflare Narada Site if missing.\n  Ensures the Microsoft operator principal is owner / active.\n  Updates CLOUDFLARE_CARRIER_SITE_ID in the ignored root .env file unless --no-write-env is supplied.\n`);
}
