#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseSiteFileMaterializationReadArgs(argv = [], env = process.env) {
  return parseProductReadArgs(['--operation', 'site_file_materialization.list', ...argv], env);
}

export async function readSiteFileMaterialization(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.site_file_materialization_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeSiteFileMaterialization(product.response),
    response: product.response,
  };
}

export function summarizeSiteFileMaterialization(body = {}) {
  const materializations = Array.isArray(body?.materializations) ? body.materializations : [];
  const latest = materializations[0] ?? null;
  return {
    site_id: body?.site_id ?? null,
    materialization_count: materializations.length,
    site_file_materialization_authority: body?.site_file_materialization_authority ?? null,
    cloudflare_site_file_materialization_admission: body?.cloudflare_site_file_materialization_admission ?? null,
    filesystem_executor_authority: body?.filesystem_executor_authority ?? null,
    windows_filesystem_mutation_admission: body?.windows_filesystem_mutation_admission ?? null,
    repository_publication_admission: body?.repository_publication_admission ?? null,
    authority_partition: body?.authority_partition ?? null,
    latest_materialization_id: latest?.materialization_id ?? null,
    latest_proposal_id: latest?.proposal_id ?? latest?.record?.proposal_id ?? null,
    latest_file_path: latest?.file_path ?? latest?.record?.file_path ?? null,
    latest_write_effect: latest?.write_effect ?? latest?.record?.write_effect ?? null,
    latest_materialization_posture: latest?.materialization_posture ?? latest?.record?.materialization_posture ?? null,
    latest_recorded_at: latest?.recorded_at ?? latest?.created_at ?? null,
  };
}

export function formatSiteFileMaterializationReadText(result) {
  const summary = result?.summary ?? {};
  const lines = [
    'Site File Materialization Review: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Materializations: count=${summary.materialization_count ?? 0} authority=${summary.site_file_materialization_authority ?? 'unknown'} admission=${summary.cloudflare_site_file_materialization_admission ?? 'unknown'}`,
  ];
  if (summary.filesystem_executor_authority) lines.push(`Filesystem Executor: ${summary.filesystem_executor_authority}`);
  if (summary.windows_filesystem_mutation_admission || summary.repository_publication_admission) {
    lines.push(`Admissions: filesystem=${summary.windows_filesystem_mutation_admission ?? 'unknown'} repository_publication=${summary.repository_publication_admission ?? 'unknown'}`);
  }
  if (summary.authority_partition) lines.push(`Authority Partition: ${summary.authority_partition}`);
  if (summary.latest_materialization_id || summary.latest_file_path) {
    lines.push(
      `Latest Materialization: ${summary.latest_materialization_id ?? 'none'}`
      + `${summary.latest_proposal_id ? ` proposal=${summary.latest_proposal_id}` : ''}`
      + `${summary.latest_file_path ? ` file=${summary.latest_file_path}` : ''}`
      + `${summary.latest_write_effect ? ` effect=${summary.latest_write_effect}` : ''}`
      + `${summary.latest_materialization_posture ? ` posture=${summary.latest_materialization_posture}` : ''}`,
    );
  }
  if (summary.latest_recorded_at) lines.push(`Latest Recorded: ${summary.latest_recorded_at}`);
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseSiteFileMaterializationReadArgs(process.argv.slice(2));
    const result = await readSiteFileMaterialization(config);
    if (config.format === 'text') {
      process.stdout.write(formatSiteFileMaterializationReadText(result));
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
