#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseWebhookDelayShadowReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const parsed = parseProductReadArgs(['--operation', 'operation.read', ...argv], env);
  const shadowReadLimit = parseOptionalInteger(
    option(args, '--shadow-read-limit') ?? env.CLOUDFLARE_CARRIER_WEBHOOK_DELAY_SHADOW_LIMIT ?? null,
    'shadow-read-limit',
  ) ?? 20;
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
  const operationProduct = await readProductSurface(config, fetchImpl);
  const siteId = operationProduct.summary?.site_id ?? config.params.site_id ?? null;
  const shadowReadProduct = await readProductSurface({
    ...config,
    operation: 'webhook_delay.shadow_read.list',
    params: {
      site_id: siteId,
      webhook_delay_shadow_limit: config.params.webhook_delay_shadow_limit,
    },
  }, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.webhook_delay_shadow_read.v1',
    status: 'ok',
    worker_url: operationProduct.worker_url,
    auth_source: operationProduct.auth_source,
    operation: operationProduct.operation,
    params: operationProduct.params,
    summary: summarizeWebhookDelayShadow(
      operationProduct.response,
      shadowReadProduct.response,
      {
        operationSummary: operationProduct.summary,
        focusRef: config.focusRef,
      },
    ),
    response: {
      operation: operationProduct.response,
      shadow_reads: shadowReadProduct.response,
    },
  };
}

export function summarizeWebhookDelayShadow(operationBody = {}, shadowReadBody = {}, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  const observations = Array.isArray(shadowReadBody?.observations) ? shadowReadBody.observations : [];
  const focusRef = options.focusRef ?? operationSummary.workflow_focus_ref ?? null;
  const focusedObservation = observations.find((entry) => entry?.observation_id === focusRef) ?? observations[0] ?? null;
  return {
    site_id: operationBody?.operation?.site_id ?? operationBody?.site_id ?? shadowReadBody?.site_id ?? operationSummary.site_id ?? null,
    operation_id: operationBody?.operation?.operation_id ?? operationBody?.operation_id ?? operationSummary.operation_id ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? focusRef ?? null,
    observation_count: shadowReadBody?.observation_count ?? observations.length,
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
  const lines = [
    'Webhook Delay Shadow Read: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Workflow: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'} focus=${summary.workflow_focus_ref ?? 'none'}`,
    `Observations: count=${summary.observation_count ?? 0} focused=${summary.focused_observation_id ?? 'none'} classification=${summary.focused_classification_state ?? 'unknown'}`,
    `Dispatch: authority=${summary.focused_dispatch_authority ?? 'unknown'} action=${summary.focused_dispatch_action ?? 'unknown'}`,
  ];
  if (summary.focused_generated_at || summary.focused_source_summary_path) {
    lines.push(`Focused Timing: generated=${summary.focused_generated_at ?? 'unknown'} source=${summary.focused_source_summary_path ?? 'unknown'}`);
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
