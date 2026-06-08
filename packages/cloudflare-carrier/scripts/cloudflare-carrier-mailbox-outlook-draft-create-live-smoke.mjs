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
const accountRef = option('--account') ?? process.env.CLOUDFLARE_MAILBOX_ACCOUNT_REF ?? 'help@global-maxima.com';
const toRecipient = option('--to') ?? process.env.CLOUDFLARE_MAILBOX_DRAFT_SMOKE_TO ?? accountRef;

if (!workerUrl) throw new Error('mailbox_outlook_draft_create_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('mailbox_outlook_draft_create_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('mailbox_outlook_draft_create_live_smoke_requires_site_id');
if (!accountRef) throw new Error('mailbox_outlook_draft_create_live_smoke_requires_account_ref');
if (!toRecipient) throw new Error('mailbox_outlook_draft_create_live_smoke_requires_to_recipient');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const draftCreateId = `mailbox_outlook_draft_create_live_${suffix}`;
const generatedAt = new Date().toISOString();
const sourcePayload = {
  schema: 'narada.sonar.mailbox_outlook_draft_create_request.v1',
  generated_at: generatedAt,
  operation_id: operationId,
  account_ref: accountRef,
  source_message_ref: option('--source-message') ?? `graph-message-draft-create-live-smoke-${suffix}`,
  proposal_id: option('--proposal-id') ?? `mailbox_draft_reply_proposal_live_${suffix}`,
  proposal_ref: option('--proposal-ref') ?? `proposal:mailbox-draft-create-live:${suffix}`,
  subject: option('--subject') ?? `Narada Cloudflare draft-create smoke ${suffix}`,
  to_recipients: [toRecipient],
  body_text: option('--body-text') ?? `Cloudflare draft-create live smoke ${suffix}. This draft is intentionally not sent.`,
  body_sha256: option('--body-sha256') ?? 'd'.repeat(64),
  mailbox_outlook_draft_create_admission: 'admitted',
  mailbox_send_admission: 'not_admitted',
  mailbox_mutation_admission: 'not_admitted',
  draft_create_posture: 'cloudflare_created_outlook_draft_send_not_admitted',
};

const refusedSend = await postCarrier({
  operation: 'mailbox.outlook_draft.create',
  request_id: `mailbox_outlook_draft_create_refused_send_${suffix}`,
  params: {
    site_id: siteId,
    draft_create_id: `${draftCreateId}_refused_send`,
    source_payload: { ...sourcePayload, mailbox_send_admission: 'admitted' },
  },
});
assert.equal(refusedSend.http_status, 400, JSON.stringify(refusedSend.body));
assert.equal(refusedSend.body.code, 'mailbox_outlook_draft_create_send_admission_invalid');

const created = await postCarrier({
  operation: 'mailbox.outlook_draft.create',
  request_id: `mailbox_outlook_draft_create_record_${suffix}`,
  params: { site_id: siteId, draft_create_id: draftCreateId, source_payload: sourcePayload },
});
assert.equal(created.http_status, 200, JSON.stringify(created.body));
assert.equal(created.body.status, 'created');
assert.equal(created.body.mailbox_outlook_draft_create_authority, 'cloudflare_graph_outlook_draft_create');
assert.equal(created.body.mailbox_outlook_draft_create_admission, 'admitted');
assert.equal(created.body.mailbox_send_admission, 'not_admitted');
assert.equal(created.body.mailbox_mutation_admission, 'not_admitted');
assert.ok(created.body.record?.outlook_draft_id, JSON.stringify(created.body));

const listed = await postCarrier({
  operation: 'mailbox.outlook_draft.list',
  request_id: `mailbox_outlook_draft_create_list_${suffix}`,
  params: { site_id: siteId, mailbox_outlook_draft_create_limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.ok(listed.body.drafts.some((entry) => entry.draft_create_id === draftCreateId));
assert.equal(listed.body.mailbox_outlook_draft_create_admission, 'admitted');
assert.equal(listed.body.mailbox_send_admission, 'not_admitted');
assert.equal(listed.body.mailbox_mutation_admission, 'not_admitted');
assert.equal(listed.body.authority_partition, 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `mailbox_outlook_draft_create_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, mailbox_outlook_draft_create_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.ok(operationRead.body.mailbox_outlook_draft_creates.some((entry) => entry.draft_create_id === draftCreateId));
assert.ok(operationRead.body.operation_product_surface.mailbox_outlook_draft_create_count >= 1);
assert.equal(operationRead.body.operation_product_surface.mailbox_outlook_draft_create_admission, 'admitted');
assert.equal(operationRead.body.operation_product_surface.mailbox_send_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.mailbox_mutation_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition, 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.mailbox_outlook_draft_create_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  account_ref: accountRef,
  draft_create_id: draftCreateId,
  outlook_draft_id: created.body.record.outlook_draft_id,
  mailbox_outlook_draft_create_authority: created.body.mailbox_outlook_draft_create_authority,
  mailbox_outlook_draft_create_admission: created.body.mailbox_outlook_draft_create_admission,
  mailbox_send_admission: created.body.mailbox_send_admission,
  mailbox_mutation_admission: created.body.mailbox_mutation_admission,
  mailbox_outlook_draft_create_count: operationRead.body.operation_product_surface.mailbox_outlook_draft_create_count,
  mailbox_outlook_draft_create_authority_partition: operationRead.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition,
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
  if (!existsSync(resolved)) throw new Error(`mailbox_outlook_draft_create_live_smoke_token_file_missing:${resolved}`);
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
