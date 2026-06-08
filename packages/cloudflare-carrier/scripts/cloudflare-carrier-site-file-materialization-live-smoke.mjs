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

if (!workerUrl) throw new Error('site_file_materialization_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('site_file_materialization_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('site_file_materialization_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const materializationId = `site_file_materialization_live_${suffix}`;
const generatedAt = new Date().toISOString();
const sourcePayload = {
  cloudflare_site_file_materialization_cutover: true,
  generated_at: generatedAt,
  operation_id: operationId,
  task_id: option('--task-id') ?? 'cloudflare-site-file-materialization-live-smoke',
  proposal_id: option('--proposal-id') ?? `site_file_change_proposal_live_${suffix}`,
  proposal_ref: option('--proposal-ref') ?? `proposal:site-file-materialization-live:${suffix}`,
  file_path: option('--file') ?? 'docs/architecture/cloudflare-carrier/target.md',
  content_sha256: option('--content-sha256') ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  content_ref: option('--content-ref') ?? `cloudflare-site-file-store:target-md:${suffix}`,
  materialization_authority_ref: option('--authority-ref') ?? 'cloudflare-carrier:site-file-materialization:v1',
  cutover_point_ref: option('--cutover-ref') ?? `cutover:cloudflare-site-file-materialization:${suffix}`,
  governed_write_contract_ref: option('--contract-ref') ?? 'contract:cloudflare-site-file-materialization:v1',
  confirmation_evidence_ref: option('--evidence-ref') ?? `evidence:cloudflare-site-file-materialization-live:${suffix}`,
  authority_locus: 'cloudflare_carrier_site',
  filesystem_executor_authority: 'cloudflare_site_file_store',
  windows_filesystem_mutation_admission: 'not_admitted',
  repository_publication_admission: 'not_admitted',
};

const refusedCutover = await postCarrier({
  operation: 'site_file_materialization.admit',
  request_id: `site_file_materialization_refused_cutover_${suffix}`,
  params: {
    site_id: siteId,
    materialization_id: `${materializationId}_refused_cutover`,
    source_payload: { ...sourcePayload, cloudflare_site_file_materialization_cutover: false },
  },
});
assert.equal(refusedCutover.http_status, 400, JSON.stringify(refusedCutover.body));
assert.equal(refusedCutover.body.code, 'site_file_materialization_cutover_evidence_required');

const refusedWindowsMutation = await postCarrier({
  operation: 'site_file_materialization.admit',
  request_id: `site_file_materialization_refused_windows_mutation_${suffix}`,
  params: {
    site_id: siteId,
    materialization_id: `${materializationId}_refused_windows_mutation`,
    source_payload: { ...sourcePayload, windows_filesystem_mutation_admission: 'admitted' },
  },
});
assert.equal(refusedWindowsMutation.http_status, 400, JSON.stringify(refusedWindowsMutation.body));
assert.equal(refusedWindowsMutation.body.code, 'site_file_materialization_windows_filesystem_mutation_admission_invalid');

const admitted = await postCarrier({
  operation: 'site_file_materialization.admit',
  request_id: `site_file_materialization_admit_${suffix}`,
  params: { site_id: siteId, materialization_id: materializationId, source_payload: sourcePayload },
});
assert.equal(admitted.http_status, 200, JSON.stringify(admitted.body));
assert.equal(admitted.body.status, 'admitted');
assert.equal(admitted.body.site_file_materialization_authority, 'cloudflare_carrier_site');
assert.equal(admitted.body.cloudflare_site_file_materialization_admission, 'admitted');
assert.equal(admitted.body.filesystem_executor_authority, 'cloudflare_site_file_store');
assert.equal(admitted.body.windows_filesystem_mutation_admission, 'not_admitted');
assert.equal(admitted.body.repository_publication_admission, 'not_admitted');
assert.equal(admitted.body.write_effect, 'cloudflare_site_file_materialization_record');

const listed = await postCarrier({
  operation: 'site_file_materialization.list',
  request_id: `site_file_materialization_list_${suffix}`,
  params: { site_id: siteId, site_file_materialization_limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.ok(listed.body.materializations.some((entry) => entry.materialization_id === materializationId));
assert.equal(listed.body.cloudflare_site_file_materialization_admission, 'admitted');
assert.equal(listed.body.windows_filesystem_mutation_admission, 'not_admitted');
assert.equal(listed.body.repository_publication_admission, 'not_admitted');
assert.equal(listed.body.authority_partition, 'site_file_materialization_cloudflare_owned_windows_filesystem_and_publication_not_admitted');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `site_file_materialization_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, site_file_materialization_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.ok(operationRead.body.site_file_materializations.some((entry) => entry.materialization_id === materializationId));
assert.ok(operationRead.body.operation_product_surface.site_file_materialization_count >= 1);
assert.equal(operationRead.body.operation_product_surface.site_file_materialization_authority, 'cloudflare_carrier_site');
assert.equal(operationRead.body.operation_product_surface.cloudflare_site_file_materialization_admission, 'admitted');
assert.equal(operationRead.body.operation_product_surface.cloudflare_site_file_materialization_executor_authority, 'cloudflare_site_file_store');
assert.equal(operationRead.body.operation_product_surface.windows_filesystem_mutation_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.site_file_materialization_repository_publication_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.site_file_materialization_authority_partition, 'site_file_materialization_cloudflare_owned_windows_filesystem_and_publication_not_admitted');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.site_file_materialization_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  materialization_id: materializationId,
  site_file_materialization_authority: admitted.body.site_file_materialization_authority,
  cloudflare_site_file_materialization_admission: admitted.body.cloudflare_site_file_materialization_admission,
  filesystem_executor_authority: admitted.body.filesystem_executor_authority,
  windows_filesystem_mutation_admission: admitted.body.windows_filesystem_mutation_admission,
  repository_publication_admission: admitted.body.repository_publication_admission,
  site_file_materialization_count: operationRead.body.operation_product_surface.site_file_materialization_count,
  site_file_materialization_authority_partition: operationRead.body.operation_product_surface.site_file_materialization_authority_partition,
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
  if (!existsSync(resolved)) throw new Error(`site_file_materialization_live_smoke_token_file_missing:${resolved}`);
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
