#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseRepositoryPublicationProviderLivenessReadArgs(argv = [], env = process.env) {
  return parseProductReadArgs(['--operation', 'repository_publication.provider_heartbeat.list', ...argv], env);
}

export async function readRepositoryPublicationProviderLiveness(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.repository_publication_provider_liveness_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeRepositoryPublicationProviderLiveness(product.response),
    response: product.response,
  };
}

export function summarizeRepositoryPublicationProviderLiveness(body = {}) {
  const liveness = body?.repository_publication_provider_liveness ?? {};
  const heartbeats = Array.isArray(body?.repository_publication_provider_heartbeats) ? body.repository_publication_provider_heartbeats : [];
  const latestHeartbeat = heartbeats[0] ?? null;
  const schedulerPosture = liveness?.scheduler_posture ?? {};
  return {
    site_id: body?.site_id ?? null,
    heartbeat_count: body?.repository_publication_provider_heartbeat_count ?? heartbeats.length,
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
  const lines = [
    'Repository Publication Provider Liveness: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Liveness: state=${summary.state ?? 'unknown'} next=${summary.next_action ?? 'none'} authority=${summary.provider_liveness_authority ?? 'unknown'}`,
    `Scheduler: state=${summary.scheduler_state ?? 'unknown'} task=${summary.scheduler_task_name ?? 'none'} interval=${summary.scheduler_interval_minutes ?? 'unknown'}`,
    `Provider: authority=${summary.provider_authority ?? 'unknown'} id=${summary.latest_provider_id ?? 'unknown'} embodiment=${summary.latest_provider_embodiment ?? 'unknown'} trigger=${summary.latest_refresh_trigger ?? 'unknown'}`,
    `Heartbeats: count=${summary.heartbeat_count ?? 0} latest=${summary.latest_heartbeat_id ?? 'none'} status=${summary.latest_status ?? 'unknown'}`,
  ];
  if (summary.latest_generated_at || summary.latest_last_run_at) {
    lines.push(`Latest Timing: generated=${summary.latest_generated_at ?? 'unknown'} last_run=${summary.latest_last_run_at ?? 'unknown'}`);
  }
  return `${lines.join('\n')}\n`;
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
