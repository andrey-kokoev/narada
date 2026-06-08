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
const accountRef = option('--account') ?? 'mailbox:sonar-operator';

if (!workerUrl) throw new Error('mailbox_status_shadow_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('mailbox_status_shadow_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('mailbox_status_shadow_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const readId = `mailbox_status_shadow_live_${suffix}`;
const generatedAt = new Date().toISOString();
const sourcePayload = {
  schema: 'narada.sonar.mailbox_status_shadow_read.v1',
  generated_at: generatedAt,
  authority_locus: 'windows_local_site',
  shadow_target_locus: 'cloudflare_carrier_site',
  account_ref: accountRef,
  mailbox_status: option('--status') ?? 'observed',
  unread_count: Number(option('--unread-count') ?? 0),
  pending_draft_count: Number(option('--pending-draft-count') ?? 0),
  pending_send_count: Number(option('--pending-send-count') ?? 0),
  latest_message_at: option('--latest-message-at') ?? null,
  ticket_count: Number(option('--ticket-count') ?? 0),
  sync_state: option('--sync-state') ?? 'manual_live_smoke',
  mailbox_read_authority: 'windows_mailbox_status_source',
  mailbox_write_authority: 'windows_mailbox_mcp',
  mailbox_send_admission: 'not_admitted',
  mailbox_mutation_admission: 'not_admitted',
  shadow_read_posture: 'read_only_status_projection',
};

const refusedSend = await postCarrier({
  operation: 'mailbox.status_shadow.record',
  request_id: `mailbox_status_shadow_refused_send_${suffix}`,
  params: {
    site_id: siteId,
    read_id: `${readId}_refused_send`,
    source_payload: { ...sourcePayload, mailbox_send_admission: 'admitted' },
  },
});
assert.equal(refusedSend.http_status, 400, JSON.stringify(refusedSend.body));
assert.equal(refusedSend.body.code, 'mailbox_status_shadow_read_send_admission_invalid');

const recorded = await postCarrier({
  operation: 'mailbox.status_shadow.record',
  request_id: `mailbox_status_shadow_record_${suffix}`,
  params: { site_id: siteId, read_id: readId, source_payload: sourcePayload },
});
assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
assert.equal(recorded.body.status, 'recorded');
assert.equal(recorded.body.mailbox_status_authority, 'windows_mailbox_status_source');
assert.equal(recorded.body.mailbox_write_authority, 'windows_mailbox_mcp');
assert.equal(recorded.body.mailbox_send_admission, 'not_admitted');
assert.equal(recorded.body.mailbox_mutation_admission, 'not_admitted');

const listed = await postCarrier({
  operation: 'mailbox.status_shadow.list',
  request_id: `mailbox_status_shadow_list_${suffix}`,
  params: { site_id: siteId, mailbox_status_shadow_limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.ok(listed.body.reads.some((entry) => entry.read_id === readId));
assert.equal(listed.body.mailbox_send_admission, 'not_admitted');
assert.equal(listed.body.mailbox_mutation_admission, 'not_admitted');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `mailbox_status_shadow_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, mailbox_status_shadow_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.ok(operationRead.body.mailbox_status_shadow_reads.some((entry) => entry.read_id === readId));
assert.ok(operationRead.body.operation_product_surface.mailbox_status_shadow_read_count >= 1);
assert.equal(operationRead.body.operation_product_surface.mailbox_status_authority, 'windows_mailbox_status_source');
assert.equal(operationRead.body.operation_product_surface.mailbox_shadow_target_locus, 'cloudflare_carrier_site');
assert.equal(operationRead.body.operation_product_surface.mailbox_send_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.mailbox_mutation_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.mailbox_authority_partition, 'mailbox_status_shadow_read_cloudflare_recorded_send_and_mutation_windows_owned');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.mailbox_status_shadow_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  read_id: readId,
  account_ref: accountRef,
  mailbox_status_authority: recorded.body.mailbox_status_authority,
  mailbox_write_authority: recorded.body.mailbox_write_authority,
  mailbox_send_admission: recorded.body.mailbox_send_admission,
  mailbox_mutation_admission: recorded.body.mailbox_mutation_admission,
  mailbox_status_shadow_read_count: operationRead.body.operation_product_surface.mailbox_status_shadow_read_count,
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
  if (!existsSync(resolved)) throw new Error(`mailbox_status_shadow_live_smoke_token_file_missing:${resolved}`);
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
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}
