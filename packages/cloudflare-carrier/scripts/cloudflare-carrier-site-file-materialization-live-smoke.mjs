#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseSiteFileMaterializationLiveSmokeArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_SITE_FILE_MATERIALIZATION_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const taskId = option(args, '--task-id') ?? 'cloudflare-site-file-materialization-live-smoke';
  const proposalId = option(args, '--proposal-id') ?? null;
  const proposalRef = option(args, '--proposal-ref') ?? null;
  const filePath = option(args, '--file') ?? 'docs/architecture/cloudflare-carrier/target.md';
  const contentSha256 = option(args, '--content-sha256') ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const contentRef = option(args, '--content-ref') ?? null;
  const authorityRef = option(args, '--authority-ref') ?? 'cloudflare-carrier:site-file-materialization:v1';
  const cutoverRef = option(args, '--cutover-ref') ?? null;
  const contractRef = option(args, '--contract-ref') ?? 'contract:cloudflare-site-file-materialization:v1';
  const evidenceRef = option(args, '--evidence-ref') ?? null;
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('site_file_materialization_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`site_file_materialization_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('site_file_materialization_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('site_file_materialization_live_smoke_requires_site_id');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    taskId,
    proposalId,
    proposalRef,
    filePath,
    contentSha256,
    contentRef,
    authorityRef,
    cutoverRef,
    contractRef,
    evidenceRef,
  };
}

