#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseMailboxSendLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true } = {},
) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_MAILBOX_SEND_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const accountRef = option(args, '--account') ?? env.CLOUDFLARE_MAILBOX_ACCOUNT_REF ?? 'help@global-maxima.com';
  const toRecipient = option(args, '--to') ?? env.CLOUDFLARE_MAILBOX_SEND_SMOKE_TO ?? env.CLOUDFLARE_MAILBOX_DRAFT_SMOKE_TO ?? accountRef;
  const confirmationDelayMs = Number(option(args, '--confirmation-delay-ms') ?? env.CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_DELAY_MS ?? 5000);
  const confirmationAttempts = Number(option(args, '--confirmation-attempts') ?? env.CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_ATTEMPTS ?? 5);
  const subject = option(args, '--subject') ?? null;
  const bodyText = option(args, '--body-text') ?? null;
  const sourceMessageRef = option(args, '--source-message') ?? null;
  const proposalId = option(args, '--proposal-id') ?? null;
  const proposalRef = option(args, '--proposal-ref') ?? null;
  const bodySha256 = option(args, '--body-sha256') ?? null;
  const sendCutoverRef = option(args, '--send-cutover-ref') ?? null;
  const sendContractRef = option(args, '--send-contract-ref') ?? null;
  const sendEvidenceRef = option(args, '--send-evidence-ref') ?? null;
  const sentMessageRef = option(args, '--sent-message') ?? env.CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_MESSAGE_REF ?? null;
  const confirmationCutoverRef = option(args, '--confirmation-cutover-ref') ?? null;
  const confirmationContractRef = option(args, '--confirmation-contract-ref') ?? null;
  const confirmationEvidenceRef = option(args, '--confirmation-evidence-ref') ?? null;
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('mailbox_send_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`mailbox_send_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('mailbox_send_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('mailbox_send_live_smoke_requires_site_id');
  if (!accountRef) throw new Error('mailbox_send_live_smoke_requires_account_ref');
  if (!toRecipient) throw new Error('mailbox_send_live_smoke_requires_to_recipient');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    accountRef,
    toRecipient,
    confirmationDelayMs,
    confirmationAttempts,
    subject,
    bodyText,
    sourceMessageRef,
    proposalId,
    proposalRef,
    bodySha256,
    sendCutoverRef,
    sendContractRef,
    sendEvidenceRef,
    sentMessageRef,
    confirmationCutoverRef,
    confirmationContractRef,
    confirmationEvidenceRef,
  };
}

