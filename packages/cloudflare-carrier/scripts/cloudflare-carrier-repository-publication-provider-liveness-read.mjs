#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseRepositoryPublicationProviderLivenessReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const parsed = parseProductReadArgs(['--operation', 'repository_publication.provider_heartbeat.list', ...argv], env);
  return {
    ...parsed,
    focusHeartbeatId: normalizeOptionalString(
      option(args, '--repository-publication-provider-heartbeat-id')
      ?? option(args, '--focus-ref')
      ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_HEARTBEAT_ID
      ?? null,
    ),
  };
}

export async function readRepositoryPublicationProviderLiveness(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  const heartbeats = listRepositoryPublicationProviderHeartbeats(product.response);
  if (config.focusHeartbeatId && !heartbeats.some((entry) => entry?.repository_publication_provider_heartbeat_id === config.focusHeartbeatId)) {
    throw new Error(`repository_publication_provider_liveness_read_focus_not_found:${config.focusHeartbeatId}`);
  }
  return {
    schema: 'narada.cloudflare_carrier.repository_publication_provider_liveness_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeRepositoryPublicationProviderLiveness(product.response, { focusHeartbeatId: config.focusHeartbeatId }),
    response: product.response,
  };
}

export function summarizeRepositoryPublicationProviderLiveness(body = {}, options = {}) {
  const liveness = body?.repository_publication_provider_liveness ?? {};
  const heartbeats = listRepositoryPublicationProviderHeartbeats(body);
  const focusHeartbeatId = options?.focusHeartbeatId ?? null;
  const focusedHeartbeats = focusHeartbeatId
    ? heartbeats.filter((entry) => entry?.repository_publication_provider_heartbeat_id === focusHeartbeatId)
    : heartbeats;
  const latestHeartbeat = focusedHeartbeats[0] ?? null;
  const schedulerPosture = liveness?.scheduler_posture ?? {};
  return {
    site_id: body?.site_id ?? null,
    heartbeat_count: focusedHeartbeats.length,
    focused_repository_publication_provider_heartbeat_id: focusHeartbeatId ? (latestHeartbeat?.repository_publication_provider_heartbeat_id ?? focusHeartbeatId) : null,
    provider_liveness_authority: body?.provider_liveness_authority ?? null,
    state: liveness?.state ?? null,
    next_action: liveness?.next_action ?? null,
    provider_authority: liveness?.provider_authority ?? latestHeartbeat?.provider_authority ?? null,
    scheduler_state: schedulerPosture?.state ?? null,
    scheduler_task_name: schedulerPosture?.task_name ?? latestHeartbeat?.scheduler_task_name ?? null,
    scheduler_interval_minutes: schedulerPosture?.interval_minutes ?? latestHeartbeat?.scheduler_interval_minutes ?? null,
    latest_heartbeat_id: latestHeartbeat?.repository_publication_provider_heartbeat_id ?? null,
    latest_status: latestHeartbeat?.status ?? null,
    latest_generated_at: latestHeartbeat?.generated_at ?? null,
    latest_last_run_at: latestHeartbeat?.last_run_at ?? null,
    latest_provider_id: latestHeartbeat?.provider_id ?? null,
    latest_provider_embodiment: latestHeartbeat?.provider_embodiment ?? null,
    latest_refresh_trigger: latestHeartbeat?.provider_refresh_trigger ?? null,
  };
}

export function formatRepositoryPublicationProviderLivenessReadText(result) {
  const summary = result?.summary ?? {};
  const heartbeatLabel = summary.focused_repository_publication_provider_heartbeat_id ? 'focused' : 'latest';
  const timingLabel = summary.focused_repository_publication_provider_heartbeat_id ? 'Focused Timing' : 'Latest Timing';
  const lines = [
    'Repository Publication Provider Liveness: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Liveness: state=${summary.state ?? 'unknown'} next=${summary.next_action ?? 'none'} authority=${summary.provider_liveness_authority ?? 'unknown'}`,
    `Scheduler: state=${summary.scheduler_state ?? 'unknown'} task=${summary.scheduler_task_name ?? 'none'} interval=${summary.scheduler_interval_minutes ?? 'unknown'}`,
    `Provider: authority=${summary.provider_authority ?? 'unknown'} id=${summary.latest_provider_id ?? 'unknown'} embodiment=${summary.latest_provider_embodiment ?? 'unknown'} trigger=${summary.latest_refresh_trigger ?? 'unknown'}`,
    `Heartbeats: count=${summary.heartbeat_count ?? 0} ${heartbeatLabel}=${summary.latest_heartbeat_id ?? 'none'} status=${summary.latest_status ?? 'unknown'}`,
  ];
  if (summary.latest_generated_at || summary.latest_last_run_at) {
    lines.push(`${timingLabel}: generated=${summary.latest_generated_at ?? 'unknown'} last_run=${summary.latest_last_run_at ?? 'unknown'}`);
  }
  return `${lines.join('\n')}\n`;
}

function listRepositoryPublicationProviderHeartbeats(body = {}) {
  if (Array.isArray(body?.repository_publication_provider_heartbeats)) return body.repository_publication_provider_heartbeats;
  return [];
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseRepositoryPublicationProviderLivenessReadArgs(process.argv.slice(2));
    const result = await readRepositoryPublicationProviderLiveness(config);
    if (config.format === 'text') {
      process.stdout.write(formatRepositoryPublicationProviderLivenessReadText(result));
    } else if (config.format === 'summary') {
      process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response }, null, 2) + '\n');
    process.exit(1);
  }
}
