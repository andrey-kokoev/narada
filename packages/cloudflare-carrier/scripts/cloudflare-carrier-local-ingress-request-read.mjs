#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

export function parseLocalIngressRequestReadArgs(argv = [], env = process.env) {
  const config = parseProductReadArgs(['--operation', 'local_ingress.request.list', ...argv], env);
  config.focusRequestId = option(argv, '--local-ingress-request-id') ?? env.CLOUDFLARE_CARRIER_LOCAL_INGRESS_REQUEST_ID ?? null;
  return config;
}

export async function readLocalIngressRequest(config, fetchImpl = fetch) {
  const requestProduct = await readProductSurface(config, fetchImpl);
  const evidenceProduct = await readProductSurface({
    ...config,
    operation: 'local_ingress.evidence.list',
    requestId: `${config.requestId}_evidence`,
    params: {
      site_id: config.params.site_id,
      ...(config.focusRequestId ? { local_ingress_request_id: config.focusRequestId } : {}),
    },
  }, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.local_ingress_request_read.v1',
    status: 'ok',
    worker_url: requestProduct.worker_url,
    auth_source: requestProduct.auth_source,
    operation: requestProduct.operation,
    params: requestProduct.params,
    summary: summarizeLocalIngressRequest(requestProduct.response, evidenceProduct.response, { focusRequestId: config.focusRequestId }),
    response: {
      requests: requestProduct.response,
      evidence: evidenceProduct.response,
    },
  };
}

export function summarizeLocalIngressRequest(body = {}, evidenceBody = {}, options = {}) {
  const focusRequestId = options?.focusRequestId ?? null;
  const requests = Array.isArray(body?.requests) ? body.requests : [];
  const focusedRequests = focusRequestId ? requests.filter((item) => item?.local_ingress_request_id === focusRequestId) : requests;
  const latestRequest = focusedRequests[0] ?? null;
  const evidence = Array.isArray(evidenceBody?.evidence) ? evidenceBody.evidence : [];
  const latestEvidence = latestRequest
    ? evidence.find((item) => item?.local_ingress_request_id === latestRequest.local_ingress_request_id) ?? null
    : null;
  return {
    site_id: body?.site_id ?? null,
    request_count: focusedRequests.length,
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
    latest_evidence_id: latestEvidence?.local_ingress_evidence_id ?? null,
    latest_local_execution_id: latestEvidence?.local_execution_id ?? null,
    latest_execution_status: latestEvidence?.local_execution_status ?? null,
    latest_evidence_posture: latestEvidence?.evidence_posture ?? null,
    current_posture: latestEvidence?.evidence_posture ?? (latestRequest ? 'request_only_pending_windows_execution' : null),
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
    `Current Posture: ${summary.current_posture ?? 'unknown'}`,
    `Admissions: direct_cloudflare_filesystem_mutation=${summary.direct_cloudflare_filesystem_mutation_admission ?? 'unknown'} repository_publication=${summary.repository_publication_admission ?? 'unknown'}`,
  ];
  if (summary.local_ingress_request_authority || summary.latest_request_authority || summary.authority_partition) {
    lines.push(`Authority: request=${summary.local_ingress_request_authority ?? summary.latest_request_authority ?? 'unknown'} partition=${summary.authority_partition ?? 'unknown'}`);
  }
  if (summary.latest_evidence_id || summary.latest_local_execution_id || summary.latest_execution_status) {
    lines.push(`Current Execution: evidence=${summary.latest_evidence_id ?? 'none'} local_execution=${summary.latest_local_execution_id ?? 'none'} status=${summary.latest_execution_status ?? 'unknown'}`);
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
