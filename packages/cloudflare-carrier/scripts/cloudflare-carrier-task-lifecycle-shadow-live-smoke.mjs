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
const payloadFile = option('--payload-file') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_PAYLOAD_FILE ?? '';
const sourceUrl = option('--source-url') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SOURCE_URL ?? '';
const sourceToken = option('--source-token') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SOURCE_TOKEN ?? '';
const limit = Number(option('--limit') ?? process.env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_LIMIT ?? 25);

if (!workerUrl) throw new Error('task_lifecycle_shadow_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('task_lifecycle_shadow_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('task_lifecycle_shadow_live_smoke_requires_site_id');
if (!sourceUrl && !payloadFile) throw new Error('task_lifecycle_shadow_live_smoke_requires_--source-url_or_--payload-file');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const readId = option('--read-id') ?? `task_lifecycle_shadow_live_${suffix}`;
const recordRequest = sourceUrl
  ? {
      operation: 'task_lifecycle.shadow_read.source.read',
      request_id: `task_lifecycle_shadow_live_source_read_${suffix}`,
      params: {
        site_id: siteId,
        read_id: readId,
        source_url: sourceUrl,
        ...(sourceToken ? { source_token: sourceToken } : {}),
        limit,
      },
    }
  : {
      operation: 'task_lifecycle.shadow_read.record',
      request_id: `task_lifecycle_shadow_live_record_${suffix}`,
      params: {
        site_id: siteId,
        read_id: readId,
        source_payload: readJsonFile(payloadFile),
      },
    };

const recorded = await postCarrier(recordRequest);
assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
assert.equal(recorded.body.ok, true);
assert.match(recorded.body.status, /^(recorded|source_read_recorded)$/);
assert.equal(recorded.body.site_id, siteId);
assert.equal(recorded.body.shadow_mode, 'cloudflare_shadow_read');
assert.equal(recorded.body.mutation_authority, 'windows_task_lifecycle_sqlite');
assert.equal(recorded.body.cloudflare_write_admission, 'not_admitted');
assert.equal(recorded.body.dispatch_authority, 'windows_primary_dispatcher');
assert.equal(recorded.body.dispatch_action, 'none');

const listed = await postCarrier({
  operation: 'task_lifecycle.shadow_read.list',
  request_id: `task_lifecycle_shadow_live_list_${suffix}`,
  params: { site_id: siteId, limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.equal(listed.body.ok, true);
const listedRead = listed.body.reads.find((entry) => entry.read_id === readId);
assert.ok(listedRead, JSON.stringify(listed.body.reads));
assert.equal(listedRead.mutation_authority, 'windows_task_lifecycle_sqlite');
assert.equal(listedRead.cloudflare_write_admission, 'not_admitted');

const siteRead = await postCarrier({
  operation: 'site.read',
  request_id: `task_lifecycle_shadow_live_site_read_${suffix}`,
  params: { site_id: siteId, task_lifecycle_shadow_limit: 20 },
});
assert.equal(siteRead.http_status, 200, JSON.stringify(siteRead.body));
assert.equal(siteRead.body.ok, true);
assert.ok(siteRead.body.task_lifecycle_shadow_reads.some((entry) => entry.read_id === readId));

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `task_lifecycle_shadow_live_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, task_lifecycle_shadow_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.equal(operationRead.body.ok, true);
assert.ok(operationRead.body.task_lifecycle_shadow_reads.some((entry) => entry.read_id === readId));
assert.ok(operationRead.body.operation_product_surface.task_lifecycle_shadow_read_count >= 1);
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_mutation_authority, 'windows_task_lifecycle_sqlite');
assert.equal(operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission, 'not_admitted');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.task_lifecycle_shadow_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  read_id: readId,
  mode: sourceUrl ? 'source_read' : 'payload_record',
  task_count: recorded.body.read.task_count,
  mutation_authority: recorded.body.mutation_authority,
  cloudflare_write_admission: recorded.body.cloudflare_write_admission,
  listed_read_count: listed.body.reads.length,
  operation_surface_shadow_read_count: operationRead.body.operation_product_surface.task_lifecycle_shadow_read_count,
}, null, 2)}\n`);

async function postCarrier(body) {
  const response = await fetch(`${workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readJsonFile(filePath) {
  const resolved = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
  if (!existsSync(resolved)) throw new Error(`task_lifecycle_shadow_live_smoke_payload_file_missing:${resolved}`);
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`task_lifecycle_shadow_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/g, '');
}