export function formatSiteFileMaterializationLiveSmokeText(result) {
  const lines = [
    `Site File Materialization Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Materialization: ${result.materialization_id}`,
    `Authority: materialization=${result.site_file_materialization_authority ?? 'unknown'} filesystem_executor=${result.filesystem_executor_authority ?? 'unknown'}`,
    `Admissions: cloudflare_materialization=${result.cloudflare_site_file_materialization_admission ?? 'unknown'} windows_filesystem=${result.windows_filesystem_mutation_admission ?? 'unknown'} repository_publication=${result.repository_publication_admission ?? 'unknown'}`,
    `Partition: ${result.site_file_materialization_authority_partition ?? 'unknown'}`,
    `Materialization Review: pnpm --filter @narada2/cloudflare-carrier product:site-file:materialization:review:text -- --url ${result.worker_url} --site ${result.site_id} --site-file-materialization-id ${result.materialization_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runSiteFileMaterializationLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const materializationId = `site_file_materialization_live_${suffix}`;
  const generatedAt = new Date().toISOString();
  const sourcePayload = {
    cloudflare_site_file_materialization_cutover: true,
    generated_at: generatedAt,
    operation_id: config.operationId,
    task_id: config.taskId,
    proposal_id: config.proposalId ?? `site_file_change_proposal_live_${suffix}`,
    proposal_ref: config.proposalRef ?? `proposal:site-file-materialization-live:${suffix}`,
    file_path: config.filePath,
    content_sha256: config.contentSha256,
    content_ref: config.contentRef ?? `cloudflare-site-file-store:target-md:${suffix}`,
    materialization_authority_ref: config.authorityRef,
    cutover_point_ref: config.cutoverRef ?? `cutover:cloudflare-site-file-materialization:${suffix}`,
    governed_write_contract_ref: config.contractRef,
    confirmation_evidence_ref: config.evidenceRef ?? `evidence:cloudflare-site-file-materialization-live:${suffix}`,
    authority_locus: 'cloudflare_carrier_site',
    filesystem_executor_authority: 'cloudflare_site_file_store',
    windows_filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
  };

  const refusedCutover = await postCarrier(config, {
    operation: 'site_file_materialization.admit',
    request_id: `site_file_materialization_refused_cutover_${suffix}`,
    params: {
      site_id: config.siteId,
      materialization_id: `${materializationId}_refused_cutover`,
      source_payload: { ...sourcePayload, cloudflare_site_file_materialization_cutover: false },
    },
  }, fetchImpl);
  assert.equal(refusedCutover.http_status, 400, JSON.stringify(refusedCutover.body));
  assert.equal(refusedCutover.body.code, 'site_file_materialization_cutover_evidence_required');

  const refusedWindowsMutation = await postCarrier(config, {
    operation: 'site_file_materialization.admit',
    request_id: `site_file_materialization_refused_windows_mutation_${suffix}`,
    params: {
      site_id: config.siteId,
      materialization_id: `${materializationId}_refused_windows_mutation`,
      source_payload: { ...sourcePayload, windows_filesystem_mutation_admission: 'admitted' },
    },
  }, fetchImpl);
  assert.equal(refusedWindowsMutation.http_status, 400, JSON.stringify(refusedWindowsMutation.body));
  assert.equal(refusedWindowsMutation.body.code, 'site_file_materialization_windows_filesystem_mutation_admission_invalid');

  const admitted = await postCarrier(config, {
    operation: 'site_file_materialization.admit',
    request_id: `site_file_materialization_admit_${suffix}`,
    params: { site_id: config.siteId, materialization_id: materializationId, source_payload: sourcePayload },
  }, fetchImpl);
  assert.equal(admitted.http_status, 200, JSON.stringify(admitted.body));
  assert.equal(admitted.body.status, 'admitted');
  assert.equal(admitted.body.site_file_materialization_authority, 'cloudflare_carrier_site');
  assert.equal(admitted.body.cloudflare_site_file_materialization_admission, 'admitted');
  assert.equal(admitted.body.filesystem_executor_authority, 'cloudflare_site_file_store');
  assert.equal(admitted.body.windows_filesystem_mutation_admission, 'not_admitted');
  assert.equal(admitted.body.repository_publication_admission, 'not_admitted');
  assert.equal(admitted.body.write_effect, 'cloudflare_site_file_materialization_record');

  const listed = await postCarrier(config, {
    operation: 'site_file_materialization.list',
    request_id: `site_file_materialization_list_${suffix}`,
    params: { site_id: config.siteId, site_file_materialization_limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.ok(listed.body.materializations.some((entry) => entry.materialization_id === materializationId));
  assert.equal(listed.body.cloudflare_site_file_materialization_admission, 'admitted');
  assert.equal(listed.body.windows_filesystem_mutation_admission, 'not_admitted');
  assert.equal(listed.body.repository_publication_admission, 'not_admitted');
  assert.equal(listed.body.authority_partition, 'site_file_materialization_cloudflare_owned_windows_filesystem_and_publication_not_admitted');

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `site_file_materialization_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, site_file_materialization_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.ok(operationRead.body.site_file_materializations.some((entry) => entry.materialization_id === materializationId));
  assert.ok(operationRead.body.operation_product_surface.site_file_materialization_count >= 1);
  assert.equal(operationRead.body.operation_product_surface.site_file_materialization_authority, 'cloudflare_carrier_site');
  assert.equal(operationRead.body.operation_product_surface.cloudflare_site_file_materialization_admission, 'admitted');
  assert.equal(operationRead.body.operation_product_surface.cloudflare_site_file_materialization_executor_authority, 'cloudflare_site_file_store');
  assert.equal(operationRead.body.operation_product_surface.windows_filesystem_mutation_admission, 'not_admitted');
  assert.equal(operationRead.body.operation_product_surface.site_file_materialization_repository_publication_admission, 'not_admitted');
  assert.equal(operationRead.body.operation_product_surface.site_file_materialization_authority_partition, 'site_file_materialization_cloudflare_owned_windows_filesystem_and_publication_not_admitted');

  return {
    schema: 'narada.cloudflare_carrier.site_file_materialization_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    materialization_id: materializationId,
    site_file_materialization_authority: admitted.body.site_file_materialization_authority,
    cloudflare_site_file_materialization_admission: admitted.body.cloudflare_site_file_materialization_admission,
    filesystem_executor_authority: admitted.body.filesystem_executor_authority,
    windows_filesystem_mutation_admission: admitted.body.windows_filesystem_mutation_admission,
    repository_publication_admission: admitted.body.repository_publication_admission,
    site_file_materialization_count: operationRead.body.operation_product_surface.site_file_materialization_count,
    site_file_materialization_authority_partition: operationRead.body.operation_product_surface.site_file_materialization_authority_partition,
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
  if (!existsSync(resolved)) throw new Error(`site_file_materialization_live_smoke_token_file_missing:${resolved}`);
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
  const config = parseSiteFileMaterializationLiveSmokeArgs(process.argv.slice(2));
  const result = await runSiteFileMaterializationLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatSiteFileMaterializationLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
