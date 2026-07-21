#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from '../read-models/cloudflare-carrier-product-read.mjs';

export function parseDirectiveDeliveryReviewArgs(argv = [], env = process.env) {
  const args = [...argv];
  const explicitOperationId =
    normalizeOptionalString(option(args, '--operation-id'))
    ?? normalizeOptionalString(option(args, '--carrier-operation'))
    ?? normalizeOptionalString(env.CLOUDFLARE_CARRIER_OPERATION_ID)
    ?? normalizeOptionalString(env.CLOUDFLARE_CARRIER_CARRIER_OPERATION)
    ?? null;
  const defaultOperation = explicitOperationId ? 'operation.read' : 'webhook_delay.directive.dual_record.list';
  const defaultDirectiveRecordLimit = explicitOperationId ? 20 : 200;
  const defaultDirectiveDeliveryLimit = explicitOperationId ? 20 : 200;
  const parsed = parseProductReadArgs(['--operation', defaultOperation, ...argv], env);
  const directiveRecordLimit = parseOptionalInteger(
    option(args, '--directive-record-limit') ?? env.CLOUDFLARE_CARRIER_WEBHOOK_DELAY_DIRECTIVE_LIMIT ?? null,
    'directive-record-limit',
  ) ?? defaultDirectiveRecordLimit;
  const directiveDeliveryLimit = parseOptionalInteger(
    option(args, '--directive-delivery-limit') ?? env.CLOUDFLARE_CARRIER_WEBHOOK_DELAY_DIRECTIVE_DELIVERY_LIMIT ?? null,
    'directive-delivery-limit',
  ) ?? defaultDirectiveDeliveryLimit;
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
  const baseProduct = await readProductSurface(config, fetchImpl);
  const operationProduct = config.operation === 'operation.read' ? baseProduct : null;
  const directiveRecordsProduct = config.operation === 'webhook_delay.directive.dual_record.list'
    ? baseProduct
    : await readProductSurface({
      ...config,
      operation: 'webhook_delay.directive.dual_record.list',
      params: {
        site_id: config.params.site_id ?? null,
        webhook_delay_directive_limit: config.params.webhook_delay_directive_limit,
      },
    }, fetchImpl);
  const siteId =
    operationProduct?.summary?.site_id
    ?? directiveRecordsProduct.summary?.site_id
    ?? config.params.site_id
    ?? null;
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
    worker_url: baseProduct.worker_url,
    auth_source: baseProduct.auth_source,
    operation: baseProduct.operation,
    params: baseProduct.params,
    summary: summarizeDirectiveDeliveryReview(
      operationProduct?.response,
      directiveRecordsProduct.response,
      directiveDeliveriesProduct.response,
      {
        operationSummary: operationProduct?.summary,
        focusRef: config.focusRef,
      },
    ),
    response: {
      operation: operationProduct?.response ?? null,
      directive_records: directiveRecordsProduct.response,
      directive_deliveries: directiveDeliveriesProduct.response,
    },
  };
}

