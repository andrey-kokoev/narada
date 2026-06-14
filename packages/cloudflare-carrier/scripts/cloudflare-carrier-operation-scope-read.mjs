#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseOperationScopeReadArgs(argv = [], env = process.env) {
  return parseProductReadArgs(['--operation', 'operation.read', ...argv], env);
}

export async function readOperationScope(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.operation_scope_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeOperationScope(product.response),
    response: product.response,
  };
}

export function summarizeOperationScope(body = {}) {
  const operation = body?.operation ?? {};
  const lifecycle = body?.operation_lifecycle_status ?? {};
  const workflow = body?.operation_workflow_route ?? body?.operation_product_surface?.workflow_route ?? {};
  const statusHistory = body?.operation_status_history ?? body?.operation_product_surface?.status_history ?? {};
  return {
    site_id: operation?.site_id ?? body?.site_id ?? null,
    operation_id: operation?.operation_id ?? body?.operation_id ?? null,
    operation_kind: operation?.operation_kind ?? null,
    current_status: statusHistory?.current_status ?? operation?.status ?? null,
    scope_loaded: Boolean(operation?.operation_id ?? body?.operation_id),
    phase: lifecycle?.phase ?? null,
    health: lifecycle?.health ?? null,
    next_action: lifecycle?.next_action ?? null,
    workflow_next_action: workflow?.next_action ?? null,
    workflow_reason: workflow?.reason ?? null,
    session_count: lifecycle?.session_count ?? 0,
    task_count: lifecycle?.task_count ?? 0,
    persistence_state: body?.cloudflare_persistence_posture?.state ?? null,
    recovery_state: body?.cloudflare_recovery_posture?.state ?? null,
  };
}

export function formatOperationScopeReadText(result) {
  const summary = result?.summary ?? {};
  const actionableWorkflow = summary.workflow_next_action && summary.workflow_next_action !== 'none' && summary.workflow_next_action !== 'monitor_operation';
  const lines = [
    'Operation Scope: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Scope Loaded: ${summary.scope_loaded ? 'yes' : 'no'}`,
    `Lifecycle: status=${summary.current_status ?? 'unknown'} phase=${summary.phase ?? 'unknown'} health=${summary.health ?? 'unknown'} next=${summary.next_action ?? 'none'}`,
    `Workflow: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'}`,
    `Inventory: sessions=${summary.session_count ?? 0} tasks=${summary.task_count ?? 0}`,
    `Durability: persistence=${summary.persistence_state ?? 'unknown'} recovery=${summary.recovery_state ?? 'unknown'}`,
  ];
  if (summary.operation_kind) {
    lines.splice(5, 0, `Kind: ${summary.operation_kind}`);
  }
  if (summary.operation_id && summary.site_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
  }
  if (actionableWorkflow && summary.operation_id && summary.site_id) {
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseOperationScopeReadArgs(process.argv.slice(2));
    const result = await readOperationScope(config);
    if (config.format === 'text') {
      process.stdout.write(formatOperationScopeReadText(result));
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
