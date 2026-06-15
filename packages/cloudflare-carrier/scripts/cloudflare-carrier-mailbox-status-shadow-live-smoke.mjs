#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseMailboxStatusShadowLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true } = {},
) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_MAILBOX_STATUS_SHADOW_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const accountRef = option(args, '--account') ?? 'mailbox:sonar-operator';
  const status = option(args, '--status') ?? 'observed';
  const unreadCount = Number(option(args, '--unread-count') ?? 0);
  const pendingDraftCount = Number(option(args, '--pending-draft-count') ?? 0);
  const pendingSendCount = Number(option(args, '--pending-send-count') ?? 0);
  const latestMessageAt = option(args, '--latest-message-at') ?? null;
  const ticketCount = Number(option(args, '--ticket-count') ?? 0);
  const syncState = option(args, '--sync-state') ?? 'manual_live_smoke';
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('mailbox_status_shadow_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`mailbox_status_shadow_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('mailbox_status_shadow_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('mailbox_status_shadow_live_smoke_requires_site_id');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    accountRef,
    status,
    unreadCount,
    pendingDraftCount,
    pendingSendCount,
    latestMessageAt,
    ticketCount,
    syncState,
  };
}

export function formatMailboxStatusShadowLiveSmokeText(result) {
  const hasSiteId = typeof result.site_id === 'string' && result.site_id.length > 0;
  const hasOperationId = typeof result.operation_id === 'string' && result.operation_id.length > 0;
  const lines = [
    `Mailbox Status Shadow Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Account: ${result.account_ref}`,
    `Read: ${result.read_id}`,
    `Authority: status=${result.mailbox_status_authority ?? 'unknown'} write=${result.mailbox_write_authority ?? 'unknown'} send=${result.mailbox_send_admission ?? 'unknown'} mutation=${result.mailbox_mutation_admission ?? 'unknown'}`,
    `Counts: shadow_reads=${result.mailbox_status_shadow_read_count ?? 0} partition=${result.mailbox_authority_partition ?? 'unknown'}`,
  ];
  if (hasSiteId && hasOperationId) {
    lines.push(`Mailbox Readback Smoke: pnpm --filter @narada2/cloudflare-carrier mailbox:readback-smoke:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation ${result.operation_id} --operator-session-file <operator-session-file>`);
  }
  if (hasSiteId) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
  }
  if (hasSiteId && hasOperationId) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runMailboxStatusShadowLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const readId = `mailbox_status_shadow_live_${suffix}`;
  const generatedAt = new Date().toISOString();
  const sourcePayload = {
    schema: 'narada.sonar.mailbox_status_shadow_read.v1',
    generated_at: generatedAt,
    authority_locus: 'windows_local_site',
    shadow_target_locus: 'cloudflare_carrier_site',
    account_ref: config.accountRef,
    mailbox_status: config.status,
    unread_count: config.unreadCount,
    pending_draft_count: config.pendingDraftCount,
    pending_send_count: config.pendingSendCount,
    latest_message_at: config.latestMessageAt,
    ticket_count: config.ticketCount,
    sync_state: config.syncState,
    mailbox_read_authority: 'windows_mailbox_status_source',
    mailbox_write_authority: 'windows_mailbox_mcp',
    mailbox_send_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    shadow_read_posture: 'read_only_status_projection',
  };

  const refusedSend = await postCarrier(config, {
    operation: 'mailbox.status_shadow.record',
    request_id: `mailbox_status_shadow_refused_send_${suffix}`,
    params: {
      site_id: config.siteId,
      read_id: `${readId}_refused_send`,
      source_payload: { ...sourcePayload, mailbox_send_admission: 'admitted' },
    },
  }, fetchImpl);
  assert.equal(refusedSend.http_status, 400, JSON.stringify(refusedSend.body));
  assert.equal(refusedSend.body.code, 'mailbox_status_shadow_read_send_admission_invalid');

  const recorded = await postCarrier(config, {
    operation: 'mailbox.status_shadow.record',
    request_id: `mailbox_status_shadow_record_${suffix}`,
    params: { site_id: config.siteId, read_id: readId, source_payload: sourcePayload },
  }, fetchImpl);
  assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
  assert.equal(recorded.body.status, 'recorded');
  assert.equal(recorded.body.mailbox_status_authority, 'windows_mailbox_status_source');
  assert.equal(recorded.body.mailbox_write_authority, 'windows_mailbox_mcp');
  assert.equal(recorded.body.mailbox_send_admission, 'not_admitted');
  assert.equal(recorded.body.mailbox_mutation_admission, 'not_admitted');

  const listed = await postCarrier(config, {
    operation: 'mailbox.status_shadow.list',
    request_id: `mailbox_status_shadow_list_${suffix}`,
    params: { site_id: config.siteId, mailbox_status_shadow_limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  const listedShadowRead = listed.body.reads.find((entry) => entry.read_id === readId);
  assert.ok(listedShadowRead);
  assert.equal(listedShadowRead.mailbox_send_admission, 'not_admitted');
  assert.equal(listedShadowRead.mailbox_mutation_admission, 'not_admitted');
  assert.ok(['not_admitted', 'admitted', 'not_observed'].includes(listed.body.mailbox_send_admission), JSON.stringify(listed.body));
  assert.equal(listed.body.mailbox_mutation_admission, 'not_admitted');

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `mailbox_status_shadow_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, mailbox_status_shadow_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.ok(operationRead.body.mailbox_status_shadow_reads.some((entry) => entry.read_id === readId));
  const productSurface = operationRead.body.operation_product_surface;
  assert.ok(productSurface.mailbox_status_shadow_read_count >= 1);
  const sourceReadCount = Number(productSurface.mailbox_status_source_read_count ?? 0);
  const sendAcceptedCount = Number(productSurface.mailbox_send_accepted_count ?? 0);
  const sendConfirmationCount = Number(productSurface.mailbox_send_confirmation_count ?? 0);
  const expectedProductAuthority = sourceReadCount > 0 ? 'cloudflare_graph_mailbox_status_source' : 'windows_mailbox_status_source';
  const expectedProductPartition = sourceReadCount > 0
    ? sendAcceptedCount > 0
      ? sendConfirmationCount > 0
        ? 'mailbox_status_source_read_send_and_confirmation_cloudflare_owned_mutation_not_admitted'
        : 'mailbox_status_source_read_and_send_cloudflare_owned_confirmation_and_mutation_not_admitted'
      : 'mailbox_status_source_read_cloudflare_owned_send_and_mutation_not_admitted'
    : sendAcceptedCount > 0
      ? sendConfirmationCount > 0
        ? 'mailbox_status_shadow_read_cloudflare_recorded_send_and_confirmation_cloudflare_owned_mutation_windows_owned'
        : 'mailbox_status_shadow_read_cloudflare_recorded_send_cloudflare_owned_confirmation_and_mutation_windows_owned'
      : 'mailbox_status_shadow_read_cloudflare_recorded_send_and_mutation_windows_owned';
  assert.equal(productSurface.mailbox_status_authority, expectedProductAuthority);
  assert.equal(productSurface.mailbox_shadow_target_locus, 'cloudflare_carrier_site');
  assert.equal(productSurface.mailbox_send_admission, sendAcceptedCount > 0 ? 'admitted' : 'not_admitted');
  assert.equal(productSurface.mailbox_mutation_admission, 'not_admitted');
  assert.equal(productSurface.mailbox_authority_partition, expectedProductPartition);

  return {
    schema: 'narada.cloudflare_carrier.mailbox_status_shadow_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    read_id: readId,
    account_ref: config.accountRef,
    mailbox_status_authority: recorded.body.mailbox_status_authority,
    mailbox_write_authority: recorded.body.mailbox_write_authority,
    mailbox_send_admission: recorded.body.mailbox_send_admission,
    mailbox_mutation_admission: recorded.body.mailbox_mutation_admission,
    mailbox_status_shadow_read_count: operationRead.body.operation_product_surface.mailbox_status_shadow_read_count,
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
  if (!existsSync(resolved)) throw new Error(`mailbox_status_shadow_live_smoke_token_file_missing:${resolved}`);
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
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!env[key]) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseMailboxStatusShadowLiveSmokeArgs(process.argv.slice(2));
  const result = await runMailboxStatusShadowLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatMailboxStatusShadowLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
