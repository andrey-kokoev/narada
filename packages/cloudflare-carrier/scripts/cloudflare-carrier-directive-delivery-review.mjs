#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseDirectiveDeliveryReviewArgs(argv = [], env = process.env) {
  const args = [...argv];
  const parsed = parseProductReadArgs(['--operation', 'operation.read', ...argv], env);
  const directiveRecordLimit = parseOptionalInteger(
    option(args, '--directive-record-limit') ?? env.CLOUDFLARE_CARRIER_WEBHOOK_DELAY_DIRECTIVE_LIMIT ?? null,
    'directive-record-limit',
  ) ?? 20;
  const directiveDeliveryLimit = parseOptionalInteger(
    option(args, '--directive-delivery-limit') ?? env.CLOUDFLARE_CARRIER_WEBHOOK_DELAY_DIRECTIVE_DELIVERY_LIMIT ?? null,
    'directive-delivery-limit',
  ) ?? 20;
  const focusRef = normalizeOptionalString(
    option(args, '--focus-ref') ?? env.CLOUDFLARE_CARRIER_DIRECTIVE_RECORD_FOCUS_REF ?? null,
  );
  return {
    ...parsed,
    focusRef,
    params: {
      ...parsed.params,
      webhook_delay_directive_limit: directiveRecordLimit,
      webhook_delay_directive_delivery_limit: directiveDeliveryLimit,
    },
  };
}

export async function readDirectiveDeliveryReview(config, fetchImpl = fetch) {
  const operationProduct = await readProductSurface(config, fetchImpl);
  const siteId = operationProduct.summary?.site_id ?? config.params.site_id ?? null;
  const directiveRecordsProduct = await readProductSurface({
    ...config,
    operation: 'webhook_delay.directive.dual_record.list',
    params: {
      site_id: siteId,
      webhook_delay_directive_limit: config.params.webhook_delay_directive_limit,
    },
  }, fetchImpl);
  const directiveDeliveriesProduct = await readProductSurface({
    ...config,
    operation: 'webhook_delay.directive.primary_with_fallback.list',
    params: {
      site_id: siteId,
      webhook_delay_directive_delivery_limit: config.params.webhook_delay_directive_delivery_limit,
    },
  }, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.directive_delivery_review.v1',
    status: 'ok',
    worker_url: operationProduct.worker_url,
    auth_source: operationProduct.auth_source,
    operation: operationProduct.operation,
    params: operationProduct.params,
    summary: summarizeDirectiveDeliveryReview(
      operationProduct.response,
      directiveRecordsProduct.response,
      directiveDeliveriesProduct.response,
      {
        operationSummary: operationProduct.summary,
        focusRef: config.focusRef,
      },
    ),
    response: {
      operation: operationProduct.response,
      directive_records: directiveRecordsProduct.response,
      directive_deliveries: directiveDeliveriesProduct.response,
    },
  };
}

