#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseOperationPersistenceReadArgs(argv = [], env = process.env) {
  return parseProductReadArgs(['--operation', 'operation.read', ...argv], env);
}

export async function readOperationPersistence(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.operation_persistence_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeOperationPersistence(product.response, { operationSummary: product.summary }),
    response: product.response,
  };
}

export function summarizeOperationPersistence(body = {}, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  const persistence = body?.cloudflare_persistence_posture ?? body?.operation_product_surface?.persistence_posture ?? null;
  const durableBoundaries = Array.isArray(persistence?.durable_boundaries) ? persistence.durable_boundaries : [];
  const missingBoundaries = Array.isArray(persistence?.missing_boundaries) ? persistence.missing_boundaries : [];
  const warnings = Array.isArray(persistence?.warnings) ? persistence.warnings : [];
  return {
    site_id: body?.operation?.site_id ?? body?.site_id ?? operationSummary.site_id ?? null,
    operation_id: body?.operation?.operation_id ?? body?.operation_id ?? operationSummary.operation_id ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_kind: operationSummary.workflow_focus_kind ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? null,
    current_status: operationSummary.current_status ?? body?.operation?.status ?? null,
    phase: operationSummary.phase ?? body?.operation_lifecycle_status?.phase ?? null,
    health: operationSummary.health ?? body?.operation_lifecycle_status?.health ?? null,
    lifecycle_next_action: operationSummary.next_action ?? body?.operation_lifecycle_status?.next_action ?? null,
    persistence_state: persistence?.state ?? operationSummary.persistence_state ?? null,
    persistence_active_boundary_count: persistence?.active_boundary_count ?? 0,
    persistence_durable_boundary_count: persistence?.durable_boundary_count ?? 0,
    persistence_missing_boundaries: missingBoundaries,
    persistence_warning_count: warnings.length,
    persistence_warnings: warnings,
    persistence_durable_boundary_keys: durableBoundaries.map((boundary) => boundary?.key).filter(Boolean),
    persistence_next_action: persistence?.next_action ?? null,
  };
}

export function formatOperationPersistenceReadText(result) {
  const summary = result?.summary ?? {};
  const lines = [
    'Operation Persistence Read: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Workflow Route: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'}`,
    `Lifecycle: phase=${summary.phase ?? 'unknown'} health=${summary.health ?? 'unknown'} status=${summary.current_status ?? 'unknown'}`,
    `Lifecycle Next: ${summary.lifecycle_next_action ?? 'none'}`,
    `Persistence: state=${summary.persistence_state ?? 'unknown'} active=${summary.persistence_active_boundary_count ?? 0} durable=${summary.persistence_durable_boundary_count ?? 0} warnings=${summary.persistence_warning_count ?? 0}`,
  ];
  if (summary.persistence_next_action || (summary.persistence_missing_boundaries?.length ?? 0) > 0 || (summary.persistence_warnings?.length ?? 0) > 0) {
    lines.push(`Persistence Next: action=${summary.persistence_next_action ?? 'none'} missing=${summary.persistence_missing_boundaries?.join(', ') || 'none'} warnings=${summary.persistence_warnings?.join(', ') || 'none'}`);
  }
  if ((summary.persistence_durable_boundary_keys?.length ?? 0) > 0) {
    lines.push(`Persistence Boundaries: ${summary.persistence_durable_boundary_keys.join(', ')}`);
  }
  const workflowHandoff = buildOperationPersistenceWorkflowHandoff(result, summary);
  if (workflowHandoff) {
    lines.push(`Workflow Handoff: ${workflowHandoff}`);
  }
  if (summary.operation_id) {
    lines.push(`Evidence Read: pnpm --filter @narada2/cloudflare-carrier product:operation:evidence:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Recovery Read: pnpm --filter @narada2/cloudflare-carrier product:operation:recovery:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

function buildOperationPersistenceWorkflowHandoff(result, summary) {
  const workerUrl = result?.worker_url ?? '<worker-url>';
  const siteId = summary.site_id ?? '<site-id>';
  const operationId = summary.operation_id ?? '<operation-id>';
  if (summary.workflow_next_action === 'review_recovery_posture') {
    return `pnpm --filter @narada2/cloudflare-carrier product:operation:recovery:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file>`;
  }
  if (summary.workflow_next_action === 'start_or_select_session') {
    return `pnpm --filter @narada2/cloudflare-carrier product:operation:session:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file> --execute-operation-session`;
  }
  if (summary.workflow_next_action === 'resume_operation_continuation') {
    return `pnpm --filter @narada2/cloudflare-carrier product:operation:continuation:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file> --execute-operation-continuation-resume`;
  }
  if (summary.workflow_next_action === 'refresh_site_continuity_loop') {
    return `pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity`;
  }
  if (summary.workflow_next_action === 'review_site_continuity_reconciliation_execution' && summary.workflow_focus_ref) {
    return `pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --focus-kind ${summary.workflow_focus_kind ?? 'site_continuity_reconciliation_execution'} --focus-ref ${summary.workflow_focus_ref} --operator-session-file <operator-session-file>`;
  }
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseOperationPersistenceReadArgs(process.argv.slice(2));
    const result = await readOperationPersistence(config);
    if (config.format === 'text') {
      process.stdout.write(formatOperationPersistenceReadText(result));
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
