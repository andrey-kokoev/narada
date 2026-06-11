#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
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
const toRecipient = option('--to') ?? process.env.CLOUDFLARE_MAILBOX_SEND_SMOKE_TO ?? process.env.CLOUDFLARE_MAILBOX_DRAFT_SMOKE_TO ?? accountRef;
const confirmationDelayMs = Number(option('--confirmation-delay-ms') ?? process.env.CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_DELAY_MS ?? 5000);
const confirmationAttempts = Number(option('--confirmation-attempts') ?? process.env.CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_ATTEMPTS ?? 5);

if (!workerUrl) throw new Error('mailbox_send_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('mailbox_send_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('mailbox_send_live_smoke_requires_site_id');
if (!accountRef) throw new Error('mailbox_send_live_smoke_requires_account_ref');
if (!toRecipient) throw new Error('mailbox_send_live_smoke_requires_to_recipient');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const draftCreateId = `mailbox_send_live_draft_create_${suffix}`;
const sendAcceptedId = `mailbox_send_accepted_live_${suffix}`;
const sendConfirmationId = `mailbox_send_confirmation_live_${suffix}`;
const generatedAt = new Date().toISOString();
const subject = option('--subject') ?? `Narada Cloudflare send smoke ${suffix}`;
const bodyText = option('--body-text') ?? `Cloudflare mailbox send live smoke ${suffix}. This message verifies bounded send authority transfer.`;

const draftSourcePayload = {
  schema: 'narada.sonar.mailbox_outlook_draft_create_request.v1',
  generated_at: generatedAt,
  operation_id: operationId,
  account_ref: accountRef,
  source_message_ref: option('--source-message') ?? `graph-message-send-live-smoke-${suffix}`,
  proposal_id: option('--proposal-id') ?? `mailbox_send_live_proposal_${suffix}`,
  proposal_ref: option('--proposal-ref') ?? `proposal:mailbox-send-live:${suffix}`,
  subject,
  to_recipients: [toRecipient],
  body_text: bodyText,
  body_sha256: option('--body-sha256') ?? sha256Hex(bodyText),
  mailbox_outlook_draft_create_admission: 'admitted',
  mailbox_send_admission: 'not_admitted',
  mailbox_mutation_admission: 'not_admitted',
  draft_create_posture: 'cloudflare_created_outlook_draft_send_not_admitted',
};

const created = await postCarrier({
  operation: 'mailbox.outlook_draft.create',
  request_id: `mailbox_send_draft_create_${suffix}`,
  params: { site_id: siteId, draft_create_id: draftCreateId, source_payload: draftSourcePayload },
});
assert.equal(created.http_status, 200, JSON.stringify(created.body));
assert.equal(created.body.status, 'created');
assert.equal(created.body.mailbox_outlook_draft_create_authority, 'cloudflare_graph_outlook_draft_create');
assert.equal(created.body.mailbox_outlook_draft_create_admission, 'admitted');
assert.equal(created.body.mailbox_send_admission, 'not_admitted');
assert.equal(created.body.mailbox_mutation_admission, 'not_admitted');
assert.ok(created.body.record?.outlook_draft_id, JSON.stringify(created.body));

const outlookDraftId = created.body.record.outlook_draft_id;
const sendSourcePayload = {
  schema: 'narada.sonar.mailbox_send_request.v1',
  generated_at: new Date().toISOString(),
  operation_id: operationId,
  account_ref: accountRef,
  outlook_draft_id: outlookDraftId,
  draft_create_id: draftCreateId,
  proposal_id: draftSourcePayload.proposal_id,
  source_message_ref: draftSourcePayload.source_message_ref,
  mailbox_send_admission: 'admitted',
  mailbox_mutation_admission: 'not_admitted',
  cutover_point_ref: option('--send-cutover-ref') ?? `cutover:mailbox-send:cloudflare-live:${suffix}`,
  governed_write_contract_ref: option('--send-contract-ref') ?? 'contract:graph-draft-send:v1',
  confirmation_evidence_ref: option('--send-evidence-ref') ?? `evidence:graph-send-accepted:cloudflare-live:${suffix}`,
};

const refusedSendWithoutCutover = await postCarrier({
  operation: 'mailbox.outlook_draft.send',
  request_id: `mailbox_send_refused_missing_cutover_${suffix}`,
  params: {
    site_id: siteId,
    send_accepted_id: `${sendAcceptedId}_refused_missing_cutover`,
    source_payload: { ...sendSourcePayload, cutover_point_ref: '' },
  },
});
assert.equal(refusedSendWithoutCutover.http_status, 403, JSON.stringify(refusedSendWithoutCutover.body));
assert.equal(refusedSendWithoutCutover.body.code, 'mailbox_send_requires_cutover_point_ref');

const sent = await postCarrier({
  operation: 'mailbox.outlook_draft.send',
  request_id: `mailbox_send_accept_${suffix}`,
  params: { site_id: siteId, send_accepted_id: sendAcceptedId, source_payload: sendSourcePayload },
});
assert.equal(sent.http_status, 200, JSON.stringify(sent.body));
assert.equal(sent.body.schema, 'narada.sonar.cloudflare_mailbox_send_accepted.v1');
assert.equal(sent.body.status, 'accepted');
assert.equal(sent.body.mailbox_send_authority, 'cloudflare_graph_mailbox_send');
assert.equal(sent.body.mailbox_send_admission, 'admitted');
assert.equal(sent.body.mailbox_mutation_admission, 'not_admitted');
assert.equal(sent.body.delivery_confirmation_admission, 'not_admitted');
assert.equal(sent.body.record?.send_accepted_id, sendAcceptedId);

const sendListed = await postCarrier({
  operation: 'mailbox.send_accepted.list',
  request_id: `mailbox_send_accepted_list_${suffix}`,
  params: { site_id: siteId, mailbox_send_accepted_limit: 20 },
});
assert.equal(sendListed.http_status, 200, JSON.stringify(sendListed.body));
assert.equal(sendListed.body.mailbox_send_authority, 'cloudflare_graph_mailbox_send');
assert.equal(sendListed.body.mailbox_send_admission, 'admitted');
assert.equal(sendListed.body.mailbox_mutation_admission, 'not_admitted');
assert.equal(sendListed.body.delivery_confirmation_admission, 'not_admitted');
assert.equal(sendListed.body.authority_partition, 'mailbox_send_cloudflare_owned_delivery_not_confirmed_other_mutation_not_admitted');
assert.ok(sendListed.body.sends.some((entry) => entry.send_accepted_id === sendAcceptedId));

const operationReadAfterSend = await postCarrier({
  operation: 'operation.read',
  request_id: `mailbox_send_operation_read_after_send_${suffix}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    mailbox_outlook_draft_create_limit: 20,
    mailbox_send_accepted_limit: 20,
    mailbox_send_confirmation_limit: 20,
  },
});
assert.equal(operationReadAfterSend.http_status, 200, JSON.stringify(operationReadAfterSend.body));
assert.ok(operationReadAfterSend.body.mailbox_send_accepted_records.some((entry) => entry.send_accepted_id === sendAcceptedId));
assert.ok(operationReadAfterSend.body.operation_product_surface.mailbox_send_accepted_count >= 1);
assert.equal(operationReadAfterSend.body.operation_product_surface.mailbox_send_authority, 'cloudflare_graph_mailbox_send');
assert.equal(operationReadAfterSend.body.operation_product_surface.mailbox_send_admission, 'admitted');
assert.equal(operationReadAfterSend.body.operation_product_surface.mailbox_send_delivery_confirmation_admission, 'not_admitted');
assert.equal(operationReadAfterSend.body.operation_product_surface.mailbox_mutation_admission, 'not_admitted');
assert.equal(operationReadAfterSend.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition, 'mailbox_outlook_draft_create_and_send_cloudflare_owned_confirmation_and_other_mutation_not_admitted');

if (confirmationDelayMs > 0) await delay(confirmationDelayMs);
const sentMessageRef = option('--sent-message') ?? process.env.CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_MESSAGE_REF ?? outlookDraftId;
const confirmationPayload = {
  schema: 'narada.sonar.mailbox_send_confirmation_read_request.v1',
  generated_at: new Date().toISOString(),
  operation_id: operationId,
  send_accepted_id: sendAcceptedId,
  account_ref: accountRef,
  outlook_draft_id: outlookDraftId,
  sent_message_ref: sentMessageRef,
  sent_subject: subject,
  delivery_confirmation_admission: 'admitted',
  mailbox_mutation_admission: 'not_admitted',
  cutover_point_ref: option('--confirmation-cutover-ref') ?? `cutover:mailbox-send-confirmation:cloudflare-live:${suffix}`,
  governed_write_contract_ref: option('--confirmation-contract-ref') ?? 'contract:graph-sent-message-read:v1',
  confirmation_evidence_ref: option('--confirmation-evidence-ref') ?? `evidence:graph-sent-message-observed:cloudflare-live:${suffix}`,
};

const refusedConfirmationWithoutAcceptedSend = await postCarrier({
  operation: 'mailbox.send_confirmation.read',
  request_id: `mailbox_send_confirmation_refused_missing_send_${suffix}`,
  params: {
    site_id: siteId,
    source_payload: { ...confirmationPayload, send_accepted_id: `${sendAcceptedId}_missing` },
  },
});
assert.equal(refusedConfirmationWithoutAcceptedSend.http_status, 403, JSON.stringify(refusedConfirmationWithoutAcceptedSend.body));
assert.equal(refusedConfirmationWithoutAcceptedSend.body.code, 'mailbox_send_confirmation_requires_existing_send_accepted');

const confirmed = await retryConfirmationRead({
  operation: 'mailbox.send_confirmation.read',
  request_id: `mailbox_send_confirmation_read_${suffix}`,
  params: { site_id: siteId, send_confirmation_id: sendConfirmationId, source_payload: confirmationPayload },
});
assert.equal(confirmed.http_status, 200, JSON.stringify(confirmed.body));
assert.equal(confirmed.body.schema, 'narada.sonar.cloudflare_mailbox_send_confirmation.v1');
assert.equal(confirmed.body.status, 'confirmed_by_reconciliation_read');
assert.equal(confirmed.body.mailbox_send_confirmation_authority, 'cloudflare_graph_sent_items_reconciliation');
assert.equal(confirmed.body.delivery_confirmation_admission, 'admitted');
assert.equal(confirmed.body.mailbox_mutation_admission, 'not_admitted');
assert.equal(confirmed.body.record?.send_confirmation_id, sendConfirmationId);

const confirmationListed = await postCarrier({
  operation: 'mailbox.send_confirmation.list',
  request_id: `mailbox_send_confirmation_list_${suffix}`,
  params: { site_id: siteId, mailbox_send_confirmation_limit: 20 },
});
assert.equal(confirmationListed.http_status, 200, JSON.stringify(confirmationListed.body));
assert.equal(confirmationListed.body.mailbox_send_confirmation_authority, 'cloudflare_graph_sent_items_reconciliation');
assert.equal(confirmationListed.body.delivery_confirmation_admission, 'admitted');
assert.equal(confirmationListed.body.mailbox_mutation_admission, 'not_admitted');
assert.equal(confirmationListed.body.authority_partition, 'mailbox_send_confirmation_cloudflare_owned_other_mutation_not_admitted');
assert.ok(confirmationListed.body.confirmations.some((entry) => entry.send_confirmation_id === sendConfirmationId));

const operationReadAfterConfirmation = await postCarrier({
  operation: 'operation.read',
  request_id: `mailbox_send_operation_read_after_confirmation_${suffix}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    mailbox_outlook_draft_create_limit: 20,
    mailbox_send_accepted_limit: 20,
    mailbox_send_confirmation_limit: 20,
  },
});
assert.equal(operationReadAfterConfirmation.http_status, 200, JSON.stringify(operationReadAfterConfirmation.body));
assert.ok(operationReadAfterConfirmation.body.mailbox_send_confirmations.some((entry) => entry.send_confirmation_id === sendConfirmationId));
assert.ok(operationReadAfterConfirmation.body.operation_product_surface.mailbox_send_confirmation_count >= 1);
assert.equal(operationReadAfterConfirmation.body.operation_product_surface.mailbox_send_confirmation_authority, 'cloudflare_graph_sent_items_reconciliation');
assert.equal(operationReadAfterConfirmation.body.operation_product_surface.mailbox_send_delivery_confirmation_admission, 'admitted');
assert.equal(operationReadAfterConfirmation.body.operation_product_surface.mailbox_mutation_admission, 'not_admitted');
assert.equal(operationReadAfterConfirmation.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition, 'mailbox_outlook_draft_create_send_and_confirmation_cloudflare_owned_other_mutation_not_admitted');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.mailbox_send_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  account_ref: accountRef,
  to_recipient: toRecipient,
  draft_create_id: draftCreateId,
  outlook_draft_id: outlookDraftId,
  send_accepted_id: sendAcceptedId,
  send_confirmation_id: sendConfirmationId,
  sent_message_ref: sentMessageRef,
  mailbox_send_authority: sent.body.mailbox_send_authority,
  mailbox_send_admission: sent.body.mailbox_send_admission,
  mailbox_send_confirmation_authority: confirmed.body.mailbox_send_confirmation_authority,
  delivery_confirmation_admission: confirmed.body.delivery_confirmation_admission,
  mailbox_mutation_admission: confirmed.body.mailbox_mutation_admission,
  mailbox_send_accepted_count: operationReadAfterConfirmation.body.operation_product_surface.mailbox_send_accepted_count,
  mailbox_send_confirmation_count: operationReadAfterConfirmation.body.operation_product_surface.mailbox_send_confirmation_count,
  mailbox_outlook_draft_create_authority_partition: operationReadAfterConfirmation.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition,
}, null, 2)}\n`);

async function retryConfirmationRead(body) {
  let lastResult = null;
  const attempts = Math.max(1, Math.min(20, Number.isFinite(confirmationAttempts) ? confirmationAttempts : 5));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResult = await postCarrier({ ...body, request_id: `${body.request_id}_${attempt}` });
    if (lastResult.http_status === 200) return lastResult;
    if (attempt < attempts) await delay(Math.max(0, confirmationDelayMs));
  }
  return lastResult;
}

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
  if (!existsSync(resolved)) throw new Error(`mailbox_send_live_smoke_token_file_missing:${resolved}`);
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

function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}
