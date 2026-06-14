#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseMailboxReadbackLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true } = {},
) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_MAILBOX_READBACK_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('mailbox_readback_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`mailbox_readback_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('mailbox_readback_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('mailbox_readback_live_smoke_requires_site_id');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
  };
}

export function formatMailboxReadbackLiveSmokeText(result) {
  const workerUrl = typeof result.worker_url === 'string' && result.worker_url.length > 0 ? result.worker_url : null;
  const siteId = typeof result.site_id === 'string' && result.site_id.length > 0 ? result.site_id : null;
  const operationId = typeof result.operation_id === 'string' && result.operation_id.length > 0 ? result.operation_id : null;
  const draftProposalCommand = result.mailbox_draft_reply_proposal_id
    ? (workerUrl && siteId ? `pnpm --filter @narada2/cloudflare-carrier product:mailbox:draft-reply-proposal:text -- --url ${workerUrl} --site ${siteId} --focus-ref ${result.mailbox_draft_reply_proposal_id} --operator-session-file <operator-session-file>` : null)
    : (workerUrl && siteId && operationId ? `pnpm --filter @narada2/cloudflare-carrier product:mailbox:draft-reply-proposal:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file>` : null);
  const draftReadCommand = result.mailbox_outlook_draft_create_id
    ? (workerUrl && siteId ? `pnpm --filter @narada2/cloudflare-carrier product:mailbox:outlook-draft:text -- --url ${workerUrl} --site ${siteId} --focus-ref ${result.mailbox_outlook_draft_create_id} --operator-session-file <operator-session-file>` : null)
    : (workerUrl && siteId && operationId ? `pnpm --filter @narada2/cloudflare-carrier product:mailbox:outlook-draft:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file>` : null);
  const sendAcceptedReadCommand = result.mailbox_send_accepted_id
    ? (workerUrl && siteId ? `pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-accepted:text -- --url ${workerUrl} --site ${siteId} --focus-ref ${result.mailbox_send_accepted_id} --operator-session-file <operator-session-file>` : null)
    : (workerUrl && siteId && operationId ? `pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-accepted:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file>` : null);
  const sendConfirmationReadCommand = result.mailbox_send_confirmation_id
    ? (workerUrl && siteId ? `pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-confirmation:text -- --url ${workerUrl} --site ${siteId} --focus-ref ${result.mailbox_send_confirmation_id} --operator-session-file <operator-session-file>` : null)
    : (workerUrl && siteId && operationId ? `pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-confirmation:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file>` : null);
  const lines = [
    `Mailbox Readback Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Status Source: count=${result.mailbox_status_source_read_count ?? 0} authority=${result.mailbox_status_authority ?? 'unknown'}`,
    `Status Shadow: count=${result.mailbox_status_shadow_read_count ?? 0}`,
    `Draft Reply Proposals: count=${result.mailbox_draft_reply_proposal_count ?? 0} authority=${result.mailbox_draft_reply_proposal_authority ?? 'unknown'}`,
    `Outlook Draft Creates: count=${result.mailbox_outlook_draft_create_count ?? 0} authority=${result.mailbox_outlook_draft_create_authority ?? 'unknown'} admission=${result.mailbox_outlook_draft_create_admission ?? 'unknown'}`,
    `Send Accepted: count=${result.mailbox_send_accepted_count ?? 0} authority=${result.mailbox_send_authority ?? 'unknown'} admission=${result.mailbox_send_admission ?? 'unknown'}`,
    `Send Confirmations: count=${result.mailbox_send_confirmation_count ?? 0} authority=${result.mailbox_send_confirmation_authority ?? 'unknown'} delivery_admission=${result.mailbox_send_delivery_confirmation_admission ?? 'unknown'}`,
    `Mutation Admission: ${result.mailbox_mutation_admission ?? 'unknown'}`,
  ];
  if (workerUrl && siteId) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  if (workerUrl && siteId && operationId) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file> --execute-operation-next`);
    lines.push(`Status Source Read: pnpm --filter @narada2/cloudflare-carrier mailbox:status-source-smoke:live:text -- --url ${workerUrl} --site ${siteId} --operation ${operationId} --operator-session-file <operator-session-file>`);
    lines.push(`Status Shadow Read: pnpm --filter @narada2/cloudflare-carrier mailbox:status-shadow-smoke:live:text -- --url ${workerUrl} --site ${siteId} --operation ${operationId} --operator-session-file <operator-session-file>`);
  }
  if (draftProposalCommand) lines.push(`Draft Proposal Read: ${draftProposalCommand}`);
  if (draftReadCommand) lines.push(`Draft Read: ${draftReadCommand}`);
  if (sendAcceptedReadCommand) lines.push(`Send Accepted Read: ${sendAcceptedReadCommand}`);
  if (sendConfirmationReadCommand) lines.push(`Send Confirmation Read: ${sendConfirmationReadCommand}`);
  return `${lines.join('\n')}\n`;
}

export async function runMailboxReadbackLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

  const acceptedList = await postCarrier(config, {
    operation: 'mailbox.send_accepted.list',
    request_id: `mailbox_readback_send_accepted_list_${suffix}`,
    params: { site_id: config.siteId, mailbox_send_accepted_limit: 20 },
  }, fetchImpl);
  assert.equal(acceptedList.http_status, 200, JSON.stringify(acceptedList.body));
  assert.equal(acceptedList.body.schema, 'narada.sonar.cloudflare_mailbox_send_accepted.v1');
  assert.equal(Array.isArray(acceptedList.body.sends), true);
  assert.equal(acceptedList.body.mailbox_mutation_admission, 'not_admitted');

  const confirmationList = await postCarrier(config, {
    operation: 'mailbox.send_confirmation.list',
    request_id: `mailbox_readback_send_confirmation_list_${suffix}`,
    params: { site_id: config.siteId, mailbox_send_confirmation_limit: 20 },
  }, fetchImpl);
  assert.equal(confirmationList.http_status, 200, JSON.stringify(confirmationList.body));
  assert.equal(confirmationList.body.schema, 'narada.sonar.cloudflare_mailbox_send_confirmation.v1');
  assert.equal(Array.isArray(confirmationList.body.confirmations), true);
  assert.equal(confirmationList.body.mailbox_mutation_admission, 'not_admitted');

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `mailbox_readback_operation_read_${suffix}`,
    params: {
      site_id: config.siteId,
      operation_id: config.operationId,
      mailbox_draft_reply_proposal_limit: 20,
      mailbox_outlook_draft_create_limit: 20,
      mailbox_send_accepted_limit: 20,
      mailbox_send_confirmation_limit: 20,
      mailbox_status_shadow_limit: 20,
    },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.equal(Array.isArray(operationRead.body.mailbox_draft_reply_proposals), true);
  assert.equal(Array.isArray(operationRead.body.mailbox_outlook_draft_creates), true);
  assert.equal(Array.isArray(operationRead.body.mailbox_send_accepted_records), true);
  assert.equal(Array.isArray(operationRead.body.mailbox_send_confirmations), true);
  assert.equal(Array.isArray(operationRead.body.mailbox_status_shadow_reads), true);
  assert.equal(typeof operationRead.body.operation_product_surface?.mailbox_status_source_read_count, 'number');
  assert.equal(typeof operationRead.body.operation_product_surface?.mailbox_status_shadow_read_count, 'number');
  assert.equal(typeof operationRead.body.operation_product_surface?.mailbox_draft_reply_proposal_count, 'number');
  assert.equal(typeof operationRead.body.operation_product_surface?.mailbox_outlook_draft_create_count, 'number');
  assert.equal(typeof operationRead.body.operation_product_surface?.mailbox_send_accepted_count, 'number');
  assert.equal(typeof operationRead.body.operation_product_surface?.mailbox_send_confirmation_count, 'number');
  if (operationRead.body.operation_product_surface.mailbox_status_source_read_count > 0) {
    assert.equal(operationRead.body.operation_product_surface.mailbox_status_authority, 'cloudflare_graph_mailbox_status_source');
    assert.equal(operationRead.body.operation_product_surface.mailbox_authority_partition.startsWith('mailbox_status_source_read'), true);
  }
  if (operationRead.body.operation_product_surface.mailbox_draft_reply_proposal_count > 0) {
    assert.equal(operationRead.body.operation_product_surface.mailbox_draft_reply_proposal_authority, 'cloudflare_carrier_site');
    assert.ok([
      'mailbox_draft_reply_proposal_cloudflare_recorded_outlook_draft_send_and_mutation_not_admitted',
      'mailbox_draft_reply_proposal_cloudflare_recorded_send_and_confirmation_cloudflare_owned_outlook_draft_and_mutation_not_admitted',
    ].includes(operationRead.body.operation_product_surface.mailbox_draft_reply_authority_partition));
  }
  if (operationRead.body.operation_product_surface.mailbox_outlook_draft_create_count > 0) {
    assert.equal(operationRead.body.operation_product_surface.mailbox_outlook_draft_create_authority, 'cloudflare_graph_outlook_draft_create');
    assert.ok([
      'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted',
      'mailbox_outlook_draft_create_and_send_cloudflare_owned_confirmation_and_other_mutation_not_admitted',
      'mailbox_outlook_draft_create_send_and_confirmation_cloudflare_owned_other_mutation_not_admitted',
    ].includes(operationRead.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition));
  }
  if (operationRead.body.operation_product_surface.mailbox_send_accepted_count > 0) {
    assert.equal(operationRead.body.operation_product_surface.mailbox_send_authority, 'cloudflare_graph_mailbox_send');
    assert.equal(operationRead.body.operation_product_surface.mailbox_send_admission, 'admitted');
  }
  if (operationRead.body.operation_product_surface.mailbox_send_confirmation_count > 0) {
    assert.equal(operationRead.body.operation_product_surface.mailbox_send_confirmation_authority, 'cloudflare_graph_sent_items_reconciliation');
    assert.equal(operationRead.body.operation_product_surface.mailbox_send_delivery_confirmation_admission, 'admitted');
  }
  assert.equal(operationRead.body.operation_product_surface.mailbox_mutation_admission, 'not_admitted');
  assert.ok(operationRead.body.authority_transfer_posture, 'missing authority transfer posture');

  const latestDraftReplyProposal = operationRead.body.mailbox_draft_reply_proposals[0] ?? null;
  const latestOutlookDraftCreate = operationRead.body.mailbox_outlook_draft_creates[0] ?? null;
  const latestSendAccepted = operationRead.body.mailbox_send_accepted_records[0] ?? null;
  const latestSendConfirmation = operationRead.body.mailbox_send_confirmations[0] ?? null;

  return {
    schema: 'narada.cloudflare_carrier.mailbox_readback_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    mailbox_status_source_read_count: operationRead.body.operation_product_surface.mailbox_status_source_read_count,
    mailbox_status_shadow_read_count: operationRead.body.operation_product_surface.mailbox_status_shadow_read_count,
    mailbox_status_authority: operationRead.body.operation_product_surface.mailbox_status_authority,
    mailbox_authority_partition: operationRead.body.operation_product_surface.mailbox_authority_partition,
    mailbox_draft_reply_proposal_count: operationRead.body.operation_product_surface.mailbox_draft_reply_proposal_count,
    mailbox_draft_reply_proposal_authority: operationRead.body.operation_product_surface.mailbox_draft_reply_proposal_authority,
    mailbox_draft_reply_proposal_id:
      latestDraftReplyProposal?.proposal_id
      ?? latestDraftReplyProposal?.record?.proposal_id
      ?? null,
    mailbox_draft_reply_authority_partition: operationRead.body.operation_product_surface.mailbox_draft_reply_authority_partition,
    mailbox_outlook_draft_create_count: operationRead.body.operation_product_surface.mailbox_outlook_draft_create_count,
    mailbox_outlook_draft_create_authority: operationRead.body.operation_product_surface.mailbox_outlook_draft_create_authority,
    mailbox_outlook_draft_create_admission: operationRead.body.operation_product_surface.mailbox_outlook_draft_create_admission,
    mailbox_outlook_draft_create_id:
      latestOutlookDraftCreate?.draft_create_id
      ?? latestOutlookDraftCreate?.record?.draft_create_id
      ?? null,
    mailbox_outlook_draft_create_authority_partition: operationRead.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition,
    mailbox_send_accepted_count: operationRead.body.operation_product_surface.mailbox_send_accepted_count,
    mailbox_send_authority: operationRead.body.operation_product_surface.mailbox_send_authority,
    mailbox_send_accepted_id:
      latestSendAccepted?.send_accepted_id
      ?? latestSendAccepted?.record?.send_accepted_id
      ?? null,
    mailbox_send_confirmation_count: operationRead.body.operation_product_surface.mailbox_send_confirmation_count,
    mailbox_send_confirmation_authority: operationRead.body.operation_product_surface.mailbox_send_confirmation_authority,
    mailbox_send_confirmation_id:
      latestSendConfirmation?.send_confirmation_id
      ?? latestSendConfirmation?.record?.send_confirmation_id
      ?? null,
    mailbox_send_admission: operationRead.body.operation_product_surface.mailbox_send_admission,
    mailbox_send_delivery_confirmation_admission: operationRead.body.operation_product_surface.mailbox_send_delivery_confirmation_admission,
    mailbox_mutation_admission: operationRead.body.operation_product_surface.mailbox_mutation_admission,
    remaining_windows_domains: operationRead.body.authority_transfer_posture.remaining_windows_domains,
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
  if (!existsSync(resolved)) throw new Error(`mailbox_readback_live_smoke_token_file_missing:${resolved}`);
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
  const config = parseMailboxReadbackLiveSmokeArgs(process.argv.slice(2));
  const result = await runMailboxReadbackLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatMailboxReadbackLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