export function summarizeDirectiveDeliveryReview(operationBody = {}, directiveRecordsBody = {}, directiveDeliveriesBody = {}, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  const directiveRecords = Array.isArray(directiveRecordsBody?.directive_records) ? directiveRecordsBody.directive_records : [];
  const directiveDeliveries = Array.isArray(directiveDeliveriesBody?.directive_deliveries) ? directiveDeliveriesBody.directive_deliveries : [];
  const focusRef = options.focusRef ?? operationSummary.workflow_focus_ref ?? null;
  const focusedDirectiveRecord = directiveRecords.find((entry) => entry?.directive_record_id === focusRef) ?? directiveRecords[0] ?? null;
  const focusedDirectiveRecordId = focusedDirectiveRecord?.directive_record_id ?? focusRef ?? null;
  const focusedDirectiveDelivery = directiveDeliveries.find((entry) => entry?.directive_record_id === focusedDirectiveRecordId) ?? null;
  const deliveredRecordIds = new Set(
    directiveDeliveries
      .map((entry) => entry?.directive_record_id)
      .filter((value) => typeof value === 'string' && value.length > 0),
  );
  const undeliveredDirectiveRecords = directiveRecords.filter((entry) => !deliveredRecordIds.has(entry?.directive_record_id));
  return {
    site_id: operationBody?.operation?.site_id ?? operationBody?.site_id ?? directiveRecordsBody?.site_id ?? directiveDeliveriesBody?.site_id ?? operationSummary.site_id ?? null,
    operation_id: operationBody?.operation?.operation_id ?? operationBody?.operation_id ?? operationSummary.operation_id ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? focusRef ?? null,
    directive_record_count: directiveRecords.length,
    directive_delivery_count: directiveDeliveries.length,
    focused_directive_record_id: focusedDirectiveRecordId,
    focused_delivery_id: focusedDirectiveDelivery?.delivery_id ?? null,
    focused_classification_state: focusedDirectiveRecord?.classification_state ?? null,
    focused_latest_delay_minutes: focusedDirectiveRecord?.latest_delay_minutes ?? null,
    focused_critical_minutes: focusedDirectiveRecord?.critical_minutes ?? null,
    focused_fallback_status: focusedDirectiveDelivery?.fallback_status ?? focusedDirectiveRecord?.fallback_status ?? null,
    focused_delivery_state: focusedDirectiveDelivery?.delivery_state ?? null,
    focused_delivery_ok: focusedDirectiveDelivery?.delivery_ok ?? null,
    undelivered_directive_record_count: undeliveredDirectiveRecords.length,
    latest_undelivered_directive_record_id: undeliveredDirectiveRecords[0]?.directive_record_id ?? null,
    directive_authority: directiveRecordsBody?.directive_authority ?? focusedDirectiveRecord?.directive_authority ?? null,
    delivery_authority: directiveDeliveriesBody?.directive_authority ?? focusedDirectiveDelivery?.directive_authority ?? null,
    dispatch_authority: focusedDirectiveDelivery?.dispatch_authority ?? null,
    fallback_authority: directiveRecordsBody?.fallback_authority ?? directiveDeliveriesBody?.fallback_authority ?? focusedDirectiveRecord?.fallback_authority ?? focusedDirectiveDelivery?.fallback_authority ?? null,
    latest_recorded_at: focusedDirectiveRecord?.recorded_at ?? directiveRecords[0]?.recorded_at ?? null,
    latest_delivery_recorded_at: focusedDirectiveDelivery?.recorded_at ?? null,
  };
}

export function formatDirectiveDeliveryReviewText(result) {
  const summary = result?.summary ?? {};
  const lines = [
    'Directive Delivery Review: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Workflow: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'} focus=${summary.workflow_focus_ref ?? 'none'}`,
    `Directive Records: count=${summary.directive_record_count ?? 0} undelivered=${summary.undelivered_directive_record_count ?? 0} latest_undelivered=${summary.latest_undelivered_directive_record_id ?? 'none'}`,
    `Directive Deliveries: count=${summary.directive_delivery_count ?? 0} focused_delivery=${summary.focused_delivery_id ?? 'none'} state=${summary.focused_delivery_state ?? 'none'} ok=${summary.focused_delivery_ok ?? 'unknown'}`,
  ];
  if (summary.focused_directive_record_id || summary.focused_classification_state || summary.focused_latest_delay_minutes !== null) {
    lines.push(`Focused Directive: id=${summary.focused_directive_record_id ?? 'none'} classification=${summary.focused_classification_state ?? 'unknown'} delay=${summary.focused_latest_delay_minutes ?? 'unknown'} critical=${summary.focused_critical_minutes ?? 'unknown'}`);
  }
  if (summary.directive_authority || summary.delivery_authority || summary.dispatch_authority || summary.fallback_authority) {
    lines.push(`Authority: record=${summary.directive_authority ?? 'unknown'} delivery=${summary.delivery_authority ?? 'unknown'} dispatch=${summary.dispatch_authority ?? 'unknown'} fallback=${summary.fallback_authority ?? 'unknown'}`);
  }
  if (summary.focused_fallback_status || summary.latest_recorded_at || summary.latest_delivery_recorded_at) {
    lines.push(`Timing: fallback=${summary.focused_fallback_status ?? 'unknown'} directive_recorded=${summary.latest_recorded_at ?? 'unknown'} delivery_recorded=${summary.latest_delivery_recorded_at ?? 'unknown'}`);
  }
  return `${lines.join('\n')}\n`;
}

function option(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function parseOptionalInteger(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw new Error(`directive_delivery_review_invalid_${label}`);
  return parsed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseDirectiveDeliveryReviewArgs(process.argv.slice(2));
    const result = await readDirectiveDeliveryReview(config);
    if (config.format === 'text') {
      process.stdout.write(formatDirectiveDeliveryReviewText(result));
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