export function summarizeDirectiveDeliveryReview(operationBody = {}, directiveRecordsBody = {}, directiveDeliveriesBody = {}, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  const directiveRecords = Array.isArray(directiveRecordsBody?.directive_records) ? directiveRecordsBody.directive_records : [];
  const directiveDeliveries = Array.isArray(directiveDeliveriesBody?.directive_deliveries) ? directiveDeliveriesBody.directive_deliveries : [];
  const explicitFocusRef = options.focusRef ?? null;
  const workflowFocusRef = operationSummary.workflow_focus_ref ?? null;
  const focusRef = explicitFocusRef ?? workflowFocusRef;
  const exactFocusedDirectiveRecord = focusRef
    ? directiveRecords.find((entry) => entry?.directive_record_id === focusRef) ?? null
    : null;
  if (explicitFocusRef && !exactFocusedDirectiveRecord) {
    throw new Error(`directive_delivery_review_focus_not_found:${focusRef}`);
  }
  const focusedDirectiveRecord = exactFocusedDirectiveRecord ?? directiveRecords[0] ?? null;
  const focusedDirectiveRecordId = focusedDirectiveRecord?.directive_record_id ?? focusRef ?? null;
  const focusedDirectiveRecords = exactFocusedDirectiveRecord ? [exactFocusedDirectiveRecord] : directiveRecords;
  const focusedDirectiveDeliveries = exactFocusedDirectiveRecord
    ? directiveDeliveries.filter((entry) => entry?.directive_record_id === focusedDirectiveRecordId)
    : directiveDeliveries;
  const focusedDirectiveDelivery = focusedDirectiveDeliveries[0] ?? null;
  const deliveredRecordIds = new Set(
    focusedDirectiveDeliveries
      .map((entry) => entry?.directive_record_id)
      .filter((value) => typeof value === 'string' && value.length > 0),
  );
  const undeliveredDirectiveRecords = focusedDirectiveRecords.filter((entry) => !deliveredRecordIds.has(entry?.directive_record_id));
  return {
    site_id: operationBody?.operation?.site_id ?? operationBody?.site_id ?? directiveRecordsBody?.site_id ?? directiveDeliveriesBody?.site_id ?? operationSummary.site_id ?? null,
    operation_id:
      operationBody?.operation?.operation_id
      ?? operationBody?.operation_id
      ?? operationSummary.operation_id
      ?? focusedDirectiveRecord?.operation_id
      ?? focusedDirectiveRecord?.carrier_operation_id
      ?? focusedDirectiveDelivery?.operation_id
      ?? focusedDirectiveDelivery?.carrier_operation_id
      ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? focusRef ?? null,
    directive_record_count: focusedDirectiveRecords.length,
    directive_delivery_count: focusedDirectiveDeliveries.length,
    focused_directive_record_id: focusedDirectiveRecordId,
    focused_delivery_id: focusedDirectiveDelivery?.delivery_id ?? null,
    focused_classification_state: focusedDirectiveRecord?.classification_state ?? null,
    focused_latest_delay_minutes: focusedDirectiveRecord?.latest_delay_minutes ?? null,
    focused_critical_minutes: focusedDirectiveRecord?.critical_minutes ?? null,
    focused_fallback_status: focusedDirectiveDelivery?.fallback_status ?? focusedDirectiveRecord?.fallback_status ?? null,
    focused_directive_action: focusedDirectiveRecord?.directive_action ?? null,
    focused_delivery_action: focusedDirectiveDelivery?.delivery_action ?? null,
    focused_directive_visibility:
      focusedDirectiveDelivery?.carrier_admission?.directive_visibility
      ?? focusedDirectiveRecord?.carrier_admission?.directive_visibility
      ?? focusedDirectiveRecord?.directive_intent?.input_event?.metadata?.directive?.visibility
      ?? null,
    focused_dispatch_to_provider:
      focusedDirectiveDelivery?.carrier_admission?.dispatch_to_provider
      ?? focusedDirectiveRecord?.carrier_admission?.dispatch_to_provider
      ?? null,
    focused_complete_without_provider:
      focusedDirectiveDelivery?.carrier_admission?.complete_without_provider
      ?? focusedDirectiveRecord?.carrier_admission?.complete_without_provider
      ?? null,
    focused_delivery_state: focusedDirectiveDelivery?.delivery_state ?? null,
    focused_delivery_ok: focusedDirectiveDelivery?.delivery_ok ?? null,
    undelivered_directive_record_count: undeliveredDirectiveRecords.length,
    latest_undelivered_directive_record_id: undeliveredDirectiveRecords[0]?.directive_record_id ?? null,
    directive_authority: directiveRecordsBody?.directive_authority ?? focusedDirectiveRecord?.directive_authority ?? null,
    delivery_authority: directiveDeliveriesBody?.directive_authority ?? focusedDirectiveDelivery?.directive_authority ?? null,
    dispatch_authority: focusedDirectiveDelivery?.dispatch_authority ?? null,
    fallback_authority: directiveRecordsBody?.fallback_authority ?? directiveDeliveriesBody?.fallback_authority ?? focusedDirectiveRecord?.fallback_authority ?? focusedDirectiveDelivery?.fallback_authority ?? null,
    latest_recorded_at: focusedDirectiveRecord?.recorded_at ?? focusedDirectiveRecords[0]?.recorded_at ?? null,
    latest_delivery_recorded_at: focusedDirectiveDelivery?.recorded_at ?? null,
  };
}

