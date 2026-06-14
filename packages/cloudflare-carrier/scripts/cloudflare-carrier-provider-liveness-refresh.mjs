#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseProviderLivenessRefreshArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  if (flag(args, '--help') || args[0] === 'help') {
    return { help: true };
  }

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_PROVIDER_LIVENESS_REFRESH_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const localRoot = resolvePath(option(args, '--local-root') ?? env.NARADA_LOCAL_SITE_ROOT ?? repoRoot);
  const refreshTrigger = option(args, '--refresh-trigger') ?? env.NARADA_PROVIDER_LIVENESS_REFRESH_TRIGGER ?? 'operator_refresh_unspecified';
  const schedulerTaskName = option(args, '--scheduler-task-name') ?? env.NARADA_PROVIDER_LIVENESS_SCHEDULER_TASK_NAME ?? null;
  const schedulerIntervalMinutes = parseOptionalPositiveInt(
    option(args, '--scheduler-interval-minutes') ?? env.NARADA_PROVIDER_LIVENESS_SCHEDULER_INTERVAL_MINUTES ?? null,
  );
  const includeLocalIngress = !flag(args, '--skip-local-ingress');
  const includeRepository = !flag(args, '--skip-repository');
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('provider_liveness_refresh_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`provider_liveness_refresh_unknown_format:${format}`);
  if (!auth) throw new Error('provider_liveness_refresh_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('provider_liveness_refresh_requires_site_id');
  if (!includeLocalIngress && !includeRepository) throw new Error('provider_liveness_refresh_requires_at_least_one_provider');

  return {
    help: false,
    workerUrl,
    format,
    auth,
    siteId,
    localRoot,
    refreshTrigger,
    schedulerTaskName,
    schedulerIntervalMinutes,
    includeLocalIngress,
    includeRepository,
  };
}

export function formatProviderLivenessRefreshText(result) {
  const lines = [
    `Provider Liveness Refresh: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Local Root: path=${result.local_root?.path ?? 'unknown'} state=${result.local_root?.state ?? 'unknown'} ok=${result.local_root?.ok === true ? 'yes' : 'no'}`,
    `Refresh Source: trigger=${result.refresh_source?.provider_refresh_trigger ?? 'unknown'} scheduler=${result.refresh_source?.scheduler_task_name ?? 'none'} interval_minutes=${result.refresh_source?.scheduler_interval_minutes ?? 'none'}`,
    `Providers: count=${result.provider_count ?? 0}`,
  ];
  for (const provider of result.providers ?? []) {
    lines.push(`- ${provider.provider}: status=${provider.status ?? 'unknown'} http=${provider.http_status ?? 'unknown'}`);
  }
  lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
  if ((result.providers ?? []).some((provider) => provider.provider === 'local_ingress')) {
    lines.push(`Local Ingress Provider Liveness: pnpm --filter @narada2/cloudflare-carrier product:local-ingress:provider-liveness:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
  }
  if ((result.providers ?? []).some((provider) => provider.provider === 'repository_publication')) {
    lines.push(`Repository Publication Provider Liveness: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:provider-liveness:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runProviderLivenessRefresh(config, { fetchImpl = fetch } = {}) {
  const localRootStatus = inspectLocalRoot(config.localRoot);
  const generatedAt = new Date().toISOString();
  const suffix = generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14);
  const refreshSource = buildRefreshSource(config);
  const results = [];

  if (config.includeLocalIngress) {
    const response = await postCarrier(config, {
      operation: 'local_ingress.provider_heartbeat.put',
      request_id: `local_ingress_provider_heartbeat_${suffix}`,
      params: {
        site_id: config.siteId,
        local_ingress_provider_heartbeat_id: `local-ingress-provider-heartbeat-${safeToken(config.siteId)}-${suffix}`,
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
    }, fetchImpl);
    assert.equal(response.http_status, 200, JSON.stringify(response.body));
    assert.notEqual(response.body.ok, false, JSON.stringify(response.body));
    assert.equal(response.body.direct_cloudflare_filesystem_mutation_admission, 'not_admitted');
    assert.equal(response.body.repository_publication_admission, 'not_admitted');
    results.push({
      provider: 'local_ingress',
      http_status: response.http_status,
      status: response.body.heartbeat?.status ?? null,
      response: response.body,
    });
  }

  if (config.includeRepository) {
    const response = await postCarrier(config, {
      operation: 'repository_publication.provider_heartbeat.put',
      request_id: `repository_publication_provider_heartbeat_${suffix}`,
      params: {
        site_id: config.siteId,
        repository_publication_provider_heartbeat_id: `repository-publication-provider-heartbeat-${safeToken(config.siteId)}-${suffix}`,
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
    }, fetchImpl);
    assert.equal(response.http_status, 200, JSON.stringify(response.body));
    assert.notEqual(response.body.ok, false, JSON.stringify(response.body));
    assert.equal(response.body.heartbeat?.cloudflare_git_push_admission, 'not_admitted');
    assert.equal(response.body.heartbeat?.direct_cloudflare_repository_mutation_admission, 'not_admitted');
    results.push({
      provider: 'repository_publication',
      http_status: response.http_status,
      status: response.body.heartbeat?.status ?? null,
      response: response.body,
    });
  }

  return {
    schema: 'narada.cloudflare_carrier.provider_liveness_refresh.v1',
    status: results.every((result) => result.http_status === 200 && result.status === 'ready') ? 'ok' : 'needs_attention',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    local_root: localRootStatus,
    refresh_source: refreshSource,
    provider_count: results.length,
    providers: results.map((result) => ({ provider: result.provider, status: result.status, http_status: result.http_status })),
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

function inspectLocalRoot(path) {
  try {
    const info = statSync(path);
    return { path, ok: info.isDirectory(), state: info.isDirectory() ? 'directory_available' : 'not_directory' };
  } catch (error) {
    return { path, ok: false, state: 'missing', error: error?.code ?? String(error) };
  }
}

function buildRefreshSource(config) {
  return {
    schema: 'narada.cloudflare_carrier.provider_liveness_refresh_source.v1',
    provider_refresh_trigger: config.refreshTrigger,
    scheduler_task_name: config.schedulerTaskName || null,
    scheduler_interval_minutes: config.schedulerIntervalMinutes,
  };
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

function flag(args, name) {
  return args.includes(name);
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

function safeToken(value) {
  return String(value ?? 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

if (process.argv[1] === scriptPath) {
  const config = parseProviderLivenessRefreshArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`Usage: node scripts/cloudflare-carrier-provider-liveness-refresh.mjs [options]\n\nRecords Cloudflare-visible liveness for local Windows providers.\n\nOptions:\n  --url <url>              Cloudflare carrier URL, or CLOUDFLARE_CARRIER_URL\n  --token <token>          Bearer token, or CLOUDFLARE_CARRIER_TOKEN\n  --token-file <path>      Bearer token file, or CLOUDFLARE_CARRIER_TOKEN_FILE\n  --operator-session-cookie <value>  Operator session cookie\n  --operator-session-file <path>     Operator session file\n  --format <json|text>     Output format, default json\n  --site <site-id>         Site id, default CLOUDFLARE_CARRIER_SITE_ID or site_narada_cloudflare\n  --local-root <path>      Local site root that proves local provider presence, default repo root\n  --refresh-trigger <id>   Refresh source, default NARADA_PROVIDER_LIVENESS_REFRESH_TRIGGER or operator_refresh_unspecified\n  --scheduler-task-name <name>  Windows task name when invoked by Task Scheduler\n  --scheduler-interval-minutes <n> Expected scheduler cadence when invoked by Task Scheduler\n  --skip-local-ingress     Do not record local ingress provider liveness\n  --skip-repository        Do not record repository publication provider liveness\n`);
    process.exit(0);
  }
  const result = await runProviderLivenessRefresh(config);
  if (config.format === 'text') {
    process.stdout.write(formatProviderLivenessRefreshText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
