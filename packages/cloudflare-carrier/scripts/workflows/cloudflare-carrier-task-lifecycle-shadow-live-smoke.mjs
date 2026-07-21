#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../../..');

export function parseTaskLifecycleShadowLiveSmokeArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const payloadFile = option(args, '--payload-file') ?? env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_PAYLOAD_FILE ?? '';
  const sourceUrl = option(args, '--source-url') ?? env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SOURCE_URL ?? '';
  const sourceToken = option(args, '--source-token') ?? env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SOURCE_TOKEN ?? '';
  const limit = Number(option(args, '--limit') ?? env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_LIMIT ?? 25);
  const readId = option(args, '--read-id') ?? null;
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('task_lifecycle_shadow_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`task_lifecycle_shadow_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('task_lifecycle_shadow_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('task_lifecycle_shadow_live_smoke_requires_site_id');
  if (!sourceUrl && !payloadFile) throw new Error('task_lifecycle_shadow_live_smoke_requires_--source-url_or_--payload-file');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    payloadFile,
    sourceUrl,
    sourceToken,
    limit,
    readId,
  };
}

export function formatTaskLifecycleShadowLiveSmokeText(result) {
  const lines = [
    `Task Lifecycle Shadow Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Read: ${result.read_id}`,
    `Mode: ${result.mode}`,
    `Tasks: recorded=${result.task_count ?? 0} listed=${result.listed_read_count ?? 0} operation_surface=${result.operation_surface_shadow_read_count ?? 0}`,
    `Authority: mutation=${result.mutation_authority ?? 'unknown'} cloudflare_write=${result.cloudflare_write_admission ?? 'unknown'}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
    `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runTaskLifecycleShadowLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const readId = config.readId ?? `task_lifecycle_shadow_live_${suffix}`;
  const recordRequest = config.sourceUrl
    ? {
        operation: 'task_lifecycle.shadow_read.source.read',
        request_id: `task_lifecycle_shadow_live_source_read_${suffix}`,
        params: {
          site_id: config.siteId,
          read_id: readId,
          source_url: config.sourceUrl,
          ...(config.sourceToken ? { source_token: config.sourceToken } : {}),
          limit: config.limit,
        },
      }
    : {
        operation: 'task_lifecycle.shadow_read.record',
        request_id: `task_lifecycle_shadow_live_record_${suffix}`,
        params: {
          site_id: config.siteId,
          read_id: readId,
          source_payload: readJsonFile(config.payloadFile),
        },
      };

  const recorded = await postCarrier(config, recordRequest, fetchImpl);
  assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
  assert.equal(recorded.body.ok, true);
  assert.match(recorded.body.status, /^(recorded|source_read_recorded)$/);
  assert.equal(recorded.body.site_id, config.siteId);
  assert.equal(recorded.body.shadow_mode, 'cloudflare_shadow_read');
  assert.equal(recorded.body.mutation_authority, 'windows_task_lifecycle_sqlite');
  assert.equal(recorded.body.cloudflare_write_admission, 'not_admitted');
  assert.equal(recorded.body.dispatch_authority, 'windows_primary_dispatcher');
  assert.equal(recorded.body.dispatch_action, 'none');

  const listed = await postCarrier(config, {
    operation: 'task_lifecycle.shadow_read.list',
    request_id: `task_lifecycle_shadow_live_list_${suffix}`,
    params: { site_id: config.siteId, limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.ok, true);
  const listedRead = listed.body.reads.find((entry) => entry.read_id === readId);
  assert.ok(listedRead, JSON.stringify(listed.body.reads));
  assert.equal(listedRead.mutation_authority, 'windows_task_lifecycle_sqlite');
  assert.equal(listedRead.cloudflare_write_admission, 'not_admitted');

  const siteRead = await postCarrier(config, {
    operation: 'site.read',
    request_id: `task_lifecycle_shadow_live_site_read_${suffix}`,
    params: { site_id: config.siteId, task_lifecycle_shadow_limit: 20 },
  }, fetchImpl);
  assert.equal(siteRead.http_status, 200, JSON.stringify(siteRead.body));
  assert.equal(siteRead.body.ok, true);
  assert.ok(siteRead.body.task_lifecycle_shadow_reads.some((entry) => entry.read_id === readId));

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `task_lifecycle_shadow_live_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, task_lifecycle_shadow_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.equal(operationRead.body.ok, true);
  assert.ok(operationRead.body.task_lifecycle_shadow_reads.some((entry) => entry.read_id === readId));
  assert.ok(operationRead.body.operation_product_surface.task_lifecycle_shadow_read_count >= 1);
  assert.ok(new Set([
    'windows_task_lifecycle_sqlite',
    'cloudflare_task_lifecycle_d1',
  ]).has(operationRead.body.operation_product_surface.task_lifecycle_mutation_authority), `unexpected shadow smoke mutation authority: ${operationRead.body.operation_product_surface.task_lifecycle_mutation_authority}`);
  assert.ok(new Set([
    'not_admitted',
    'task_create_admitted',
    'task_create_and_claim_admitted',
    'task_create_claim_and_report_admitted',
    'task_create_claim_report_finish_and_changed_file_evidence_admitted',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_admitted',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_admitted',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted',
    'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted',
  ]).has(operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission), `unexpected shadow smoke Cloudflare write admission: ${operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission}`);

  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_shadow_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    read_id: readId,
    mode: config.sourceUrl ? 'source_read' : 'payload_record',
    task_count: recorded.body.read.task_count,
    mutation_authority: recorded.body.mutation_authority,
    cloudflare_write_admission: recorded.body.cloudflare_write_admission,
    listed_read_count: listed.body.reads.length,
    operation_surface_shadow_read_count: operationRead.body.operation_product_surface.task_lifecycle_shadow_read_count,
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

function readJsonFile(filePath) {
  const resolved = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
  if (!existsSync(resolved)) throw new Error(`task_lifecycle_shadow_live_smoke_payload_file_missing:${resolved}`);
  return JSON.parse(readFileSync(resolved, 'utf8'));
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
  if (!existsSync(resolved)) throw new Error(`task_lifecycle_shadow_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath, env = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^[\"']|[\"']$/g, '');
    if (!(key in env)) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/g, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseTaskLifecycleShadowLiveSmokeArgs(process.argv.slice(2));
  const result = await runTaskLifecycleShadowLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatTaskLifecycleShadowLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