export function formatDirectiveDeliveryReviewText(result) {
  const summary = result?.summary ?? {};
  const hasSiteId = Boolean(summary.site_id);
  const actionableWorkflow = summary.workflow_next_action && summary.workflow_next_action !== 'none' && summary.workflow_next_action !== 'monitor_operation';
  const undeliveredLabel = summary.directive_record_count === 1
    && summary.focused_directive_record_id
    && summary.focused_directive_record_id === summary.latest_undelivered_directive_record_id
      ? 'focused_undelivered'
      : 'latest_undelivered';
  const lines = [
    'Directive Delivery Review: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Workflow Route: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'} focus=${summary.workflow_focus_ref ?? 'none'}`,
    `Directive Records: count=${summary.directive_record_count ?? 0} focused=${summary.focused_directive_record_id ?? 'none'} undelivered=${summary.undelivered_directive_record_count ?? 0} ${undeliveredLabel}=${summary.latest_undelivered_directive_record_id ?? 'none'}`,
    `Directive Deliveries: count=${summary.directive_delivery_count ?? 0} focused_delivery=${summary.focused_delivery_id ?? 'none'} state=${summary.focused_delivery_state ?? 'none'} ok=${summary.focused_delivery_ok ?? 'unknown'}`,
  ];
  if (summary.focused_directive_record_id || summary.focused_classification_state || summary.focused_latest_delay_minutes !== null) {
    lines.push(
      `Focused Directive: id=${summary.focused_directive_record_id ?? 'none'} classification=${summary.focused_classification_state ?? 'unknown'}`
      + ` delay=${summary.focused_latest_delay_minutes ?? 'unknown'} critical=${summary.focused_critical_minutes ?? 'unknown'}`
      + ` action=${summary.focused_directive_action ?? 'unknown'}`
      + ` visibility=${summary.focused_directive_visibility ?? 'unknown'}`,
    );
  }
  if (summary.focused_delivery_action || summary.focused_dispatch_to_provider !== null || summary.focused_complete_without_provider !== null) {
    lines.push(
      `Focused Admission: delivery_action=${summary.focused_delivery_action ?? 'none'}`
      + ` dispatch_to_provider=${summary.focused_dispatch_to_provider ?? 'unknown'}`
      + ` complete_without_provider=${summary.focused_complete_without_provider ?? 'unknown'}`,
    );
  }
  if (summary.directive_authority || summary.delivery_authority || summary.dispatch_authority || summary.fallback_authority) {
    lines.push(`Authority: record=${summary.directive_authority ?? 'unknown'} delivery=${summary.delivery_authority ?? 'unknown'} dispatch=${summary.dispatch_authority ?? 'unknown'} fallback=${summary.fallback_authority ?? 'unknown'}`);
  }
  if (summary.focused_fallback_status || summary.latest_recorded_at || summary.latest_delivery_recorded_at) {
    lines.push(`Timing: fallback=${summary.focused_fallback_status ?? 'unknown'} directive_recorded=${summary.latest_recorded_at ?? 'unknown'} delivery_recorded=${summary.latest_delivery_recorded_at ?? 'unknown'}`);
  }
  const workerUrl = result?.worker_url ?? null;
  if (workerUrl && hasSiteId) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && hasSiteId && summary.operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && hasSiteId && actionableWorkflow && summary.operation_id) {
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
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
