#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

export function parseLocalIngressEvidenceReadArgs(argv = [], env = process.env) {
  const config = parseProductReadArgs(['--operation', 'local_ingress.evidence.list', ...argv], env);
  const focusRequestId = option(argv, '--local-ingress-request-id') ?? env.CLOUDFLARE_CARRIER_LOCAL_INGRESS_REQUEST_ID ?? null;
  if (focusRequestId) config.params.local_ingress_request_id = focusRequestId;
  return config;
}

export async function readLocalIngressEvidence(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.local_ingress_evidence_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeLocalIngressEvidence(product.response),
    response: product.response,
  };
}

export function summarizeLocalIngressEvidence(body = {}) {
  const evidence = Array.isArray(body?.evidence) ? body.evidence : [];
  const latestEvidence = evidence[0] ?? null;
  return {
    site_id: body?.site_id ?? null,
    evidence_count: evidence.length,
    local_ingress_evidence_authority: body?.local_ingress_evidence_authority ?? null,
    cloudflare_evidence_store_authority: body?.cloudflare_evidence_store_authority ?? null,
    local_filesystem_mutation_admission: body?.local_filesystem_mutation_admission ?? latestEvidence?.local_filesystem_mutation_admission ?? null,
    direct_cloudflare_filesystem_mutation_admission: body?.direct_cloudflare_filesystem_mutation_admission ?? null,
    repository_publication_admission: body?.repository_publication_admission ?? null,
    authority_partition: body?.authority_partition ?? null,
    latest_evidence_id: latestEvidence?.local_ingress_evidence_id ?? null,
    latest_request_id: latestEvidence?.local_ingress_request_id ?? null,
    latest_local_execution_id: latestEvidence?.local_execution_id ?? null,
    latest_status: latestEvidence?.local_execution_status ?? null,
    latest_executor_authority: latestEvidence?.local_executor_authority ?? null,
    latest_windows_admission_action: latestEvidence?.windows_admission_action ?? null,
    latest_windows_admission_reason: latestEvidence?.windows_admission_reason ?? null,
    latest_changed_file_count: latestEvidence?.changed_file_count ?? latestEvidence?.evidence?.changed_files?.length ?? 0,
    latest_rollback_evidence_ref: latestEvidence?.rollback_evidence_ref ?? null,
    latest_recorded_at: latestEvidence?.recorded_at ?? null,
    latest_evidence_posture: latestEvidence?.evidence_posture ?? null,
  };
}

export function formatLocalIngressEvidenceReadText(result) {
  const summary = result?.summary ?? {};
  const windowsAdmission = [summary.latest_windows_admission_action, summary.latest_windows_admission_reason].filter(Boolean).join(' / ');
  const lines = [
    'Local Ingress Evidence Review: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Evidence: count=${summary.evidence_count ?? 0} latest=${summary.latest_evidence_id ?? 'none'} status=${summary.latest_status ?? 'unknown'}`,
    `Execution: request=${summary.latest_request_id ?? 'none'} local_execution=${summary.latest_local_execution_id ?? 'none'} executor=${summary.latest_executor_authority ?? 'unknown'}`,
    `Admissions: windows=${windowsAdmission || 'none'} local_filesystem_mutation=${summary.local_filesystem_mutation_admission ?? 'unknown'}`,
    `Changed Files: count=${summary.latest_changed_file_count ?? 0} rollback=${summary.latest_rollback_evidence_ref ?? 'none'}`,
    `Cloudflare Boundaries: evidence_store=${summary.cloudflare_evidence_store_authority ?? 'unknown'} direct_cloudflare_filesystem_mutation=${summary.direct_cloudflare_filesystem_mutation_admission ?? 'unknown'} repository_publication=${summary.repository_publication_admission ?? 'unknown'}`,
  ];
  if (summary.local_ingress_evidence_authority || summary.authority_partition || summary.latest_evidence_posture) {
    lines.push(`Authority: evidence=${summary.local_ingress_evidence_authority ?? 'unknown'} posture=${summary.latest_evidence_posture ?? 'unknown'} partition=${summary.authority_partition ?? 'unknown'}`);
  }
  if (summary.latest_recorded_at) {
    lines.push(`Latest Evidence: recorded=${summary.latest_recorded_at}`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseLocalIngressEvidenceReadArgs(process.argv.slice(2));
    const result = await readLocalIngressEvidence(config);
    if (config.format === 'text') {
      process.stdout.write(formatLocalIngressEvidenceReadText(result));
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
