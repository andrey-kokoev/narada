#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseWebhookDelayShadowReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const explicitOperationId =
    normalizeOptionalString(option(args, '--operation-id'))
    ?? normalizeOptionalString(option(args, '--carrier-operation'))
    ?? normalizeOptionalString(env.CLOUDFLARE_CARRIER_OPERATION_ID)
    ?? normalizeOptionalString(env.CLOUDFLARE_CARRIER_CARRIER_OPERATION)
    ?? null;
  const defaultOperation = explicitOperationId ? 'operation.read' : 'webhook_delay.shadow_read.list';
  const defaultShadowReadLimit = explicitOperationId ? 20 : 200;
  const parsed = parseProductReadArgs(['--operation', defaultOperation, ...argv], env);
  const shadowReadLimit = parseOptionalInteger(
    option(args, '--shadow-read-limit') ?? env.CLOUDFLARE_CARRIER_WEBHOOK_DELAY_SHADOW_LIMIT ?? null,
    'shadow-read-limit',
  ) ?? defaultShadowReadLimit;
  const focusRef = normalizeOptionalString(
    option(args, '--focus-ref') ?? env.CLOUDFLARE_CARRIER_WEBHOOK_DELAY_SHADOW_FOCUS_REF ?? null,
  );
  return {
    ...parsed,
    focusRef,
    params: {
      ...parsed.params,
      webhook_delay_shadow_limit: shadowReadLimit,
    },
  };
}

export async function readWebhookDelayShadow(config, fetchImpl = fetch) {
  const baseProduct = await readProductSurface(config, fetchImpl);
  const operationProduct = config.operation === 'operation.read' ? baseProduct : null;
  const shadowReadProduct = config.operation === 'webhook_delay.shadow_read.list'
    ? baseProduct
    : await readProductSurface({
      ...config,
      operation: 'webhook_delay.shadow_read.list',
      params: {
        site_id: config.params.site_id ?? null,
        webhook_delay_shadow_limit: config.params.webhook_delay_shadow_limit,
      },
    }, fetchImpl);
  const siteId =
    operationProduct?.summary?.site_id
    ?? shadowReadProduct.summary?.site_id
    ?? config.params.site_id
    ?? null;
  return {
    schema: 'narada.cloudflare_carrier.webhook_delay_shadow_read.v1',
    status: 'ok',
    worker_url: baseProduct.worker_url,
    auth_source: baseProduct.auth_source,
    operation: baseProduct.operation,
    params: baseProduct.params,
    summary: summarizeWebhookDelayShadow(
      operationProduct?.response,
      shadowReadProduct.response,
      {
        operationSummary: operationProduct?.summary,
        focusRef: config.focusRef,
      },
    ),
    response: {
      operation: operationProduct?.response ?? null,
      shadow_reads: shadowReadProduct.response,
    },
  };
}

export function summarizeWebhookDelayShadow(operationBody = {}, shadowReadBody = {}, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  const observations = Array.isArray(shadowReadBody?.observations) ? shadowReadBody.observations : [];
  const explicitFocusRef = options.focusRef ?? null;
  const workflowFocusRef = operationSummary.workflow_focus_ref ?? null;
  const focusRef = explicitFocusRef ?? workflowFocusRef;
  const exactFocusedObservation = focusRef
    ? observations.find((entry) => entry?.observation_id === focusRef) ?? null
    : null;
  if (explicitFocusRef && !exactFocusedObservation) {
    throw new Error(`webhook_delay_shadow_read_focus_not_found:${focusRef}`);
  }
  const focusedObservation = exactFocusedObservation ?? observations[0] ?? null;
  const focusedObservations = exactFocusedObservation ? [exactFocusedObservation] : observations;
  return {
    site_id: operationBody?.operation?.site_id ?? operationBody?.site_id ?? shadowReadBody?.site_id ?? operationSummary.site_id ?? null,
    operation_id:
      operationBody?.operation?.operation_id
      ?? operationBody?.operation_id
      ?? operationSummary.operation_id
      ?? focusedObservation?.operation_id
      ?? focusedObservation?.carrier_operation_id
      ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? focusRef ?? null,
    observation_count: focusedObservations.length,
    focused_observation_id: focusedObservation?.observation_id ?? focusRef ?? null,
    focused_classification_state: focusedObservation?.classification_state ?? null,
    focused_dispatch_authority: focusedObservation?.dispatch_authority ?? null,
    focused_dispatch_action: focusedObservation?.dispatch_action ?? null,
    focused_source_summary_path: focusedObservation?.source_summary_path ?? null,
    focused_generated_at: focusedObservation?.generated_at ?? null,
  };
}

export function formatWebhookDelayShadowReadText(result) {
  const summary = result?.summary ?? {};
  const workerUrl = result?.worker_url ?? null;
  const actionableWorkflow = summary.workflow_next_action && summary.workflow_next_action !== 'none' && summary.workflow_next_action !== 'monitor_operation';
  const lines = [
    'Webhook Delay Shadow Read: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Workflow Route: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'} focus=${summary.workflow_focus_ref ?? 'none'}`,
    `Observations: count=${summary.observation_count ?? 0} focused=${summary.focused_observation_id ?? 'none'} classification=${summary.focused_classification_state ?? 'unknown'}`,
    `Dispatch: authority=${summary.focused_dispatch_authority ?? 'unknown'} action=${summary.focused_dispatch_action ?? 'unknown'}`,
  ];
  if (summary.focused_generated_at || summary.focused_source_summary_path) {
    lines.push(`Focused Timing: generated=${summary.focused_generated_at ?? 'unknown'} source=${summary.focused_source_summary_path ?? 'unknown'}`);
  }
  if (workerUrl && summary.site_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  if (workerUrl && summary.operation_id && summary.site_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && actionableWorkflow && summary.operation_id && summary.site_id) {
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  return `${lines.join('\n')}\n`;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function parseOptionalInteger(value, name) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`webhook_delay_shadow_read_invalid_${name}`);
  }
  return parsed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseWebhookDelayShadowReadArgs(process.argv.slice(2));
    const result = await readWebhookDelayShadow(config);
    if (config.format === 'text') {
      process.stdout.write(formatWebhookDelayShadowReadText(result));
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
