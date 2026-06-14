#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseLocalIngressRequestLiveSmokeArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_LOCAL_INGRESS_REQUEST_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const taskId = option(args, '--task-id') ?? 'cloudflare-local-ingress-request-live-smoke';
  const actionRef = option(args, '--action-ref') ?? null;
  const summary = option(args, '--summary') ?? null;
  const contractRef = option(args, '--contract-ref') ?? 'contract:cloudflare-to-windows-local-ingress-request:v1';
  const evidenceContractRef = option(args, '--evidence-contract-ref') ?? 'contract:windows-local-ingress-evidence-return:v1';
  const rollbackRef = option(args, '--rollback-ref') ?? null;
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('local_ingress_request_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`local_ingress_request_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('local_ingress_request_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('local_ingress_request_live_smoke_requires_site_id');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    taskId,
    actionRef,
    summary,
    contractRef,
    evidenceContractRef,
    rollbackRef,
  };
}

export function formatLocalIngressRequestLiveSmokeText(result) {
  const lines = [
    `Local Ingress Request Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Request: ${result.local_ingress_request_id}`,
    `Authority: request=${result.local_ingress_request_authority ?? 'unknown'} target=${result.target_authority_locus ?? 'unknown'} executor=${result.local_executor_authority ?? 'unknown'}`,
    `Admissions: local_execution=${result.local_execution_admission ?? 'unknown'} direct_cloudflare_fs=${result.direct_cloudflare_filesystem_mutation_admission ?? 'unknown'} repository_publication=${result.repository_publication_admission ?? 'unknown'}`,
    `Partition: ${result.authority_partition ?? 'unknown'}`,
    `Request Review: pnpm --filter @narada2/cloudflare-carrier product:local-ingress:request:review:text -- --url ${result.worker_url} --site ${result.site_id} --local-ingress-request-id ${result.local_ingress_request_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runLocalIngressRequestLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const localIngressRequestId = `local_ingress_request_live_${suffix}`;
  const generatedAt = new Date().toISOString();
  const sourcePayload = {
    generated_at: generatedAt,
    operation_id: config.operationId,
    task_id: config.taskId,
    requested_mutation_class: 'local_repository_filesystem_mutation',
    requested_action_ref: config.actionRef ?? `local-windows-action:site-file-write-live:${suffix}`,
    requested_action_summary: config.summary ?? 'request a governed local Windows site-file write and wait for Windows evidence',
    governed_request_contract_ref: config.contractRef,
    evidence_return_contract_ref: config.evidenceContractRef,
    rollback_plan_ref: config.rollbackRef ?? `rollback:local-ingress-request-live:${suffix}`,
    target_authority_locus: 'local-windows-site-authority',
    local_executor_authority: 'windows_local_ingress_executor',
    local_execution_admission: 'pending_windows_admission',
    direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
  };

  const refusedDirectMutation = await postCarrier(config, {
    operation: 'local_ingress.request.create',
    request_id: `local_ingress_refused_direct_mutation_${suffix}`,
    params: {
      site_id: config.siteId,
      local_ingress_request_id: `${localIngressRequestId}_refused_direct_mutation`,
      source_payload: { ...sourcePayload, direct_cloudflare_filesystem_mutation_admission: 'admitted' },
    },
  }, fetchImpl);
  assert.equal(refusedDirectMutation.http_status, 400, JSON.stringify(refusedDirectMutation.body));
  assert.equal(refusedDirectMutation.body.code, 'local_ingress_direct_cloudflare_filesystem_mutation_admission_invalid');

  const queued = await postCarrier(config, {
    operation: 'local_ingress.request.create',
    request_id: `local_ingress_request_create_${suffix}`,
    params: { site_id: config.siteId, local_ingress_request_id: localIngressRequestId, source_payload: sourcePayload },
  }, fetchImpl);
  assert.equal(queued.http_status, 200, JSON.stringify(queued.body));
  assert.equal(queued.body.status, 'queued');
  assert.equal(queued.body.local_ingress_request_authority, 'cloudflare_local_ingress_request_queue');
  assert.equal(queued.body.target_authority_locus, 'local-windows-site-authority');
  assert.equal(queued.body.local_executor_authority, 'windows_local_ingress_executor');
  assert.equal(queued.body.local_execution_admission, 'pending_windows_admission');
  assert.equal(queued.body.direct_cloudflare_filesystem_mutation_admission, 'not_admitted');
  assert.equal(queued.body.repository_publication_admission, 'not_admitted');

  const listed = await postCarrier(config, {
    operation: 'local_ingress.request.list',
    request_id: `local_ingress_request_list_${suffix}`,
    params: { site_id: config.siteId, local_ingress_request_limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.ok(listed.body.requests.some((entry) => entry.local_ingress_request_id === localIngressRequestId));
  assert.equal(listed.body.local_ingress_request_authority, 'cloudflare_local_ingress_request_queue');
  assert.equal(listed.body.local_executor_authority, 'windows_local_ingress_executor');
  assert.equal(listed.body.local_execution_admission, 'pending_windows_admission');
  assert.equal(listed.body.direct_cloudflare_filesystem_mutation_admission, 'not_admitted');
  assert.equal(listed.body.repository_publication_admission, 'not_admitted');
  assert.equal(listed.body.authority_partition, 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence');

  return {
    schema: 'narada.cloudflare_carrier.local_ingress_request_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    local_ingress_request_id: localIngressRequestId,
    local_ingress_request_authority: queued.body.local_ingress_request_authority,
    target_authority_locus: queued.body.target_authority_locus,
    local_executor_authority: queued.body.local_executor_authority,
    local_execution_admission: queued.body.local_execution_admission,
    direct_cloudflare_filesystem_mutation_admission: queued.body.direct_cloudflare_filesystem_mutation_admission,
    repository_publication_admission: queued.body.repository_publication_admission,
    authority_partition: listed.body.authority_partition,
  };
}

async function postCarrier(config, body, fetchImpl) {
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      ...authHeaders(config.auth),
      'content-type': 'application/json',
    },
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
  if (!existsSync(resolved)) throw new Error(`local_ingress_request_live_smoke_token_file_missing:${resolved}`);
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
    if (!(key in env)) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseLocalIngressRequestLiveSmokeArgs(process.argv.slice(2));
  const result = await runLocalIngressRequestLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatLocalIngressRequestLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
