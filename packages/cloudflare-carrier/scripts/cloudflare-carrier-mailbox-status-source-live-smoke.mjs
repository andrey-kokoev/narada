#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
loadLocalEnv(join(repoRoot, '.env'));

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const bearerToken = option('--token') ?? (tokenFile ? readTokenFile(tokenFile) : process.env.CLOUDFLARE_CARRIER_TOKEN ?? '');
const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
const accountRef = option('--account') ?? process.env.CLOUDFLARE_GRAPH_MAILBOX_ID ?? process.env.GRAPH_MAILBOX_ID ?? process.env.MAILBOX_ID ?? '';

if (!workerUrl) throw new Error('mailbox_status_source_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('mailbox_status_source_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('mailbox_status_source_live_smoke_requires_site_id');
if (!accountRef) throw new Error('mailbox_status_source_live_smoke_requires_--account_or_GRAPH_MAILBOX_ID');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const readId = `mailbox_status_source_live_${suffix}`;

const missingAccount = await postCarrier({
  operation: 'mailbox.status_source.read',
  request_id: `mailbox_status_source_missing_account_${suffix}`,
  params: { site_id: siteId, account_ref: '', read_id: `${readId}_missing_account` },
});
assert.equal(missingAccount.http_status, 400, JSON.stringify(missingAccount.body));
assert.equal(missingAccount.body.code, 'mailbox_account_ref_missing');

const recorded = await postCarrier({
  operation: 'mailbox.status_source.read',
  request_id: `mailbox_status_source_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, account_ref: accountRef, read_id: readId },
});
assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
assert.equal(recorded.body.status, 'recorded');
assert.equal(recorded.body.schema, 'narada.sonar.cloudflare_mailbox_status_source_read.v1');
assert.equal(recorded.body.mailbox_status_authority, 'cloudflare_graph_mailbox_status_source');
assert.equal(recorded.body.mailbox_send_admission, 'not_admitted');
assert.equal(recorded.body.mailbox_mutation_admission, 'not_admitted');
assert.equal(recorded.body.read?.source_locus, 'cloudflare_carrier_site');
assert.equal(recorded.body.read?.source_adapter, 'microsoft_graph_mailbox_status');
assert.equal(recorded.body.read?.read_id, readId);
assert.equal(recorded.body.read?.account_ref, accountRef);
assert.ok(Number.isInteger(recorded.body.read?.unread_count));
assert.ok(Number.isInteger(recorded.body.read?.pending_draft_count));

const listed = await postCarrier({
  operation: 'mailbox.status_source.list',
  request_id: `mailbox_status_source_list_${suffix}`,
  params: { site_id: siteId, mailbox_status_source_limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.equal(listed.body.mailbox_status_authority, 'cloudflare_graph_mailbox_status_source');
assert.equal(listed.body.mailbox_send_admission, 'not_admitted');
assert.equal(listed.body.mailbox_mutation_admission, 'not_admitted');
assert.ok(listed.body.reads.some((entry) => entry.read_id === readId));

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `mailbox_status_source_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, mailbox_status_source_limit: 20 },
});
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

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.mailbox_status_source_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  read_id: readId,
  mailbox_status_authority: recorded.body.mailbox_status_authority,
  mailbox_send_admission: recorded.body.mailbox_send_admission,
  mailbox_mutation_admission: recorded.body.mailbox_mutation_admission,
  mailbox_status_source_read_count: operationRead.body.operation_product_surface.mailbox_status_source_read_count,
  mailbox_authority_partition: operationRead.body.operation_product_surface.mailbox_authority_partition,
}, null, 2)}\n`);

async function postCarrier(body) {
  const response = await fetch(`${workerUrl}/api/carrier`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`mailbox_status_source_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}
