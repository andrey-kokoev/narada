#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
loadLocalEnv(join(repoRoot, '.env'));

if (flag('--help') || args[0] === 'help') {
  process.stdout.write(`Usage: node scripts/cloudflare-carrier-provider-liveness-refresh.mjs [options]\n\nRecords Cloudflare-visible liveness for local Windows providers.\n\nOptions:\n  --url <url>              Cloudflare carrier URL, or CLOUDFLARE_CARRIER_URL\n  --token <token>          Bearer token, or CLOUDFLARE_CARRIER_TOKEN\n  --token-file <path>      Bearer token file, or CLOUDFLARE_CARRIER_TOKEN_FILE\n  --site <site-id>         Site id, default CLOUDFLARE_CARRIER_SITE_ID or site_narada_cloudflare\n  --local-root <path>      Local site root that proves local provider presence, default repo root\n  --refresh-trigger <id>   Refresh source, default NARADA_PROVIDER_LIVENESS_REFRESH_TRIGGER or operator_refresh_unspecified\n  --scheduler-task-name <name>  Windows task name when invoked by Task Scheduler\n  --scheduler-interval-minutes <n> Expected scheduler cadence when invoked by Task Scheduler\n  --skip-local-ingress     Do not record local ingress provider liveness\n  --skip-repository        Do not record repository publication provider liveness\n`);
  process.exit(0);
}

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const bearerToken = option('--token') ?? (tokenFile ? readTokenFile(tokenFile) : process.env.CLOUDFLARE_CARRIER_TOKEN ?? '');
const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
const localRoot = resolvePath(option('--local-root') ?? process.env.NARADA_LOCAL_SITE_ROOT ?? repoRoot);
const refreshTrigger = option('--refresh-trigger') ?? process.env.NARADA_PROVIDER_LIVENESS_REFRESH_TRIGGER ?? 'operator_refresh_unspecified';
const schedulerTaskName = option('--scheduler-task-name') ?? process.env.NARADA_PROVIDER_LIVENESS_SCHEDULER_TASK_NAME ?? null;
const schedulerIntervalMinutes = parseOptionalPositiveInt(option('--scheduler-interval-minutes') ?? process.env.NARADA_PROVIDER_LIVENESS_SCHEDULER_INTERVAL_MINUTES ?? null);
const includeLocalIngress = !flag('--skip-local-ingress');
const includeRepository = !flag('--skip-repository');

if (!workerUrl) throw new Error('provider_liveness_refresh_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('provider_liveness_refresh_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('provider_liveness_refresh_requires_site_id');
if (!includeLocalIngress && !includeRepository) throw new Error('provider_liveness_refresh_requires_at_least_one_provider');

const localRootStatus = inspectLocalRoot(localRoot);
const generatedAt = new Date().toISOString();
const suffix = generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14);
const refreshSource = buildRefreshSource();
const results = [];

if (includeLocalIngress) {
  const response = await postCarrier({
    operation: 'local_ingress.provider_heartbeat.put',
    request_id: `local_ingress_provider_heartbeat_${suffix}`,
    params: {
      site_id: siteId,
      local_ingress_provider_heartbeat_id: `local-ingress-provider-heartbeat-${safeToken(siteId)}-${suffix}`,
      generated_at: generatedAt,
      last_run_at: generatedAt,
      provider_id: 'windows_local_ingress_executor',
      provider_authority: 'windows_local_ingress_executor',
      provider_embodiment: 'windows_current_user_local_ingress_executor',
      provider_refresh_trigger: refreshSource.provider_refresh_trigger,
      scheduler_task_name: refreshSource.scheduler_task_name,
      scheduler_interval_minutes: refreshSource.scheduler_interval_minutes,
      status: localRootStatus.ok ? 'ready' : 'failed',
      evidence_record_status: localRootStatus.ok ? 'local_root_available' : 'local_root_unavailable',
      completed_execution_count: 0,
      refused_execution_count: localRootStatus.ok ? 0 : 1,
      resolved_execution_count: 0,
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
    },
  });
  assert.equal(response.http_status, 200, JSON.stringify(response.body));
  assert.notEqual(response.body.ok, false, JSON.stringify(response.body));
  assert.equal(response.body.direct_cloudflare_filesystem_mutation_admission, 'not_admitted');
  assert.equal(response.body.repository_publication_admission, 'not_admitted');
  results.push({ provider: 'local_ingress', http_status: response.http_status, status: response.body.heartbeat?.status ?? null, response: response.body });
}

if (includeRepository) {
  const response = await postCarrier({
    operation: 'repository_publication.provider_heartbeat.put',
    request_id: `repository_publication_provider_heartbeat_${suffix}`,
    params: {
      site_id: siteId,
      repository_publication_provider_heartbeat_id: `repository-publication-provider-heartbeat-${safeToken(siteId)}-${suffix}`,
      generated_at: generatedAt,
      last_run_at: generatedAt,
      provider_id: 'windows_repository_publication_drain_loop',
      provider_authority: 'windows_repository_publication_executor',
      provider_embodiment: 'windows_current_user_startup_provider',
      provider_refresh_trigger: refreshSource.provider_refresh_trigger,
      scheduler_task_name: refreshSource.scheduler_task_name,
      scheduler_interval_minutes: refreshSource.scheduler_interval_minutes,
      status: localRootStatus.ok ? 'ready' : 'failed',
      max_cycles: 0,
      iteration_count: 0,
      completed_publication_count: 0,
      refused_publication_count: localRootStatus.ok ? 0 : 1,
      resolved_publication_count: 0,
      drained: true,
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
    },
  });
  assert.equal(response.http_status, 200, JSON.stringify(response.body));
  assert.notEqual(response.body.ok, false, JSON.stringify(response.body));
  assert.equal(response.body.heartbeat?.cloudflare_git_push_admission, 'not_admitted');
  assert.equal(response.body.heartbeat?.direct_cloudflare_repository_mutation_admission, 'not_admitted');
  results.push({ provider: 'repository_publication', http_status: response.http_status, status: response.body.heartbeat?.status ?? null, response: response.body });
}

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.provider_liveness_refresh.v1',
  status: results.every((result) => result.http_status === 200 && result.status === 'ready') ? 'ok' : 'needs_attention',
  worker_url: workerUrl,
  site_id: siteId,
  local_root: localRootStatus,
  refresh_source: refreshSource,
  provider_count: results.length,
  providers: results.map((result) => ({ provider: result.provider, status: result.status, http_status: result.http_status })),
}, null, 2)}\n`);

async function postCarrier(body) {
  const response = await fetch(`${workerUrl}/api/carrier`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function inspectLocalRoot(path) {
  try {
    const info = statSync(path);
    return { path, ok: info.isDirectory(), state: info.isDirectory() ? 'directory_available' : 'not_directory' };
  } catch (error) {
    return { path, ok: false, state: 'missing', error: error?.code ?? String(error) };
  }
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(name) {
  return args.includes(name);
}

function buildRefreshSource() {
  return {
    schema: 'narada.cloudflare_carrier.provider_liveness_refresh_source.v1',
    provider_refresh_trigger: refreshTrigger,
    scheduler_task_name: schedulerTaskName || null,
    scheduler_interval_minutes: schedulerIntervalMinutes,
  };
}

function parseOptionalPositiveInt(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = resolvePath(tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`provider_liveness_refresh_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(repoRoot, path);
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

function safeToken(value) {
  return String(value ?? 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