export function formatMailboxSendLiveSmokeText(result) {
  const lines = [
    `Mailbox Send Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Account: ${result.account_ref}`,
    `Recipient: ${result.to_recipient}`,
    `Draft Create: ${result.draft_create_id}`,
    `Outlook Draft: ${result.outlook_draft_id}`,
    `Send Accepted: ${result.send_accepted_id} authority=${result.mailbox_send_authority ?? 'unknown'} admission=${result.mailbox_send_admission ?? 'unknown'}`,
    `Send Confirmation: ${result.send_confirmation_id} authority=${result.mailbox_send_confirmation_authority ?? 'unknown'} delivery_admission=${result.delivery_confirmation_admission ?? 'unknown'}`,
    `Mutation Admission: ${result.mailbox_mutation_admission ?? 'unknown'}`,
    `Counts: accepted=${result.mailbox_send_accepted_count ?? 0} confirmations=${result.mailbox_send_confirmation_count ?? 0} partition=${result.mailbox_outlook_draft_create_authority_partition ?? 'unknown'}`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Draft Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:outlook-draft:text -- --url ${result.worker_url} --site ${result.site_id} --focus-ref ${result.draft_create_id} --operator-session-file <operator-session-file>`,
    `Send Accepted Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-accepted:text -- --url ${result.worker_url} --site ${result.site_id} --focus-ref ${result.send_accepted_id} --operator-session-file <operator-session-file>`,
    `Send Confirmation Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-confirmation:text -- --url ${result.worker_url} --site ${result.site_id} --focus-ref ${result.send_confirmation_id} --operator-session-file <operator-session-file>`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runMailboxSendLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const draftCreateId = `mailbox_send_live_draft_create_${suffix}`;
  const sendAcceptedId = `mailbox_send_accepted_live_${suffix}`;
  const sendConfirmationId = `mailbox_send_confirmation_live_${suffix}`;
  const generatedAt = new Date().toISOString();
  const subject = config.subject ?? `Narada Cloudflare send smoke ${suffix}`;
  const bodyText = config.bodyText ?? `Cloudflare mailbox send live smoke ${suffix}. This message verifies bounded send authority transfer.`;
  const proposalId = config.proposalId ?? `mailbox_send_live_proposal_${suffix}`;
  const proposalRef = config.proposalRef ?? `proposal:mailbox-send-live:${suffix}`;
  const bodySha256 = config.bodySha256 ?? sha256Hex(bodyText);

  const draftSourcePayload = {
    schema: 'narada.sonar.mailbox_outlook_draft_create_request.v1',
    generated_at: generatedAt,
    operation_id: config.operationId,
    account_ref: config.accountRef,
    source_message_ref: config.sourceMessageRef ?? `graph-message-send-live-smoke-${suffix}`,
    proposal_id: proposalId,
    proposal_ref: proposalRef,
    subject,
    to_recipients: [config.toRecipient],
    body_text: bodyText,
    body_sha256: bodySha256,
    mailbox_outlook_draft_create_admission: 'admitted',
    mailbox_send_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    draft_create_posture: 'cloudflare_created_outlook_draft_send_not_admitted',
  };

  const created = await postCarrier(config, {
    operation: 'mailbox.outlook_draft.create',
    request_id: `mailbox_send_draft_create_${suffix}`,
    params: { site_id: config.siteId, draft_create_id: draftCreateId, source_payload: draftSourcePayload },
  }, fetchImpl);
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
    operation_id: config.operationId,
    account_ref: config.accountRef,
    outlook_draft_id: outlookDraftId,
    draft_create_id: draftCreateId,
    proposal_id: proposalId,
    source_message_ref: draftSourcePayload.source_message_ref,
    mailbox_send_admission: 'admitted',
    mailbox_mutation_admission: 'not_admitted',
    cutover_point_ref: config.sendCutoverRef ?? `cutover:mailbox-send:cloudflare-live:${suffix}`,
    governed_write_contract_ref: config.sendContractRef ?? 'contract:graph-draft-send:v1',
    confirmation_evidence_ref: config.sendEvidenceRef ?? `evidence:graph-send-accepted:cloudflare-live:${suffix}`,
  };

  const refusedSendWithoutCutover = await postCarrier(config, {
    operation: 'mailbox.outlook_draft.send',
    request_id: `mailbox_send_refused_missing_cutover_${suffix}`,
    params: {
      site_id: config.siteId,
      send_accepted_id: `${sendAcceptedId}_refused_missing_cutover`,
      source_payload: { ...sendSourcePayload, cutover_point_ref: '' },
    },
  }, fetchImpl);
  assert.equal(refusedSendWithoutCutover.http_status, 403, JSON.stringify(refusedSendWithoutCutover.body));
  assert.equal(refusedSendWithoutCutover.body.code, 'mailbox_send_requires_cutover_point_ref');

  const sent = await postCarrier(config, {
    operation: 'mailbox.outlook_draft.send',
    request_id: `mailbox_send_accept_${suffix}`,
    params: { site_id: config.siteId, send_accepted_id: sendAcceptedId, source_payload: sendSourcePayload },
  }, fetchImpl);
  assert.equal(sent.http_status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.schema, 'narada.sonar.cloudflare_mailbox_send_accepted.v1');
  assert.equal(sent.body.status, 'accepted');
  assert.equal(sent.body.mailbox_send_authority, 'cloudflare_graph_mailbox_send');
  assert.equal(sent.body.mailbox_send_admission, 'admitted');
  assert.equal(sent.body.mailbox_mutation_admission, 'not_admitted');
  assert.equal(sent.body.delivery_confirmation_admission, 'not_admitted');
  assert.equal(sent.body.record?.send_accepted_id, sendAcceptedId);

  const sendListed = await postCarrier(config, {
    operation: 'mailbox.send_accepted.list',
    request_id: `mailbox_send_accepted_list_${suffix}`,
    params: { site_id: config.siteId, mailbox_send_accepted_limit: 20 },
  }, fetchImpl);
  assert.equal(sendListed.http_status, 200, JSON.stringify(sendListed.body));
  assert.equal(sendListed.body.mailbox_send_authority, 'cloudflare_graph_mailbox_send');
  assert.equal(sendListed.body.mailbox_send_admission, 'admitted');
  assert.equal(sendListed.body.mailbox_mutation_admission, 'not_admitted');
  assert.equal(sendListed.body.delivery_confirmation_admission, 'not_admitted');
  assert.equal(sendListed.body.authority_partition, 'mailbox_send_cloudflare_owned_delivery_not_confirmed_other_mutation_not_admitted');
  assert.ok(sendListed.body.sends.some((entry) => entry.send_accepted_id === sendAcceptedId));

  const operationReadAfterSend = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `mailbox_send_operation_read_after_send_${suffix}`,
    params: {
      site_id: config.siteId,
      operation_id: config.operationId,
      mailbox_outlook_draft_create_limit: 20,
      mailbox_send_accepted_limit: 20,
      mailbox_send_confirmation_limit: 20,
    },
  }, fetchImpl);
  assert.equal(operationReadAfterSend.http_status, 200, JSON.stringify(operationReadAfterSend.body));
  assert.ok(operationReadAfterSend.body.mailbox_send_accepted_records.some((entry) => entry.send_accepted_id === sendAcceptedId));
  assert.ok(operationReadAfterSend.body.operation_product_surface.mailbox_send_accepted_count >= 1);
  assert.equal(operationReadAfterSend.body.operation_product_surface.mailbox_send_authority, 'cloudflare_graph_mailbox_send');
  assert.equal(operationReadAfterSend.body.operation_product_surface.mailbox_send_admission, 'admitted');
  assert.equal(operationReadAfterSend.body.operation_product_surface.mailbox_send_delivery_confirmation_admission, 'not_admitted');
  assert.equal(operationReadAfterSend.body.operation_product_surface.mailbox_mutation_admission, 'not_admitted');
  assert.equal(operationReadAfterSend.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition, 'mailbox_outlook_draft_create_and_send_cloudflare_owned_confirmation_and_other_mutation_not_admitted');

  if (config.confirmationDelayMs > 0) await delay(config.confirmationDelayMs);
  const sentMessageRef = config.sentMessageRef ?? outlookDraftId;
  const confirmationPayload = {
    schema: 'narada.sonar.mailbox_send_confirmation_read_request.v1',
    generated_at: new Date().toISOString(),
    operation_id: config.operationId,
    send_accepted_id: sendAcceptedId,
    account_ref: config.accountRef,
    outlook_draft_id: outlookDraftId,
    sent_message_ref: sentMessageRef,
    sent_subject: subject,
    delivery_confirmation_admission: 'admitted',
    mailbox_mutation_admission: 'not_admitted',
    cutover_point_ref: config.confirmationCutoverRef ?? `cutover:mailbox-send-confirmation:cloudflare-live:${suffix}`,
    governed_write_contract_ref: config.confirmationContractRef ?? 'contract:graph-sent-message-read:v1',
    confirmation_evidence_ref: config.confirmationEvidenceRef ?? `evidence:graph-sent-message-observed:cloudflare-live:${suffix}`,
  };

  const refusedConfirmationWithoutAcceptedSend = await postCarrier(config, {
    operation: 'mailbox.send_confirmation.read',
    request_id: `mailbox_send_confirmation_refused_missing_send_${suffix}`,
    params: {
      site_id: config.siteId,
      source_payload: { ...confirmationPayload, send_accepted_id: `${sendAcceptedId}_missing` },
    },
  }, fetchImpl);
  assert.equal(refusedConfirmationWithoutAcceptedSend.http_status, 403, JSON.stringify(refusedConfirmationWithoutAcceptedSend.body));
  assert.equal(refusedConfirmationWithoutAcceptedSend.body.code, 'mailbox_send_confirmation_requires_existing_send_accepted');

  const confirmed = await retryConfirmationRead(config, {
    operation: 'mailbox.send_confirmation.read',
    request_id: `mailbox_send_confirmation_read_${suffix}`,
    params: { site_id: config.siteId, send_confirmation_id: sendConfirmationId, source_payload: confirmationPayload },
  }, fetchImpl);
  assert.equal(confirmed.http_status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.schema, 'narada.sonar.cloudflare_mailbox_send_confirmation.v1');
  assert.equal(confirmed.body.status, 'confirmed_by_reconciliation_read');
  assert.equal(confirmed.body.mailbox_send_confirmation_authority, 'cloudflare_graph_sent_items_reconciliation');
  assert.equal(confirmed.body.delivery_confirmation_admission, 'admitted');
  assert.equal(confirmed.body.mailbox_mutation_admission, 'not_admitted');
  assert.equal(confirmed.body.record?.send_confirmation_id, sendConfirmationId);

  const confirmationListed = await postCarrier(config, {
    operation: 'mailbox.send_confirmation.list',
    request_id: `mailbox_send_confirmation_list_${suffix}`,
    params: { site_id: config.siteId, mailbox_send_confirmation_limit: 20 },
  }, fetchImpl);
  assert.equal(confirmationListed.http_status, 200, JSON.stringify(confirmationListed.body));
  assert.equal(confirmationListed.body.mailbox_send_confirmation_authority, 'cloudflare_graph_sent_items_reconciliation');
  assert.equal(confirmationListed.body.delivery_confirmation_admission, 'admitted');
  assert.equal(confirmationListed.body.mailbox_mutation_admission, 'not_admitted');
  assert.equal(confirmationListed.body.authority_partition, 'mailbox_send_confirmation_cloudflare_owned_other_mutation_not_admitted');
  assert.ok(confirmationListed.body.confirmations.some((entry) => entry.send_confirmation_id === sendConfirmationId));

  const operationReadAfterConfirmation = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `mailbox_send_operation_read_after_confirmation_${suffix}`,
    params: {
      site_id: config.siteId,
      operation_id: config.operationId,
      mailbox_outlook_draft_create_limit: 20,
      mailbox_send_accepted_limit: 20,
      mailbox_send_confirmation_limit: 20,
    },
  }, fetchImpl);
  assert.equal(operationReadAfterConfirmation.http_status, 200, JSON.stringify(operationReadAfterConfirmation.body));
  assert.ok(operationReadAfterConfirmation.body.mailbox_send_confirmations.some((entry) => entry.send_confirmation_id === sendConfirmationId));
  assert.ok(operationReadAfterConfirmation.body.operation_product_surface.mailbox_send_confirmation_count >= 1);
  assert.equal(operationReadAfterConfirmation.body.operation_product_surface.mailbox_send_confirmation_authority, 'cloudflare_graph_sent_items_reconciliation');
  assert.equal(operationReadAfterConfirmation.body.operation_product_surface.mailbox_send_delivery_confirmation_admission, 'admitted');
  assert.equal(operationReadAfterConfirmation.body.operation_product_surface.mailbox_mutation_admission, 'not_admitted');
  assert.equal(operationReadAfterConfirmation.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition, 'mailbox_outlook_draft_create_send_and_confirmation_cloudflare_owned_other_mutation_not_admitted');

  return {
    schema: 'narada.cloudflare_carrier.mailbox_send_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    account_ref: config.accountRef,
    to_recipient: config.toRecipient,
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
  };
}

async function retryConfirmationRead(config, body, fetchImpl) {
  let lastResult = null;
  const attempts = Math.max(1, Math.min(20, Number.isFinite(config.confirmationAttempts) ? config.confirmationAttempts : 5));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResult = await postCarrier(config, { ...body, request_id: `${body.request_id}_${attempt}` }, fetchImpl);
    if (lastResult.http_status === 200) return lastResult;
    if (attempt < attempts) await delay(Math.max(0, config.confirmationDelayMs));
  }
  return lastResult;
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
  if (!existsSync(resolved)) throw new Error(`mailbox_send_live_smoke_token_file_missing:${resolved}`);
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
    const value = trimmed.slice(eq + 1).trim().replace(/^[\"']|[\"']$/g, '');
    if (!env[key]) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

if (process.argv[1] === scriptPath) {
  const config = parseMailboxSendLiveSmokeArgs(process.argv.slice(2));
  const result = await runMailboxSendLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatMailboxSendLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
