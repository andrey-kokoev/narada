#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseResidentLoopShadowLiveSmokeArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_RESIDENT_LOOP_SHADOW_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const loopRunId = option(args, '--loop-run-id') ?? null;
  const sourceSummaryPath = option(args, '--source-summary-path')
    ?? '.ai/operator-attention/operator_attention_operating-layer_pending_directive_stale_pending_directive_stale.json';
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('resident_loop_shadow_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`resident_loop_shadow_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('resident_loop_shadow_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('resident_loop_shadow_live_smoke_requires_site_id');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    loopRunId,
    sourceSummaryPath,
  };
}

export function formatResidentLoopShadowLiveSmokeText(result) {
  const lines = [
    `Resident Loop Shadow Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Loop Run: ${result.loop_run_id}`,
    `Loop Status: ${result.loop_status ?? 'unknown'}`,
    `Dispatch: authority=${result.dispatch_authority ?? 'unknown'} action=${result.dispatch_action ?? 'unknown'}`,
    `Shadow Mode: ${result.shadow_mode ?? 'unknown'}`,
    `Counts: listed=${result.listed_loop_run_count ?? 0} operation_surface=${result.operation_surface_shadow_run_count ?? 0}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
    `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runResidentLoopShadowLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const loopRunId = config.loopRunId ?? `resident_loop_shadow_live_${suffix}`;
  const loopRun = {
    operation_id: config.operationId,
    run_started_at: new Date().toISOString(),
    run_finished_at: new Date().toISOString(),
    status: 'shadow_recorded',
    steps: [{ step_id: 'live_shadow_record', status: 'ok' }],
    operator_attention: [{ attention_id: 'live_shadow_attention', severity: 'info' }],
  };

  const recorded = await postCarrier(config, {
    operation: 'resident_loop.shadow_read.record',
    request_id: `resident_loop_shadow_live_record_${suffix}`,
    params: {
      site_id: config.siteId,
      loop_run_id: loopRunId,
      source_summary_path: config.sourceSummaryPath,
      loop_run: loopRun,
    },
  }, fetchImpl);
  assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
  assert.equal(recorded.body.ok, true);
  assert.equal(recorded.body.status, 'recorded');
  assert.equal(recorded.body.site_id, config.siteId);
  assert.equal(recorded.body.shadow_mode, 'cloudflare_shadow_read');
  assert.equal(recorded.body.dispatch_authority, 'windows_primary_dispatcher');
  assert.equal(recorded.body.dispatch_action, 'none');
  assert.equal(recorded.body.loop_run.step_count, 1);
  assert.equal(recorded.body.loop_run.operator_attention_count, 1);

  const listed = await postCarrier(config, {
    operation: 'resident_loop.shadow_read.list',
    request_id: `resident_loop_shadow_live_list_${suffix}`,
    params: { site_id: config.siteId, limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.ok, true);
  const listedRun = listed.body.loop_runs.find((entry) => entry.loop_run_id === loopRunId);
  assert.ok(listedRun, JSON.stringify(listed.body.loop_runs));
  assert.equal(listedRun.loop_status, 'shadow_recorded');
  assert.equal(listedRun.dispatch_authority, 'windows_primary_dispatcher');
  assert.equal(listedRun.dispatch_action, 'none');

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `resident_loop_shadow_live_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, resident_loop_shadow_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.equal(operationRead.body.ok, true);
  assert.ok(operationRead.body.resident_loop_shadow_runs.some((entry) => entry.loop_run_id === loopRunId));
  assert.ok(operationRead.body.operation_product_surface.resident_loop_shadow_run_count >= 1);
  assert.equal(operationRead.body.operation_product_surface.dispatch_authority, 'windows_primary_dispatcher');

  return {
    schema: 'narada.cloudflare_carrier.resident_loop_shadow_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    loop_run_id: loopRunId,
    loop_status: recorded.body.loop_run?.status ?? loopRun.status,
    shadow_mode: recorded.body.shadow_mode,
    dispatch_authority: recorded.body.dispatch_authority,
    dispatch_action: recorded.body.dispatch_action,
    listed_loop_run_count: listed.body.loop_runs.length,
    operation_surface_shadow_run_count: operationRead.body.operation_product_surface.resident_loop_shadow_run_count,
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
  if (tokenFile) {
    return {
      kind: 'bearer',
      value: readTokenFile(tokenFile),
      source: tokenFile === env.CLOUDFLARE_CARRIER_TOKEN_FILE ? 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' : 'token-file',
    };
  }
  const token = option(args, '--token') ?? env.CLOUDFLARE_CARRIER_TOKEN ?? null;
  if (token) {
    return {
      kind: 'bearer',
      value: token,
      source: option(args, '--token') ? 'flag:--token' : 'env:CLOUDFLARE_CARRIER_TOKEN',
    };
  }
  return null;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`resident_loop_shadow_live_smoke_token_file_missing:${resolved}`);
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
    const value = trimmed.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, '');
    if (!(key in env)) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/g, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseResidentLoopShadowLiveSmokeArgs(process.argv.slice(2));
  const result = await runResidentLoopShadowLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatResidentLoopShadowLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
