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

if (!workerUrl) throw new Error('mailbox_draft_reply_proposal_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('mailbox_draft_reply_proposal_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('mailbox_draft_reply_proposal_live_smoke_requires_site_id');
if (!accountRef) throw new Error('mailbox_draft_reply_proposal_live_smoke_requires_account_ref');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const proposalId = `mailbox_draft_reply_proposal_live_${suffix}`;
const generatedAt = new Date().toISOString();
const sourcePayload = {
  schema: 'narada.sonar.mailbox_draft_reply_proposal.v1',
  generated_at: generatedAt,
  operation_id: operationId,
  account_ref: accountRef,
  source_message_ref: option('--source-message') ?? `graph-message-live-smoke-${suffix}`,
  proposal_ref: `proposal:mailbox-draft-reply-live:${suffix}`,
  subject: option('--subject') ?? 'Re: live Cloudflare draft reply smoke',
  recipient_count: Number(option('--recipient-count') ?? 1),
  body_preview: option('--body-preview') ?? 'Live smoke proposal only. Outlook draft creation and send remain not admitted.',
  body_sha256: option('--body-sha256') ?? 'b'.repeat(64),
  rationale: option('--rationale') ?? 'prove Cloudflare can hold draft reply proposal authority without Outlook mutation',
  proposal_authority: 'cloudflare_carrier_site',
  mailbox_outlook_draft_create_admission: 'not_admitted',
  mailbox_send_admission: 'not_admitted',
  mailbox_mutation_admission: 'not_admitted',
  windows_draft_executor_fallback: 'available',
  proposal_posture: 'proposal_only_no_outlook_draft_create',
};

const refusedDraftCreate = await postCarrier({
  operation: 'mailbox.draft_reply_proposal.record',
  request_id: `mailbox_draft_reply_proposal_refused_draft_create_${suffix}`,
  params: {
    site_id: siteId,
    proposal_id: `${proposalId}_refused_draft_create`,
    source_payload: { ...sourcePayload, mailbox_outlook_draft_create_admission: 'admitted' },
  },
});
assert.equal(refusedDraftCreate.http_status, 400, JSON.stringify(refusedDraftCreate.body));
assert.equal(refusedDraftCreate.body.code, 'mailbox_draft_reply_proposal_draft_create_admission_invalid');

const refusedSend = await postCarrier({
  operation: 'mailbox.draft_reply_proposal.record',
  request_id: `mailbox_draft_reply_proposal_refused_send_${suffix}`,
  params: {
    site_id: siteId,
    proposal_id: `${proposalId}_refused_send`,
    source_payload: { ...sourcePayload, mailbox_send_admission: 'admitted' },
  },
});
assert.equal(refusedSend.http_status, 400, JSON.stringify(refusedSend.body));
assert.equal(refusedSend.body.code, 'mailbox_draft_reply_proposal_send_admission_invalid');

const recorded = await postCarrier({
  operation: 'mailbox.draft_reply_proposal.record',
  request_id: `mailbox_draft_reply_proposal_record_${suffix}`,
  params: { site_id: siteId, proposal_id: proposalId, source_payload: sourcePayload },
});
assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
assert.equal(recorded.body.status, 'recorded');
assert.equal(recorded.body.proposal_authority, 'cloudflare_carrier_site');
assert.equal(recorded.body.mailbox_outlook_draft_create_admission, 'not_admitted');
assert.equal(recorded.body.mailbox_send_admission, 'not_admitted');
assert.equal(recorded.body.mailbox_mutation_admission, 'not_admitted');

const listed = await postCarrier({
  operation: 'mailbox.draft_reply_proposal.list',
  request_id: `mailbox_draft_reply_proposal_list_${suffix}`,
  params: { site_id: siteId, mailbox_draft_reply_proposal_limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.ok(listed.body.proposals.some((entry) => entry.proposal_id === proposalId));
assert.equal(listed.body.proposal_authority, 'cloudflare_carrier_site');
assert.equal(listed.body.mailbox_outlook_draft_create_admission, 'not_admitted');
assert.equal(listed.body.mailbox_send_admission, 'not_admitted');
assert.equal(listed.body.mailbox_mutation_admission, 'not_admitted');
assert.equal(listed.body.authority_partition, 'mailbox_draft_reply_proposal_cloudflare_recorded_outlook_draft_send_and_mutation_not_admitted');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `mailbox_draft_reply_proposal_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, mailbox_draft_reply_proposal_limit: 20, mailbox_outlook_draft_create_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.ok(operationRead.body.mailbox_draft_reply_proposals.some((entry) => entry.proposal_id === proposalId));
const mailboxOutlookDraftCreates = operationRead.body.mailbox_outlook_draft_creates ?? [];
const productSurface = operationRead.body.operation_product_surface;
assert.ok(productSurface.mailbox_draft_reply_proposal_count >= 1);
const sendAcceptedCount = Number(productSurface.mailbox_send_accepted_count ?? 0);
const sendConfirmationCount = Number(productSurface.mailbox_send_confirmation_count ?? 0);
const expectedProductPartition = sendAcceptedCount > 0
  ? sendConfirmationCount > 0
    ? 'mailbox_draft_reply_proposal_cloudflare_recorded_send_and_confirmation_cloudflare_owned_outlook_draft_and_mutation_not_admitted'
    : 'mailbox_draft_reply_proposal_cloudflare_recorded_send_cloudflare_owned_confirmation_outlook_draft_and_mutation_not_admitted'
  : 'mailbox_draft_reply_proposal_cloudflare_recorded_outlook_draft_send_and_mutation_not_admitted';
assert.equal(productSurface.mailbox_draft_reply_proposal_authority, 'cloudflare_carrier_site');
assert.equal(productSurface.mailbox_outlook_draft_create_admission, mailboxOutlookDraftCreates.length > 0 ? 'admitted' : 'not_admitted');
assert.equal(productSurface.mailbox_send_admission, sendAcceptedCount > 0 ? 'admitted' : 'not_admitted');
assert.equal(productSurface.mailbox_mutation_admission, 'not_admitted');
assert.equal(productSurface.mailbox_draft_reply_authority_partition, expectedProductPartition);

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.mailbox_draft_reply_proposal_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  account_ref: accountRef,
  proposal_id: proposalId,
  proposal_authority: recorded.body.proposal_authority,
  mailbox_outlook_draft_create_admission: recorded.body.mailbox_outlook_draft_create_admission,
  mailbox_send_admission: recorded.body.mailbox_send_admission,
  mailbox_mutation_admission: recorded.body.mailbox_mutation_admission,
  mailbox_draft_reply_proposal_count: operationRead.body.operation_product_surface.mailbox_draft_reply_proposal_count,
  mailbox_outlook_draft_create_count: mailboxOutlookDraftCreates.length,
  operation_mailbox_outlook_draft_create_admission: operationRead.body.operation_product_surface.mailbox_outlook_draft_create_admission,
  mailbox_draft_reply_authority_partition: operationRead.body.operation_product_surface.mailbox_draft_reply_authority_partition,
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
  if (!existsSync(resolved)) throw new Error(`mailbox_draft_reply_proposal_live_smoke_token_file_missing:${resolved}`);
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
