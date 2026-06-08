#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { stderr, stdout } from 'node:process';

const CANONICAL_CLOUDFLARE_SITE_ID = 'site_narada_cloudflare';
const CANONICAL_CLOUDFLARE_SITE_DISPLAY_NAME = 'Narada Cloudflare Site';
const CANONICAL_CLOUDFLARE_SITE_REF = 'cloudflare://narada-cloudflare-carrier';
const CANONICAL_CLOUDFLARE_OPERATION_ID = 'operation_narada_cloudflare_control';
const CANONICAL_CLOUDFLARE_OPERATION_DISPLAY_NAME = 'Narada Cloudflare Control Operation';
const CANONICAL_CLOUDFLARE_OPERATION_KIND = 'control';

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
const siteDisplayName = option('--site-display-name') ?? CANONICAL_CLOUDFLARE_SITE_DISPLAY_NAME;
const siteRef = option('--site-ref') ?? process.env.CLOUDFLARE_CARRIER_SITE_REF ?? CANONICAL_CLOUDFLARE_SITE_REF;
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? CANONICAL_CLOUDFLARE_OPERATION_ID;
const operationDisplayName = option('--operation-display-name') ?? CANONICAL_CLOUDFLARE_OPERATION_DISPLAY_NAME;
const operationKind = option('--operation-kind') ?? CANONICAL_CLOUDFLARE_OPERATION_KIND;
const ownerPrincipalId = option('--owner-principal-id') ?? await resolveOwnerPrincipalId();
const shouldWriteEnv = !flag('--no-write-env');

if (!workerUrl) fail('cloudflare_operator_operation_bootstrap_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!tokenFile) fail('cloudflare_operator_operation_bootstrap_requires_--token-file_or_CLOUDFLARE_CARRIER_TOKEN_FILE');
if (!ownerPrincipalId) fail('cloudflare_operator_operation_bootstrap_requires_operator_cookie_or_--owner-principal-id');

const tokenStat = await readableFileStat(tokenFile);
if (!tokenStat.ok) fail('cloudflare_operator_operation_bootstrap_token_file_unreadable', { token_file: tokenFile, error: tokenStat.error });
const bearerToken = (await readFile(tokenFile, 'utf8')).trim();
if (!bearerToken) fail('cloudflare_operator_operation_bootstrap_token_file_empty', { token_file: tokenFile });

const siteCreate = await postCarrierWithBearer(workerUrl, bearerToken, {
  operation: 'site.create',
  request_id: `canonical_cloudflare_site_create_${Date.now()}`,
  params: { site_id: siteId, site_ref: siteRef, display_name: siteDisplayName },
});
assert.equal(siteCreate.http_status, 200);
assert.equal(siteCreate.body.ok, true);

const membershipPut = await postCarrierWithBearer(workerUrl, bearerToken, {
  operation: 'site.membership.put',
  request_id: `canonical_cloudflare_site_owner_${Date.now()}`,
  params: { site_id: siteId, member_principal_id: ownerPrincipalId, role: 'owner', status: 'active' },
});
assert.equal(membershipPut.http_status, 200);
assert.equal(membershipPut.body.ok, true);

const operationCreate = await postCarrierWithBearer(workerUrl, bearerToken, {
  operation: 'operation.create',
  request_id: `canonical_cloudflare_operation_create_${Date.now()}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    display_name: operationDisplayName,
    operation_kind: operationKind,
    status: 'active',
  },
});
assert.equal(operationCreate.http_status, 200);
assert.equal(operationCreate.body.ok, true);

const operationRead = await postCarrierWithBearer(workerUrl, bearerToken, {
  operation: 'operation.read',
  request_id: `canonical_cloudflare_operation_read_${Date.now()}`,
  params: { site_id: siteId, operation_id: operationId },
});
assert.equal(operationRead.http_status, 200);
assert.equal(operationRead.body.ok, true);
assert.equal(operationRead.body.operation?.operation_id, operationId);
assert.equal(operationRead.body.operation?.site_id, siteId);
assert.equal(operationRead.body.operation?.status, 'active');

if (shouldWriteEnv) await upsertLocalEnv({
  CLOUDFLARE_CARRIER_SITE_ID: siteId,
  CLOUDFLARE_CARRIER_SITE_REF: siteRef,
  CLOUDFLARE_CARRIER_OPERATION_ID: operationId,
});

stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_operator_operation_bootstrap.v1',
  status: 'ok',
  site_id: siteId,
  site_ref: siteRef,
  operation_id: operationId,
  operation_kind: operationRead.body.operation.operation_kind,
  operation_status: operationRead.body.operation.status,
  display_name: operationRead.body.operation.display_name,
  worker_url: workerUrl,
  owner_principal_id: ownerPrincipalId,
  env_file_updated: shouldWriteEnv,
  site_action: siteCreate.body.action,
  membership_action: membershipPut.body.action,
  operation_action: operationCreate.body.action,
}, null, 2)}\n`);

async function resolveOwnerPrincipalId() {
  if (!operatorCookieFile) return null;
  const cookieStat = await readableFileStat(operatorCookieFile);
  if (!cookieStat.ok) fail('cloudflare_operator_operation_bootstrap_cookie_file_unreadable', { operator_cookie_file: operatorCookieFile, error: cookieStat.error });
  const cookieHeader = normalizeCookieHeader(await readFile(operatorCookieFile, 'utf8'));
  if (!cookieHeader) fail('cloudflare_operator_operation_bootstrap_cookie_file_empty', { operator_cookie_file: operatorCookieFile });
  const session = await getOperatorSession(workerUrl, cookieHeader);
  assert.equal(session.http_status, 200);
  assert.equal(session.body.ok, true);
  assert.equal(session.body.principal?.auth_type, 'microsoft_oidc');
  return session.body.principal.principal_id;
}

async function getOperatorSession(baseUrl, cookieHeader) {
  const response = await fetch(new URL('/auth/session', withTrailingSlash(baseUrl)), { headers: { cookie: cookieHeader } });
  return { http_status: response.status, body: await parseJsonResponse(response) };
}

async function postCarrierWithBearer(baseUrl, token, body) {
  const response = await fetch(new URL('/api/carrier', withTrailingSlash(baseUrl)), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
  stdout.write(`Narada Cloudflare canonical Operation bootstrap\n\nCommand:\n  pnpm cloudflare:operator:operation:bootstrap\n\nDefaults:\n  site_id: ${CANONICAL_CLOUDFLARE_SITE_ID}\n  site_ref: ${CANONICAL_CLOUDFLARE_SITE_REF}\n  operation_id: ${CANONICAL_CLOUDFLARE_OPERATION_ID}\n  operation_kind: ${CANONICAL_CLOUDFLARE_OPERATION_KIND}\n\nConfiguration:\n  --url <worker-url> or CLOUDFLARE_CARRIER_URL\n  --token-file <path> or CLOUDFLARE_CARRIER_TOKEN_FILE\n  --operator-cookie-file <path> or CLOUDFLARE_OPERATOR_COOKIE_FILE\n  --owner-principal-id <principal> when no operator cookie file is available\n  --operation <operation_id> or CLOUDFLARE_CARRIER_OPERATION_ID\n  --no-write-env avoids updating CLOUDFLARE_CARRIER_OPERATION_ID in the ignored root .env file\n\nEffect:\n  Ensures the canonical Cloudflare Site exists.\n  Ensures the Microsoft operator principal is owner / active.\n  Creates or updates the canonical Cloudflare control Operation.\n  Emits readiness JSON without printing token or cookie material.\n`);
}
