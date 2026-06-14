#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseOperationRecoveryReadArgs(argv = [], env = process.env) {
  return parseProductReadArgs(['--operation', 'operation.read', ...argv], env);
}

export async function readOperationRecovery(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.operation_recovery_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeOperationRecovery(product.response, { operationSummary: product.summary }),
    response: product.response,
  };
}

export function summarizeOperationRecovery(body = {}, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  return {
    site_id: body?.operation?.site_id ?? body?.site_id ?? operationSummary.site_id ?? null,
    operation_id: body?.operation?.operation_id ?? body?.operation_id ?? operationSummary.operation_id ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? null,
    current_status: operationSummary.current_status ?? body?.operation?.status ?? null,
    phase: operationSummary.phase ?? body?.operation_lifecycle_status?.phase ?? null,
    health: operationSummary.health ?? body?.operation_lifecycle_status?.health ?? null,
    lifecycle_next_action: operationSummary.next_action ?? body?.operation_lifecycle_status?.next_action ?? null,
    recovery_state: operationSummary.recovery_state ?? null,
    recovery_boundary_count: operationSummary.recovery_boundary_count ?? 0,
    recovery_boundary_keys: Array.isArray(operationSummary.recovery_boundary_keys) ? operationSummary.recovery_boundary_keys : [],
    recovery_gap_count: operationSummary.recovery_gap_count ?? 0,
    recovery_gap_keys: Array.isArray(operationSummary.recovery_gap_keys) ? operationSummary.recovery_gap_keys : [],
    recovery_next_action: operationSummary.recovery_next_action ?? null,
  };
}

export function formatOperationRecoveryReadText(result) {
  const summary = result?.summary ?? {};
  const lines = [
    'Operation Recovery Read: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Workflow Route: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'}`,
    `Lifecycle: phase=${summary.phase ?? 'unknown'} health=${summary.health ?? 'unknown'} status=${summary.current_status ?? 'unknown'}`,
    `Lifecycle Next: ${summary.lifecycle_next_action ?? 'none'}`,
    `Recovery: state=${summary.recovery_state ?? 'unknown'} boundaries=${summary.recovery_boundary_count ?? 0} gaps=${summary.recovery_gap_count ?? 0}`,
  ];
  if (summary.recovery_next_action || (summary.recovery_gap_keys?.length ?? 0) > 0) {
    lines.push(`Recovery Next: action=${summary.recovery_next_action ?? 'none'} gaps=${summary.recovery_gap_keys?.join(', ') || 'none'}`);
  }
  if ((summary.recovery_boundary_keys?.length ?? 0) > 0) {
    lines.push(`Recovery Boundaries: ${summary.recovery_boundary_keys.join(', ')}`);
  }
  if ((summary.recovery_gap_keys?.length ?? 0) > 0) {
    lines.push(`Recovery Gaps: ${summary.recovery_gap_keys.join(', ')}`);
  }
  if (summary.operation_id) {
    lines.push(`Persistence Read: pnpm --filter @narada2/cloudflare-carrier product:operation:persistence:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Evidence Read: pnpm --filter @narada2/cloudflare-carrier product:operation:evidence:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseOperationRecoveryReadArgs(process.argv.slice(2));
    const result = await readOperationRecovery(config);
    if (config.format === 'text') {
      process.stdout.write(formatOperationRecoveryReadText(result));
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
