#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseLocalIngressRequestReadArgs(argv = [], env = process.env) {
  return parseProductReadArgs(['--operation', 'local_ingress.request.list', ...argv], env);
}

export async function readLocalIngressRequest(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.local_ingress_request_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeLocalIngressRequest(product.response),
    response: product.response,
  };
}

export function summarizeLocalIngressRequest(body = {}) {
  const requests = Array.isArray(body?.requests) ? body.requests : [];
  const latestRequest = requests[0] ?? null;
  return {
    site_id: body?.site_id ?? null,
    request_count: requests.length,
    local_ingress_request_authority: body?.local_ingress_request_authority ?? null,
    local_executor_authority: body?.local_executor_authority ?? latestRequest?.local_executor_authority ?? null,
    local_execution_admission: body?.local_execution_admission ?? latestRequest?.local_execution_admission ?? null,
    direct_cloudflare_filesystem_mutation_admission: body?.direct_cloudflare_filesystem_mutation_admission ?? null,
    repository_publication_admission: body?.repository_publication_admission ?? null,
    authority_partition: body?.authority_partition ?? latestRequest?.authority_partition ?? null,
    latest_request_id: latestRequest?.local_ingress_request_id ?? null,
    latest_operation_id: latestRequest?.operation_id ?? null,
    latest_requested_action_ref: latestRequest?.requested_action_ref ?? null,
    latest_request_authority: latestRequest?.request_authority ?? null,
    latest_target_authority_locus: latestRequest?.target_authority_locus ?? null,
    latest_recorded_at: latestRequest?.recorded_at ?? null,
  };
}

export function formatLocalIngressRequestReadText(result) {
  const summary = result?.summary ?? {};
  const lines = [
    'Local Ingress Request Review: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Requests: count=${summary.request_count ?? 0} latest=${summary.latest_request_id ?? 'none'} action=${summary.latest_requested_action_ref ?? 'none'}`,
    `Execution: admission=${summary.local_execution_admission ?? 'unknown'} executor=${summary.local_executor_authority ?? 'unknown'} target=${summary.latest_target_authority_locus ?? 'unknown'}`,
    `Admissions: direct_cloudflare_filesystem_mutation=${summary.direct_cloudflare_filesystem_mutation_admission ?? 'unknown'} repository_publication=${summary.repository_publication_admission ?? 'unknown'}`,
  ];
  if (summary.local_ingress_request_authority || summary.latest_request_authority || summary.authority_partition) {
    lines.push(`Authority: request=${summary.local_ingress_request_authority ?? summary.latest_request_authority ?? 'unknown'} partition=${summary.authority_partition ?? 'unknown'}`);
  }
  if (summary.latest_operation_id || summary.latest_recorded_at) {
    lines.push(`Latest Request: operation=${summary.latest_operation_id ?? 'none'} recorded=${summary.latest_recorded_at ?? 'unknown'}`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseLocalIngressRequestReadArgs(process.argv.slice(2));
    const result = await readLocalIngressRequest(config);
    if (config.format === 'text') {
      process.stdout.write(formatLocalIngressRequestReadText(result));
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
