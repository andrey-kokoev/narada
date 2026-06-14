#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseMailboxStatusSourceLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true } = {},
) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_MAILBOX_STATUS_SOURCE_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const accountRef = option(args, '--account')
    ?? env.CLOUDFLARE_GRAPH_MAILBOX_ID
    ?? env.GRAPH_MAILBOX_ID
    ?? env.MAILBOX_ID
    ?? '';
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('mailbox_status_source_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`mailbox_status_source_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('mailbox_status_source_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('mailbox_status_source_live_smoke_requires_site_id');
  if (!accountRef) throw new Error('mailbox_status_source_live_smoke_requires_--account_or_GRAPH_MAILBOX_ID');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    accountRef,
  };
}

export function formatMailboxStatusSourceLiveSmokeText(result) {
  const lines = [
    `Mailbox Status Source Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Account: ${result.account_ref}`,
    `Read: ${result.read_id}`,
    `Authority: status=${result.mailbox_status_authority ?? 'unknown'} send=${result.mailbox_send_admission ?? 'unknown'} mutation=${result.mailbox_mutation_admission ?? 'unknown'}`,
    `Counts: source_reads=${result.mailbox_status_source_read_count ?? 0} partition=${result.mailbox_authority_partition ?? 'unknown'}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runMailboxStatusSourceLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const readId = `mailbox_status_source_live_${suffix}`;

  const missingAccount = await postCarrier(config, {
    operation: 'mailbox.status_source.read',
    request_id: `mailbox_status_source_missing_account_${suffix}`,
    params: { site_id: config.siteId, account_ref: '', read_id: `${readId}_missing_account` },
  }, fetchImpl);
  assert.equal(missingAccount.http_status, 400, JSON.stringify(missingAccount.body));
  assert.equal(missingAccount.body.code, 'mailbox_account_ref_missing');

  const recorded = await postCarrier(config, {
    operation: 'mailbox.status_source.read',
    request_id: `mailbox_status_source_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, account_ref: config.accountRef, read_id: readId },
  }, fetchImpl);
  assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
  assert.equal(recorded.body.status, 'recorded');
  assert.equal(recorded.body.schema, 'narada.sonar.cloudflare_mailbox_status_source_read.v1');
  assert.equal(recorded.body.mailbox_status_authority, 'cloudflare_graph_mailbox_status_source');
  assert.equal(recorded.body.mailbox_send_admission, 'not_admitted');
  assert.equal(recorded.body.mailbox_mutation_admission, 'not_admitted');
  assert.equal(recorded.body.read?.source_locus, 'cloudflare_carrier_site');
  assert.equal(recorded.body.read?.source_adapter, 'microsoft_graph_mailbox_status');
  assert.equal(recorded.body.read?.read_id, readId);
  assert.equal(recorded.body.read?.account_ref, config.accountRef);
  assert.ok(Number.isInteger(recorded.body.read?.unread_count));
  assert.ok(Number.isInteger(recorded.body.read?.pending_draft_count));

  const listed = await postCarrier(config, {
    operation: 'mailbox.status_source.list',
    request_id: `mailbox_status_source_list_${suffix}`,
    params: { site_id: config.siteId, mailbox_status_source_limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.mailbox_status_authority, 'cloudflare_graph_mailbox_status_source');
  assert.equal(listed.body.mailbox_send_admission, 'not_admitted');
  assert.equal(listed.body.mailbox_mutation_admission, 'not_admitted');
  assert.ok(listed.body.reads.some((entry) => entry.read_id === readId));

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `mailbox_status_source_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, mailbox_status_source_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.ok(operationRead.body.mailbox_status_source_reads.some((entry) => entry.read_id === readId));
  const productSurface = operationRead.body.operation_product_surface;
  assert.ok(productSurface.mailbox_status_source_read_count >= 1);
  const sendAcceptedCount = Number(productSurface.mailbox_send_accepted_count ?? 0);
  const sendConfirmationCount = Number(productSurface.mailbox_send_confirmation_count ?? 0);
  const expectedProductPartition = sendAcceptedCount > 0
    ? sendConfirmationCount > 0
      ? 'mailbox_status_source_read_send_and_confirmation_cloudflare_owned_mutation_not_admitted'
      : 'mailbox_status_source_read_and_send_cloudflare_owned_confirmation_and_mutation_not_admitted'
    : 'mailbox_status_source_read_cloudflare_owned_send_and_mutation_not_admitted';
  assert.equal(productSurface.mailbox_status_authority, 'cloudflare_graph_mailbox_status_source');
  assert.equal(productSurface.mailbox_send_admission, sendAcceptedCount > 0 ? 'admitted' : 'not_admitted');
  assert.equal(productSurface.mailbox_mutation_admission, 'not_admitted');
  assert.equal(productSurface.mailbox_authority_partition, expectedProductPartition);

  return {
    schema: 'narada.cloudflare_carrier.mailbox_status_source_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    account_ref: config.accountRef,
    read_id: readId,
    mailbox_status_authority: recorded.body.mailbox_status_authority,
    mailbox_send_admission: recorded.body.mailbox_send_admission,
    mailbox_mutation_admission: recorded.body.mailbox_mutation_admission,
    mailbox_status_source_read_count: operationRead.body.operation_product_surface.mailbox_status_source_read_count,
    mailbox_authority_partition: operationRead.body.operation_product_surface.mailbox_authority_partition,
  };
}

async function postCarrier(config, body, fetchImpl) {
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: { ...authHeaders(config.auth), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function resolveBearerFromEnv(args, env) {
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (tokenFile) return { kind: 'bearer', value: readTokenFile(tokenFile), source: tokenFile === env.CLOUDFLARE_CARRIER_TOKEN_FILE ? 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' : 'token-file' };
  const token = option(args, '--token') ?? env.CLOUDFLARE_CARRIER_TOKEN ?? null;
  if (token) return { kind: 'bearer', value: token, source: option(args, '--token') ? 'flag:--token' : 'env:CLOUDFLARE_CARRIER_TOKEN' };
  return null;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`mailbox_status_source_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath, env = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!env[key]) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseMailboxStatusSourceLiveSmokeArgs(process.argv.slice(2));
  const result = await runMailboxStatusSourceLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatMailboxStatusSourceLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
