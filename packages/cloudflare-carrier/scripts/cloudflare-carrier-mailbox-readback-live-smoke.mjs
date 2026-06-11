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

if (!workerUrl) throw new Error('mailbox_readback_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('mailbox_readback_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('mailbox_readback_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const acceptedList = await postCarrier({
  operation: 'mailbox.send_accepted.list',
  request_id: `mailbox_readback_send_accepted_list_${suffix}`,
  params: { site_id: siteId, mailbox_send_accepted_limit: 20 },
});
assert.equal(acceptedList.http_status, 200, JSON.stringify(acceptedList.body));
assert.equal(acceptedList.body.schema, 'narada.sonar.cloudflare_mailbox_send_accepted.v1');
assert.equal(Array.isArray(acceptedList.body.sends), true);
assert.equal(acceptedList.body.mailbox_mutation_admission, 'not_admitted');

const confirmationList = await postCarrier({
  operation: 'mailbox.send_confirmation.list',
  request_id: `mailbox_readback_send_confirmation_list_${suffix}`,
  params: { site_id: siteId, mailbox_send_confirmation_limit: 20 },
});
assert.equal(confirmationList.http_status, 200, JSON.stringify(confirmationList.body));
assert.equal(confirmationList.body.schema, 'narada.sonar.cloudflare_mailbox_send_confirmation.v1');
assert.equal(Array.isArray(confirmationList.body.confirmations), true);
assert.equal(confirmationList.body.mailbox_mutation_admission, 'not_admitted');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `mailbox_readback_operation_read_${suffix}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    mailbox_send_accepted_limit: 20,
    mailbox_send_confirmation_limit: 20,
  },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(Array.isArray(operationRead.body.mailbox_send_accepted_records), true);
assert.equal(Array.isArray(operationRead.body.mailbox_send_confirmations), true);
assert.equal(typeof operationRead.body.operation_product_surface?.mailbox_status_source_read_count, 'number');
assert.equal(typeof operationRead.body.operation_product_surface?.mailbox_send_accepted_count, 'number');
assert.equal(typeof operationRead.body.operation_product_surface?.mailbox_send_confirmation_count, 'number');
if (operationRead.body.operation_product_surface.mailbox_status_source_read_count > 0) {
  assert.equal(operationRead.body.operation_product_surface.mailbox_status_authority, 'cloudflare_graph_mailbox_status_source');
  assert.equal(operationRead.body.operation_product_surface.mailbox_authority_partition.startsWith('mailbox_status_source_read'), true);
}
assert.equal(operationRead.body.operation_product_surface.mailbox_mutation_admission, 'not_admitted');
assert.ok(operationRead.body.authority_transfer_posture, 'missing authority transfer posture');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.mailbox_readback_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  mailbox_status_source_read_count: operationRead.body.operation_product_surface.mailbox_status_source_read_count,
  mailbox_status_authority: operationRead.body.operation_product_surface.mailbox_status_authority,
  mailbox_authority_partition: operationRead.body.operation_product_surface.mailbox_authority_partition,
  mailbox_send_accepted_count: operationRead.body.operation_product_surface.mailbox_send_accepted_count,
  mailbox_send_confirmation_count: operationRead.body.operation_product_surface.mailbox_send_confirmation_count,
  mailbox_send_admission: operationRead.body.operation_product_surface.mailbox_send_admission,
  mailbox_send_delivery_confirmation_admission: operationRead.body.operation_product_surface.mailbox_send_delivery_confirmation_admission,
  mailbox_mutation_admission: operationRead.body.operation_product_surface.mailbox_mutation_admission,
  remaining_windows_domains: operationRead.body.authority_transfer_posture.remaining_windows_domains,
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
  if (!existsSync(resolved)) throw new Error(`mailbox_readback_live_smoke_token_file_missing:${resolved}`);
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
